'use strict';

const crypto = require('crypto');
const express = require('express');

const PlatformChoiceQuery = require('../models/PlatformChoiceQuery');
const Prediction = require('../models/Prediction');
const DesiredBranchQuery = require('../models/DesiredBranchQuery');
const { callAppApi, AppApiError } = require('../config/appApi');
const { clearSessionCookie } = require('../services/appSession');
const requireAppSession = require('../middleware/appSession');
const { sameOriginGuard } = require('../middleware/sameOrigin');
const { hitRateLimit } = require('../services/rateLimiter');
const { ensureDbConnection } = require('../config/db');

const config = require('../platformChoice/config');
const engine = require('../platformChoice/engine');
const { PlatformChoiceError, CODES, STATUS_BY_CODE } = require('../platformChoice/errors');

const router = express.Router();

/**
 * Platform Choice Recommender API (Feature 06) — recommends three
 * coaching/revision platforms for the signed-in student from a configurable
 * rule/scoring matrix (server/platformChoice/config.js — platforms, strengths
 * and weights are editable without touching this file or the UI).
 *
 * Auth: the student's App session, exactly like the predictor surface
 * (identity = req.appSession.user.id). The recommendation is assembled
 * server-side from data the system already holds:
 *  - Mini CCT analysis (subject ranking + weak concept tags) — App API,
 *    fetched with the student's own token (its free-user gating therefore
 *    applies: free users' concept tags are stripped upstream and never reach
 *    this server either);
 *  - Desired branch + predictor exam — this server's own collections;
 *  - Previous resource — App onboarding profile (/auth/me), offered as a
 *    prefill the student confirms.
 *
 * Persist-before-serve (Prediction convention): every served recommendation
 * is stored first; a failed write serves nothing.
 */

const RECOMMEND_WINDOW_MS = 60 * 60 * 1000;
const RECOMMEND_MAX_PER_USER = 60;

/** Best-effort DB access: never block the response on a slow database. */
function withDbBestEffort(work, fallback = null) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), 1500);
    const settle = (value) => {
      clearTimeout(timer);
      resolve(value === undefined ? fallback : value);
    };
    ensureDbConnection().then(
      async () => {
        try {
          settle(await work());
        } catch {
          settle(fallback);
        }
      },
      () => settle(fallback)
    );
  });
}

/**
 * App API call that degrades to `fallback` on upstream failure (Render cold
 * start, local backend down…). A 401 is NOT degradable — the session is dead
 * and the caller must re-authenticate, so it re-throws for sendAppError.
 */
async function appApiBestEffort(req, path, fallback = null) {
  try {
    return await callAppApi(path, { userToken: req.appSession.token, requestId: req.requestId });
  } catch (error) {
    if (error instanceof AppApiError && error.status === 401) throw error;
    console.warn('[platform-choice] App API degraded', {
      requestId: req.requestId,
      path,
      status: error instanceof AppApiError ? error.status : null,
    });
    return fallback;
  }
}

function sendAppError(res, error, requestId) {
  if (error instanceof AppApiError && error.status === 401) {
    clearSessionCookie(res);
    return res.status(401).json({
      msg: 'Your session has expired. Please log in again.',
      code: 'APP_SESSION_REQUIRED',
    });
  }
  console.error('[platform-choice] Unexpected error', {
    requestId,
    message: error && error.message,
    name: error && error.name,
  });
  return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
}

function sendPlatformChoiceError(res, error) {
  if (!(error instanceof PlatformChoiceError)) {
    console.error('[platform-choice] Unexpected error', { message: error && error.message });
    return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
  }
  return res.status(STATUS_BY_CODE[error.code] || 400).json({
    msg: error.message,
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
    ...(Array.isArray(error.suggestions) && error.suggestions.length ? { suggestions: error.suggestions } : {}),
  });
}

/** sha256 of the canonical JSON of the stored stages. */
function hashResult(stages) {
  return crypto.createHash('sha256').update(JSON.stringify(stages)).digest('hex');
}

// ---- Shared context assembly (GET /context and POST /recommend) ---------------

/**
 * Load the server-side context for the signed-in student. Every source is
 * best-effort EXCEPT a dead session (App API 401), which must fail the
 * request. Returns:
 *  {
 *    miniCct: deriveMiniCctSignals output | null,
 *    desiredBranch: display string | null,
 *    predictorExam: 'NEET_PG' | 'INI_CET' | null,
 *    previousResource: resource id | null,   (confirmed by the student in the form)
 *    isFreeUser: boolean | null
 *  }
 */
async function loadStudentContext(req) {
  const me = await appApiBestEffort(req, '/auth/me', null);

  let miniCct = null;
  const history = await appApiBestEffort(req, '/mini-cct/attempts?limit=1', null);
  const latest = history && Array.isArray(history.attempts) ? history.attempts[0] : null;
  if (latest && latest._id) {
    const analysis = await appApiBestEffort(req, `/mini-cct/attempts/${latest._id}/analysis`, null);
    miniCct = engine.deriveMiniCctSignals(analysis);
  }

  const dbDerived = await withDbBestEffort(async () => {
    const [desired, prediction] = await Promise.all([
      DesiredBranchQuery.findOne({ userId: req.appSession.user.id })
        .sort({ createdAt: -1 })
        .select('exam input.branch createdAt')
        .lean(),
      Prediction.findOne({ userId: req.appSession.user.id })
        .sort({ createdAt: -1 })
        .select('exam createdAt')
        .lean(),
    ]);
    // The NEWEST intent wins across both predictor collections.
    let desiredBranch = desired && desired.input && desired.input.branch ? desired.input.branch.display : null;
    let predictorExam = prediction ? prediction.exam : null;
    if (desired && prediction && desired.createdAt > prediction.createdAt) predictorExam = desired.exam;
    return { desiredBranch, predictorExam };
  }, { desiredBranch: null, predictorExam: null });

  return {
    miniCct,
    desiredBranch: dbDerived.desiredBranch,
    predictorExam: dbDerived.predictorExam,
    previousResource: me ? engine.derivePreviousResource(me) : null,
    isFreeUser: me ? me.isFreeUser === true : null,
  };
}

router.use(requireAppSession);
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sameOriginGuard(req, res, next);
  return next();
});

// ---- GET /context — form config + prefills from existing data ----------------

router.get('/context', async (req, res) => {
  let context;
  try {
    context = await loadStudentContext(req);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }

  const latest = await withDbBestEffort(async () => {
    const doc = await PlatformChoiceQuery.findOne({ userId: req.appSession.user.id })
      .sort({ createdAt: -1 })
      .lean();
    if (!doc) return null;
    return {
      recommendationId: String(doc._id),
      createdAt: doc.createdAt,
      exam: doc.exam,
      tiers: Array.isArray(doc.result && doc.result.tiers)
        ? doc.result.tiers.map((t) => ({
            tier: t.tier,
            tierLabel: t.tierLabel,
            platformName: t.platform ? t.platform.name : null,
            matchScore: t.matchScore,
          }))
        : [],
    };
  }, null);

  const prefilledExam = context.predictorExam
    ? config.examById(context.predictorExam) || null
    : null;
  const autofillSession = prefilledExam ? prefilledExam.defaultSession : config.EXAMS[0].defaultSession;

  const notes = [];
  if (!prefilledExam || (prefilledExam.id !== 'NEET_PG' && prefilledExam.id !== 'INI_CET')) {
    notes.push(
      'Your exam could not be pre-filled from your predictor history — NEET PG and INI-CET usage are auto-detected; FMGE and UPSC CMS are chosen here.'
    );
  }

  return res.json({
    config: {
      methodVersion: config.METHOD_VERSION,
      exams: config.EXAMS.map((exam) => ({
        id: exam.id,
        label: exam.label,
        defaultSession: exam.defaultSession,
        sessions: exam.sessions,
        note: exam.note,
      })),
      resourceOptions: config.RESOURCE_OPTIONS,
      subjects: engine.subjectPickerOptions(),
      studyHours: config.STUDY_HOURS,
      weights: config.WEIGHTS,
      factorLabels: config.FACTOR_LABELS,
    },
    autofill: {
      exam: prefilledExam ? prefilledExam.id : null,
      targetSession: autofillSession,
      previousResource: context.previousResource,
      weakestSubjects: context.miniCct
        ? context.miniCct.weakestSubjects
            .map((key) => engine.subjectLabelForKey(key))
            .filter(Boolean)
        : [],
      desiredBranch: context.desiredBranch,
    },
    miniCct: context.miniCct
      ? {
          attemptId: context.miniCct.attemptId,
          quizTitle: context.miniCct.quizTitle,
          endedAt: context.miniCct.endedAt,
          subjectRanking: context.miniCct.subjectRanking,
          weakTagCount: context.miniCct.weakTags ? context.miniCct.weakTags.count : null,
        }
      : null,
    latest,
    notes,
  });
});

// ---- POST /recommend — validate, score, persist, serve ------------------------

router.post('/recommend', async (req, res) => {
  const userId = req.appSession.user.id;

  // Persistence is a hard requirement of this route — gate on a usable DB.
  if (!(await requireDb(res))) return;

  let limited;
  try {
    limited = await hitRateLimit(`platform-choice:user:${userId}`, {
      windowMs: RECOMMEND_WINDOW_MS,
      max: RECOMMEND_MAX_PER_USER,
    });
  } catch {
    limited = { allowed: true }; // limiter outage must not invent an error
  }
  if (!limited.allowed) {
    return res.status(429).json({
      msg: 'Too many recommendations from this account. Try again later.',
      code: 'RATE_LIMITED',
    });
  }

  let input;
  try {
    input = engine.validateRecommendRequest(req.body);
  } catch (error) {
    return sendPlatformChoiceError(res, error);
  }

  let context;
  try {
    context = await loadStudentContext(req);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }

  let recommendation;
  try {
    recommendation = engine.buildRecommendation({
      input,
      miniCct: context.miniCct,
      desiredBranch: context.desiredBranch,
    });
  } catch (error) {
    return sendPlatformChoiceError(res, error);
  }

  // Outbound URLs resolve server-side (affiliate override → website) — the UI
  // receives final links and holds no partnership logic.
  for (const tier of recommendation.tiers) {
    const platform = config.platformByKey(tier.platform.key);
    tier.platform.visitUrl = platform ? config.resolveVisitUrl(platform) : null;
  }

  // Persist BEFORE serving (Prediction convention): a failed write means no
  // recommendation is served.
  const stages = {
    method: recommendation.method,
    input: {
      ...input,
      miniCct: context.miniCct
        ? {
            attemptId: context.miniCct.attemptId,
            quizTitle: context.miniCct.quizTitle,
            endedAt: context.miniCct.endedAt,
            subjectRanking: context.miniCct.subjectRanking,
            weakTagLabels: context.miniCct.weakTags ? context.miniCct.weakTags.labels : null,
          }
        : null,
      desiredBranch: context.desiredBranch,
    },
    result: recommendation,
  };
  let doc;
  try {
    doc = await PlatformChoiceQuery.create({
      userId,
      exam: input.exam,
      request: req.body,
      methodVersion: recommendation.method.version,
      input: stages.input,
      result: stages.result,
      resultHash: hashResult(stages),
    });
  } catch (error) {
    console.error('[platform-choice] Persistence failed — recommendation NOT served', {
      userId,
      message: error && error.message,
    });
    return res.status(500).json({
      msg: 'Could not save the recommendation, so it was not generated. Please try again.',
      code: 'RECOMMENDATION_NOT_STORED',
    });
  }

  return res.status(201).json({
    recommendationId: String(doc._id),
    persisted: true,
    recommendation,
  });
});

/** Persistence gate (predictor convention): true to proceed, false after 503. */
function requireDb(res) {
  return ensureDbConnection().then(
    () => true,
    (error) => {
      console.error('[platform-choice] DB unavailable', { message: error && error.message });
      res.status(503).json({
        msg: 'Recommendations are temporarily unavailable. Please try again in a moment.',
        code: 'PLATFORM_CHOICE_DB_UNAVAILABLE',
      });
      return false;
    }
  );
}

router.use((_req, res) => res.status(404).json({ msg: 'Not found', code: 'NOT_FOUND' }));

module.exports = router;
