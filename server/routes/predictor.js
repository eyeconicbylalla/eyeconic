'use strict';

const crypto = require('crypto');
const express = require('express');

const Prediction = require('../models/Prediction');
const OutcomeCapture = require('../models/OutcomeCapture');
const DesiredBranchQuery = require('../models/DesiredBranchQuery');
const { ensureDbConnection } = require('../config/db');
const { createPredictorEngine } = require('../predictor');
const { EXAMS } = require('../predictor/config');
const { PredictorError, CODES } = require('../predictor/errors');
const { BAND_ORDER } = require('../predictor/branchMatching');
const { callAppApi, AppApiError } = require('../config/appApi');
const { clearSessionCookie } = require('../services/appSession');
const requireAppSession = require('../middleware/appSession');
const { sameOriginGuard } = require('../middleware/sameOrigin');
const { hitRateLimit } = require('../services/rateLimiter');

const router = express.Router();

/**
 * Rank & Branch Predictor API (spec §18 Phase 7) — exposes the Phase 3–6
 * engine with Phase 9 persistence built in: **every served prediction is
 * stored before it is served** (a failed write returns an error, never an
 * unpersisted prediction — an unpersisted prediction is a calibration sample
 * lost forever).
 *
 * Auth: the student's App session (encrypted HttpOnly cookie; identity =
 * req.appSession.user.id, the canonical App backend User._id). The engine
 * itself stays quiz-engine-independent (§19.10) — this route file is the only
 * place the two worlds meet (GT auto-fill via the App API).
 *
 * Branch result rows are NOT embedded in predict responses (a mid-range
 * student has ~2,300 groups/year): predict returns band counts + coverage,
 * and rows are served paginated from GET /predictions/:id/branches, which
 * re-derives them deterministically from the stored request + method
 * version + dataset snapshots and verifies the re-derivation against the
 * stored counts.
 *
 * Phase 10 outcome capture (§15, 10a+10b): PUT/GET/DELETE
 * /predictions/:id/outcome — the consent-based post-exam self-report
 * (score / percentile / rank + counselling outcome / allotted branch) linked
 * to the stored prediction via a capture-time linkage snapshot. Assembled
 * into the evaluation dataset by scripts/phase10b/assemble_evaluation_dataset.js.
 */

// Singleton engine. No cohortProvider: GT-cohort stats for Tier 2 would have
// to come from the App API (no such endpoint exists today and the app repo is
// feature-frozen) — Tier 1 is the launch mode exactly as the Phase 1 audit
// predicted. The engine's injectable cohortProvider remains for M2+.
const engine = createPredictorEngine();

const PREDICT_WINDOW_MS = 60 * 60 * 1000;
const PREDICT_MAX_PER_USER = 60;

// Desired Branch queries: their own budget so reverse-flow usage never eats
// the forward predict budget (same protective size, DBP §7.3).
const DESIRED_WINDOW_MS = 60 * 60 * 1000;
const DESIRED_MAX_PER_USER = 60;

// Outcome submissions are low-volume by nature; a modest protective budget.
const OUTCOME_WINDOW_MS = 60 * 60 * 1000;
const OUTCOME_MAX_PER_USER = 30;

// GT auto-fill paging bounds (analytics endpoint caps limit at 100).
const GT_PAGE_LIMIT = 100;
const GT_MAX_PAGES = 10;

// Branch-row pagination bounds.
const BRANCHES_MAX_LIMIT = 100;
const BRANCHES_DEFAULT_LIMIT = 25;

/**
 * Persistence gate: predictor endpoints that REQUIRE the database ensure a
 * usable mongoose connection first (lazy connect / self-healing reconnect —
 * see config/db.js). Without this, a serverless run never connects and a
 * dropped connection surfaces as an opaque 500 on the first hard write.
 * Resolves true to proceed; false AFTER responding 503 (caller returns).
 */
function requireDb(res) {
  return ensureDbConnection().then(
    () => true,
    (error) => {
      console.error('[predictor] DB unavailable', { message: error && error.message });
      res.status(503).json({
        msg: 'Prediction storage is temporarily unavailable. Please try again in a moment.',
        code: 'PREDICTOR_DB_UNAVAILABLE',
      });
      return false;
    }
  );
}

/** Map engine errors to HTTP (codes are part of the engine contract). */
function sendPredictorError(res, error) {
  if (!(error instanceof PredictorError)) {
    console.error('[predictor] Unexpected error', { message: error && error.message });
    return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
  }
  // Desired Branch unknown-branch carries near-miss suggestions for the
  // picker (DBP §9 case 1) — surfaced as its own typed client error.
  if (
    error.code === CODES.INVALID_INPUT &&
    error.details &&
    error.details.reason === 'unknown-branch'
  ) {
    return res.status(400).json({
      msg: error.message,
      code: 'UNKNOWN_BRANCH',
      field: 'branchKey',
      suggestions: Array.isArray(error.details.suggestions) ? error.details.suggestions : [],
    });
  }
  const statusByCode = {
    [CODES.INVALID_INPUT]: 400,
    [CODES.EXAM_NOT_AVAILABLE]: 400,
    [CODES.STEP_NOT_IMPLEMENTED]: 500,
    [CODES.DATA_INTEGRITY]: 500,
  };
  return res.status(statusByCode[error.code] || 500).json({
    msg: error.message,
    code: error.code,
    ...(error.details && error.details.field ? { field: error.details.field } : {}),
  });
}

function sendAppError(res, error) {
  if (error instanceof AppApiError) {
    if (error.status === 401) {
      clearSessionCookie(res);
      return res.status(401).json({
        msg: 'Your session has expired. Please log in again.',
        code: 'APP_SESSION_REQUIRED',
      });
    }
    return res.status(error.status).json({ msg: error.message, code: error.code });
  }
  console.error('[predictor] App API error', { message: error && error.message });
  return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
}

/** sha256 of the canonical JSON of the stored result stages. */
function hashResult(stages) {
  return crypto.createHash('sha256').update(JSON.stringify(stages)).digest('hex');
}

/** Branch summary for serve/store: counts + coverage, row arrays stripped. */
function summarizeBranches(branches) {
  if (!branches || branches.coverage === 'CATEGORY_REQUIRED') return branches;
  return {
    ...branches,
    years: branches.years.map((y) => {
      const { rows, ...summary } = y;
      void rows;
      return summary;
    }),
  };
}

function ownPredictionQuery(req) {
  return { _id: req.params.id, userId: req.appSession.user.id };
}

router.use(requireAppSession);
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sameOriginGuard(req, res, next);
  return next();
});

// ---- Exam list (§13 exam selector metadata) ---------------------------------

router.get('/exams', (_req, res) => {
  res.json({ exams: engine.listExams() });
});

// ---- Predict (persist first, then serve — §18 Phase 7/9) --------------------

router.post('/predict', async (req, res) => {
  const userId = req.appSession.user.id;

  // Persistence is a hard requirement of this route (§18 Phase 7/9) — gate
  // the whole request on a usable database connection before doing work.
  if (!(await requireDb(res))) return;

  let limited;
  try {
    limited = await hitRateLimit(`predictor:user:${userId}`, {
      windowMs: PREDICT_WINDOW_MS,
      max: PREDICT_MAX_PER_USER,
    });
  } catch {
    limited = { allowed: true }; // limiter outage must not invent an error
  }
  if (!limited.allowed) {
    return res.status(429).json({
      msg: 'Too many predictions from this account. Try again later.',
      code: 'RATE_LIMITED',
    });
  }

  let result;
  try {
    result = engine.predict(req.body);
  } catch (error) {
    return sendPredictorError(res, error);
  }

  const branchesSummary = summarizeBranches(result.branches);
  const stages = {
    method: result.method,
    input: result.input,
    aggregation: result.aggregation,
    estimate: result.estimate,
    rank: result.rank,
    branches: branchesSummary,
  };

  // Persist BEFORE serving: a failed write must mean no prediction served.
  let doc;
  try {
    doc = await Prediction.create({
      userId,
      exam: result.exam,
      request: req.body,
      methodVersion: result.method.version,
      ...stages,
      resultHash: hashResult(stages),
    });
  } catch (error) {
    console.error('[predictor] Persistence failed — prediction NOT served', {
      userId,
      message: error && error.message,
    });
    return res.status(500).json({
      msg: 'Could not save the prediction, so it was not generated. Please try again.',
      code: 'PREDICTION_NOT_STORED',
    });
  }

  return res.status(201).json({
    predictionId: doc._id,
    persisted: true,
    prediction: { ...result, branches: branchesSummary },
  });
});

// ---- GT auto-fill (§6A / §13: auto-captured vs self-reported) -----------------

/**
 * Map one analytics attempt summary (App API shape, verified Phase 1:
 * score = correct count; only completed/auto_submitted attempts are listed)
 * onto the engine's attempt input. retestApprovedUsed is not part of the
 * analytics payload — recorded as false and flagged in the response note;
 * the one-per-GT dedup still applies via latest-endTime.
 */
function mapAutoAttempt(attempt) {
  return {
    corrects: attempt.score,
    totalQuestions: attempt.totalQuestions,
    status: 'completed',
    endedAt: attempt.endTime || null,
    retestApprovedUsed: false,
    skippedCount: Number.isFinite(attempt.skipped) ? attempt.skipped : 0,
  };
}

router.get('/gts', async (req, res) => {
  let attempts = [];
  try {
    for (let page = 1; page <= GT_MAX_PAGES; page += 1) {
      const data = await callAppApi(
        `/quizzes/analytics/me?limit=${GT_PAGE_LIMIT}&page=${page}`,
        { userToken: req.appSession.token, requestId: req.requestId }
      );
      if (!Array.isArray(data.attempts)) break;
      attempts = attempts.concat(data.attempts);
      const totalPages = data.pagination && Number(data.pagination.totalPages);
      if (!Number.isFinite(totalPages) || page >= totalPages) break;
    }
  } catch (error) {
    return sendAppError(res, error);
  }

  // Grand Tests only (testType populated by the App analytics endpoint).
  const byQuiz = new Map();
  const order = [];
  for (const attempt of attempts) {
    const quiz = attempt.quiz;
    if (!quiz || quiz.testType !== 'grand' || !quiz._id) continue;
    const gtId = String(quiz._id);
    if (!byQuiz.has(gtId)) {
      byQuiz.set(gtId, {
        gtId,
        title: quiz.title || null,
        provenance: 'auto-captured',
        attempts: [],
      });
      order.push(gtId);
    }
    byQuiz.get(gtId).attempts.push(mapAutoAttempt(attempt));
  }

  // Self-reported continuity: values from the student's latest prediction
  // (clearly tagged; the student confirms/edits before use). Best-effort —
  // auto-fill never blocks on the database: race the connect against a short
  // timer (cleared on settle so no handle dangles) and skip the echo if
  // storage is not quickly reachable.
  let selfReported = [];
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('db-slow')), 1500);
      ensureDbConnection().then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
    const latest = await Prediction.findOne({
      userId: req.appSession.user.id,
      'request.gts.provenance': 'self-reported',
    }).sort({ createdAt: -1 }).lean();
    if (latest && Array.isArray(latest.request && latest.request.gts)) {
      selfReported = latest.request.gts
        .filter((g) => g && g.provenance === 'self-reported' && Array.isArray(g.attempts))
        .slice(-20)
        .map((g) => ({
          attempts: g.attempts.map((a) => ({
            corrects: a.corrects,
            totalQuestions: a.totalQuestions,
            status: a.status || 'completed',
            endedAt: a.endedAt || null,
          })),
        }));
    }
  } catch {
    selfReported = []; // continuity is best-effort, never blocking
  }

  return res.json({
    exam: 'NEET_PG', // implicit pattern (Phase 1 audit G1: GTs carry no exam tag yet)
    gts: order.map((gtId) => byQuiz.get(gtId)),
    selfReported,
    notes: [
      'Auto-captured Grand Tests come from your Eyeconic quiz attempts; retest flags are not yet part of that feed, so the latest completed attempt is used per Grand Test.',
      'Self-reported entries below are from your most recent prediction — confirm or edit them before predicting.',
    ],
  });
});

// ---- Desired Branch Predictor (Feature 02, DBP §7.3; D6 persist) --------------

/** The stage set stored + hashed for a served reverse result (§7.4). */
function desiredStages(result) {
  return {
    method: result.method,
    input: result.input,
    target: result.target,
    required: result.required,
    current: result.current,
    gap: result.gap,
    warnings: result.warnings,
    notes: result.notes,
  };
}

/** Branch catalog for the picker — in-process cached, no DB access needed. */
router.get('/branches', (req, res) => {
  try {
    return res.json(engine.branchCatalog(String(req.query.exam || '')));
  } catch (error) {
    return sendPredictorError(res, error);
  }
});

router.post('/desired-branch', async (req, res) => {
  const userId = req.appSession.user.id;

  // Persist-before-serve is a hard requirement here too (D6 approved): an
  // unpersisted reverse query is a lost intent/calibration sample.
  if (!(await requireDb(res))) return;

  let limited;
  try {
    limited = await hitRateLimit(`predictor:desired:${userId}`, {
      windowMs: DESIRED_WINDOW_MS,
      max: DESIRED_MAX_PER_USER,
    });
  } catch {
    limited = { allowed: true }; // limiter outage must not invent an error
  }
  if (!limited.allowed) {
    return res.status(429).json({
      msg: 'Too many lookups from this account. Try again later.',
      code: 'RATE_LIMITED',
    });
  }

  let result;
  try {
    result = engine.predictRequired(req.body);
  } catch (error) {
    return sendPredictorError(res, error);
  }

  const stages = desiredStages(result);
  let doc;
  try {
    doc = await DesiredBranchQuery.create({
      userId,
      exam: result.exam,
      request: req.body,
      methodVersion: result.method.version,
      ...stages,
      resultHash: hashResult(stages),
    });
  } catch (error) {
    console.error('[predictor] Desired-branch persistence failed — result NOT served', {
      userId,
      message: error && error.message,
    });
    return res.status(500).json({
      msg: 'Could not save the lookup, so it was not generated. Please try again.',
      code: 'DESIRED_NOT_STORED',
    });
  }

  return res.status(201).json({
    desiredBranchId: doc._id,
    persisted: true,
    result,
  });
});

/**
 * Retrieve one stored reverse query (own-only) with the integrity check.
 *
 * §9 case 19: the result is ALSO re-derived deterministically from the stored
 * request (the exact pattern the forward branches endpoint established) — a
 * later method or data change surfaces verified:false with an explicit diff
 * block instead of a silent mismatch with what was originally served.
 */
router.get('/desired-branch/:id', async (req, res) => {
  if (!(await requireDb(res))) return;
  let doc;
  try {
    doc = await DesiredBranchQuery.findOne({
      _id: req.params.id,
      userId: req.appSession.user.id,
    }).lean();
  } catch {
    doc = null;
  }
  if (!doc) {
    return res.status(404).json({ msg: 'Lookup not found.', code: 'NOT_FOUND' });
  }

  const recomputedHash = hashResult({
    method: doc.method,
    input: doc.input,
    target: doc.target,
    required: doc.required,
    current: doc.current,
    gap: doc.gap,
    warnings: doc.warnings,
    notes: doc.notes,
  });

  // Re-derive from the stored request (deterministic engine + snapshots).
  let recomputed;
  try {
    recomputed = engine.predictRequired(doc.request);
  } catch (error) {
    return sendPredictorError(res, error);
  }

  const methodMatches = recomputed.method.version === doc.methodVersion;
  const snapshotsMatch = JSON.stringify(recomputed.method.datasetSnapshots) ===
    JSON.stringify(doc.method.datasetSnapshots);
  // Stage digest, key-order-normalized on both sides (Mongo lean docs keep
  // stored order; fresh results keep build order — normalize, never trust it).
  const stageDigest = (target, required, gap) => JSON.stringify({
    target: { range: target.targetRankRange, coverage: target.coverage },
    required: required
      ? required.perClosing.map((e) => [e.closing, e.corrects, e.state])
      : null,
    gap: gap ? [gap.status, gap.gapToSafe, gap.gapToLikely] : null,
  });
  const stagesMatch = stageDigest(recomputed.target, recomputed.required, recomputed.gap) ===
    stageDigest(doc.target, doc.required, doc.gap);
  const verified = methodMatches && snapshotsMatch && stagesMatch;

  return res.json({
    desiredBranchId: doc._id,
    integrity: {
      resultHash: doc.resultHash,
      recomputedHash,
      matches: recomputedHash === doc.resultHash,
    },
    verified,
    ...(!verified
      ? {
          verification: {
            methodMatches,
            snapshotsMatch,
            stagesMatch,
            storedMethodVersion: doc.methodVersion,
            currentMethodVersion: recomputed.method.version,
            note: 'This lookup was re-derived with the CURRENT engine/data and may differ from the originally served result.',
          },
        }
      : {}),
    result: {
      exam: doc.exam,
      methodVersion: doc.methodVersion,
      method: doc.method,
      input: doc.input,
      target: doc.target,
      required: doc.required,
      current: doc.current,
      gap: doc.gap,
      warnings: doc.warnings,
      notes: doc.notes,
    },
  });
});

// ---- Prediction history (§18 Phase 9: stored AND retrievable) ----------------

router.get('/predictions', async (req, res) => {
  if (!(await requireDb(res))) return;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  try {
    const [docs, total] = await Promise.all([
      Prediction.find({ userId: req.appSession.user.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('exam methodVersion createdAt aggregation estimate rank branches')
        .lean(),
      Prediction.countDocuments({ userId: req.appSession.user.id }),
    ]);
    return res.json({
      predictions: docs.map((d) => ({
        id: d._id,
        exam: d.exam,
        methodVersion: d.methodVersion,
        createdAt: d.createdAt,
        gtsUsed: d.aggregation ? d.aggregation.n : undefined,
        percentileRange: d.estimate && d.estimate.percentile ? d.estimate.percentile.range : undefined,
        rankRange: d.rank && d.rank.rankRange ? d.rank.rankRange : undefined,
        branchesCoverage: d.branches ? d.branches.coverage : undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[predictor] History read failed', { message: error && error.message });
    return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
  }
});

router.get('/predictions/:id', async (req, res) => {
  if (!(await requireDb(res))) return;
  let doc;
  try {
    doc = await Prediction.findOne(ownPredictionQuery(req)).lean();
  } catch {
    doc = null;
  }
  if (!doc) {
    return res.status(404).json({ msg: 'Prediction not found.', code: 'NOT_FOUND' });
  }
  const { _id, __v, ...record } = doc;
  void __v;
  // Recompute over exactly the six stages the stored hash covered.
  const recomputedHash = hashResult({
    method: record.method,
    input: record.input,
    aggregation: record.aggregation,
    estimate: record.estimate,
    rank: record.rank,
    branches: record.branches,
  });
  return res.json({
    predictionId: _id,
    integrity: { resultHash: doc.resultHash, recomputedHash, matches: recomputedHash === doc.resultHash },
    prediction: record,
  });
});

// ---- Branch rows (paginated, re-derived + verified) --------------------------

router.get('/predictions/:id/branches', async (req, res) => {
  if (!(await requireDb(res))) return;
  let doc;
  try {
    doc = await Prediction.findOne(ownPredictionQuery(req)).lean();
  } catch {
    doc = null;
  }
  if (!doc) {
    return res.status(404).json({ msg: 'Prediction not found.', code: 'NOT_FOUND' });
  }
  if (!doc.branches || doc.branches.coverage === 'CATEGORY_REQUIRED') {
    return res.status(409).json({
      msg: 'This prediction has no branch results — it was made without a category.',
      code: 'CATEGORY_REQUIRED',
    });
  }

  // Re-derive deterministically from the stored request.
  let recomputed;
  try {
    recomputed = engine.predict(doc.request);
  } catch (error) {
    return sendPredictorError(res, error);
  }

  const methodMatches = recomputed.method.version === doc.methodVersion;
  const snapshotsMatch = JSON.stringify(recomputed.method.datasetSnapshots) ===
    JSON.stringify(doc.method.datasetSnapshots);
  const storedCounts = doc.branches.years.map((y) => ({ year: y.year, counts: y.counts }));
  const recomputedCounts = recomputed.branches.years.map((y) => ({ year: y.year, counts: y.counts }));
  const countsMatch = JSON.stringify(storedCounts) === JSON.stringify(recomputedCounts);
  const verified = methodMatches && snapshotsMatch && countsMatch;

  // Filters: explicit validation — an unknown band/year is a client error,
  // never a silently-ignored filter.
  const availableYears = recomputed.branches.years.map((y) => y.year);
  let year = null;
  if (req.query.year !== undefined && req.query.year !== null && req.query.year !== '') {
    year = Number.parseInt(req.query.year, 10);
    if (!availableYears.includes(year)) {
      return res.status(400).json({
        msg: `Unknown year '${req.query.year}'. Available: ${availableYears.join(', ')}.`,
        code: 'VALIDATION_ERROR',
      });
    }
  }
  let band = null;
  if (req.query.band !== undefined && req.query.band !== null && req.query.band !== '') {
    band = String(req.query.band);
    if (!BAND_ORDER.includes(band)) {
      return res.status(400).json({
        msg: `Unknown band '${band}'. Available: ${BAND_ORDER.join(', ')}.`,
        code: 'VALIDATION_ERROR',
      });
    }
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    BRANCHES_MAX_LIMIT,
    Math.max(1, Number.parseInt(req.query.limit, 10) || BRANCHES_DEFAULT_LIMIT)
  );

  let pool = [];
  for (const y of recomputed.branches.years) {
    if (year && y.year !== year) continue;
    for (const b of BAND_ORDER) {
      if (band && b !== band) continue;
      pool = pool.concat(y.rows[b].map((row) => ({ ...row, year: y.year })));
    }
  }
  const total = pool.length;
  const rows = pool.slice((page - 1) * limit, page * limit);

  return res.json({
    predictionId: doc._id,
    filters: { year, band, page, limit },
    total,
    totalPages: Math.ceil(total / limit),
    rows,
    coverage: recomputed.branches.coverage,
    dataCoverage: recomputed.branches.dataCoverage,
    notes: recomputed.branches.notes,
    verified,
    ...(!verified
      ? {
          verification: {
            methodMatches,
            snapshotsMatch,
            countsMatch,
            storedMethodVersion: doc.methodVersion,
            currentMethodVersion: recomputed.method.version,
            storedCounts,
            recomputedCounts,
            note: 'Rows were re-derived with the CURRENT engine/data and may differ from the originally served prediction.',
          },
        }
      : {}),
  });
});

// ---- Outcome capture (§15, §18 Phases 10a+10b) --------------------------------
//
// The consent-based post-exam self-report that starts building the paired
// GT→outcome dataset. 10a captured actual score / percentile / rank; 10b adds
// the counselling outcome (allotted status + allotted institute/branch +
// round). One outcome per prediction (corrections overwrite via PUT — a
// correction that omits counselling clears it; withdrawal is DELETE —
// consent-based means withdrawable).

class OutcomeValidationError extends Error {
  constructor(code, msg, field) {
    super(msg);
    this.code = code;
    this.field = field;
    this.status = 400;
  }
}

const OUTCOME_FIELDS = ['score', 'percentile', 'rank'];
const OUTCOME_ALLOWED_KEYS = new Set(['consent', ...OUTCOME_FIELDS, 'counselling']);
// Phase 10b flat keys — the exact set 10a rejected with an explicit M2
// message; per §20 that rejection becomes acceptance, so each alias folds
// into the canonical `counselling` block instead of being dropped.
const OUTCOME_COUNSELLING_ALIASES = {
  counsellingOutcome: 'status',
  counsellingRound: 'round',
  allottedInstitute: 'allottedInstitute',
  allottedCollege: 'allottedInstitute',
  allottedBranch: 'allottedBranch',
  allottedCourse: 'allottedBranch',
  allottedSpecialty: 'allottedBranch',
};
const COUNSELLING_KEYS = ['status', 'allottedInstitute', 'allottedBranch', 'round'];
const COUNSELLING_STATUSES = ['ALLOTTED', 'NOT_ALLOTTED'];
const COUNSELLING_TEXT_MAX = 120;
const COUNSELLING_ROUND_MAX = 40;
const OUTCOME_RANK_SANITY_MAX = 1000000;
const OUTCOME_PERCENTILE_DECIMALS = 4;

/**
 * Parse the counselling outcome (Phase 10b, §15) out of the submission body:
 * the canonical nested `counselling` object plus the flat 10a-era alias keys,
 * merged into ONE canonical block. Returns null when no counselling value was
 * submitted. Allotment strings are stored as typed (trimmed) — canonical
 * matching against the counselling dictionaries happens at evaluation-dataset
 * assembly, so the raw self-report is never overwritten.
 */
function parseCounsellingSubmission(body) {
  const byTarget = new Map(); // counselling target field → { value, from }

  const offer = (target, value, from) => {
    if (value === undefined || value === null || value === '') return;
    if (byTarget.has(target) && byTarget.get(target).value !== value) {
      throw new OutcomeValidationError(
        'OUTCOME_INVALID',
        `'${target}' was submitted twice with different values — submit it once.`,
        from
      );
    }
    byTarget.set(target, { value, from });
  };

  if (body.counselling !== undefined && body.counselling !== null) {
    if (typeof body.counselling !== 'object' || Array.isArray(body.counselling)) {
      throw new OutcomeValidationError(
        'OUTCOME_INVALID',
        'counselling must be an object with status and the allotted details.',
        'counselling'
      );
    }
    for (const key of Object.keys(body.counselling)) {
      if (!COUNSELLING_KEYS.includes(key)) {
        throw new OutcomeValidationError(
          'OUTCOME_UNKNOWN_FIELD',
          `Unknown counselling field '${key}'. Submit status, allottedInstitute, allottedBranch and round only.`,
          `counselling.${key}`
        );
      }
      offer(key, body.counselling[key], `counselling.${key}`);
    }
  }
  for (const [alias, target] of Object.entries(OUTCOME_COUNSELLING_ALIASES)) {
    if (Object.prototype.hasOwnProperty.call(body, alias)) {
      offer(target, body[alias], alias);
    }
  }

  if (byTarget.size === 0) return null;

  const counselling = { status: null, allottedInstitute: null, allottedBranch: null, round: null };

  if (byTarget.has('status')) {
    const { value, from } = byTarget.get('status');
    if (typeof value !== 'string' || !COUNSELLING_STATUSES.includes(value.trim().toUpperCase())) {
      throw new OutcomeValidationError(
        'OUTCOME_INVALID',
        'Counselling outcome must be ALLOTTED or NOT_ALLOTTED.',
        from
      );
    }
    counselling.status = value.trim().toUpperCase();
  }
  for (const field of ['allottedInstitute', 'allottedBranch', 'round']) {
    if (!byTarget.has(field)) continue;
    const { value, from } = byTarget.get(field);
    if (typeof value !== 'string') {
      throw new OutcomeValidationError('OUTCOME_INVALID', `${field} must be text.`, from);
    }
    const trimmed = value.trim();
    const max = field === 'round' ? COUNSELLING_ROUND_MAX : COUNSELLING_TEXT_MAX;
    if (trimmed.length < 2 || trimmed.length > max) {
      throw new OutcomeValidationError(
        'OUTCOME_INVALID',
        `${field} must be between 2 and ${max} characters.`,
        from
      );
    }
    counselling[field] = trimmed;
  }

  if (!counselling.status) {
    throw new OutcomeValidationError(
      'OUTCOME_INVALID',
      'Enter the counselling outcome — allotted or not allotted.',
      'counselling.status'
    );
  }
  if (
    counselling.status === 'NOT_ALLOTTED' &&
    (counselling.allottedInstitute !== null ||
      counselling.allottedBranch !== null ||
      counselling.round !== null)
  ) {
    throw new OutcomeValidationError(
      'OUTCOME_INVALID',
      'You recorded “not allotted” — leave the allotted institute, branch and round empty.',
      'counselling.status'
    );
  }
  return counselling;
}

function validateOutcomeSubmission(body, examId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new OutcomeValidationError(
      'OUTCOME_INVALID',
      'Submit the outcome as an object with consent and at least one result value.',
      'outcome'
    );
  }
  for (const key of Object.keys(body)) {
    if (OUTCOME_ALLOWED_KEYS.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(OUTCOME_COUNSELLING_ALIASES, key)) continue;
    throw new OutcomeValidationError(
      'OUTCOME_UNKNOWN_FIELD',
      `Unknown field '${key}'. Submit consent, score, percentile, rank and counselling only.`,
      key
    );
  }
  if (body.consent !== true) {
    throw new OutcomeValidationError(
      'CONSENT_REQUIRED',
      'Sharing your result is voluntary — tick the consent box to submit it.',
      'consent'
    );
  }

  const maxScore = EXAMS[examId] ? EXAMS[examId].pattern.maxMarks : null;
  const parsed = { score: null, percentile: null, rank: null };
  for (const field of OUTCOME_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new OutcomeValidationError(
        'OUTCOME_INVALID',
        `${field} must be a number.`,
        field
      );
    }
    if (field === 'score') {
      if (!Number.isInteger(value) || value < 0 || (maxScore !== null && value > maxScore)) {
        throw new OutcomeValidationError(
          'OUTCOME_INVALID',
          `Score must be a whole number between 0 and ${maxScore} (the exam's pattern).`,
          field
        );
      }
      parsed.score = value;
    } else if (field === 'percentile') {
      if (value < 0 || value > 100) {
        throw new OutcomeValidationError(
          'OUTCOME_INVALID',
          'Percentile must be between 0 and 100.',
          field
        );
      }
      parsed.percentile =
        Math.round(value * 10 ** OUTCOME_PERCENTILE_DECIMALS) / 10 ** OUTCOME_PERCENTILE_DECIMALS;
    } else {
      if (!Number.isInteger(value) || value < 1 || value > OUTCOME_RANK_SANITY_MAX) {
        throw new OutcomeValidationError(
          'OUTCOME_INVALID',
          `Rank must be a whole number between 1 and ${OUTCOME_RANK_SANITY_MAX.toLocaleString('en-US')}.`,
          field
        );
      }
      parsed.rank = value;
    }
  }
  const counselling = parseCounsellingSubmission(body);
  if (
    parsed.score === null &&
    parsed.percentile === null &&
    parsed.rank === null &&
    counselling === null
  ) {
    throw new OutcomeValidationError(
      'OUTCOME_EMPTY',
      'Enter at least one value — actual score, percentile, rank or your counselling outcome.',
      'outcome'
    );
  }
  return { outcome: parsed, counselling };
}

/** Own prediction or null (cast errors on malformed ids count as not-found). */
async function findOwnPrediction(req) {
  try {
    return await Prediction.findOne(ownPredictionQuery(req)).lean();
  } catch {
    return null;
  }
}

router.put('/predictions/:id/outcome', async (req, res) => {
  const userId = req.appSession.user.id;
  if (!(await requireDb(res))) return;

  let limited;
  try {
    limited = await hitRateLimit(`predictor:outcome:${userId}`, {
      windowMs: OUTCOME_WINDOW_MS,
      max: OUTCOME_MAX_PER_USER,
    });
  } catch {
    limited = { allowed: true }; // limiter outage must not invent an error
  }
  if (!limited.allowed) {
    return res.status(429).json({
      msg: 'Too many submissions from this account. Try again later.',
      code: 'RATE_LIMITED',
    });
  }

  const prediction = await findOwnPrediction(req);
  if (!prediction) {
    return res.status(404).json({ msg: 'Prediction not found.', code: 'NOT_FOUND' });
  }

  let parsed;
  try {
    parsed = validateOutcomeSubmission(req.body, prediction.exam);
  } catch (error) {
    if (error instanceof OutcomeValidationError) {
      return res
        .status(error.status)
        .json({ msg: error.message, code: error.code, field: error.field });
    }
    console.error('[predictor] Outcome validation error', { message: error && error.message });
    return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
  }

  // Linkage snapshot copied at capture time (§15) — the join key that makes
  // this pair usable for calibration later.
  const linkage = {
    methodVersion: prediction.methodVersion,
    datasetSnapshots: prediction.method ? prediction.method.datasetSnapshots : null,
    predictionCreatedAt: prediction.createdAt,
    gtsUsed: prediction.aggregation ? prediction.aggregation.n : null,
  };

  const update = {
    $set: {
      userId,
      exam: prediction.exam,
      consentGivenAt: new Date(),
      outcome: parsed.outcome,
      counselling: parsed.counselling,
      linkage,
      source: 'self-reported',
    },
  };
  let doc;
  try {
    doc = await OutcomeCapture.findOneAndUpdate({ predictionId: prediction._id }, update, {
      upsert: true,
      new: true,
      runValidators: true,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      // Lost a concurrent-create race on the unique index — update instead.
      try {
        doc = await OutcomeCapture.findOneAndUpdate({ predictionId: prediction._id }, update, {
          new: true,
        });
      } catch (retryError) {
        console.error('[predictor] Outcome write failed', {
          message: retryError && retryError.message,
        });
        return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
      }
    } else {
      console.error('[predictor] Outcome write failed', { message: error && error.message });
      return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
    }
  }

  return res.json({
    predictionId: prediction._id,
    outcomeId: doc._id,
    created: doc.createdAt.getTime() === doc.updatedAt.getTime(),
    consentGivenAt: doc.consentGivenAt,
    outcome: doc.outcome,
    counselling: doc.counselling,
    linkage: doc.linkage,
    source: doc.source,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
});

router.get('/predictions/:id/outcome', async (req, res) => {
  const userId = req.appSession.user.id;
  if (!(await requireDb(res))) return;

  const prediction = await findOwnPrediction(req);
  if (!prediction) {
    return res.status(404).json({ msg: 'Prediction not found.', code: 'NOT_FOUND' });
  }

  let captured;
  try {
    captured = await OutcomeCapture.findOne({ predictionId: prediction._id, userId }).lean();
  } catch {
    captured = null;
  }

  // Side-by-side context for the student (and honest predicted-vs-actual).
  const predictionSummary = {
    methodVersion: prediction.methodVersion,
    percentileRange:
      prediction.estimate && prediction.estimate.percentile
        ? prediction.estimate.percentile.range
        : null,
    rankRange: prediction.rank ? prediction.rank.rankRange : null,
    gtsUsed: prediction.aggregation ? prediction.aggregation.n : null,
  };

  // "Nothing recorded yet" is the ROUTINE state (every result page until the
  // student shares an outcome) — it must be a 200, not a 404: browsers log
  // every non-2xx XHR to the console, so a 404 here would put a red error on
  // every student's screen for the normal case. Real 404s (unknown or
  // not-owned prediction) are handled above.
  if (!captured) {
    return res.json({
      predictionId: prediction._id,
      recorded: false,
      outcomeRecord: null,
      predictionSummary,
    });
  }

  // Linkage integrity check: the copy taken at capture time must still match
  // the live prediction (mirrors the Prediction resultHash verification).
  const linkageMatches =
    Boolean(captured.linkage) &&
    captured.linkage.methodVersion === prediction.methodVersion &&
    JSON.stringify(captured.linkage.datasetSnapshots) ===
      JSON.stringify(prediction.method ? prediction.method.datasetSnapshots : null);

  return res.json({
    predictionId: prediction._id,
    recorded: true,
    outcomeRecord: {
      outcomeId: captured._id,
      exam: captured.exam,
      consentGivenAt: captured.consentGivenAt,
      outcome: captured.outcome,
      // Pre-10b captures (lean reads carry no defaults) have no counselling
      // field at all — normalize to null so the shape stays uniform.
      counselling: captured.counselling || null,
      linkage: captured.linkage,
      source: captured.source,
      createdAt: captured.createdAt,
      updatedAt: captured.updatedAt,
      linkageCheck: { matches: linkageMatches },
    },
    predictionSummary,
  });
});

router.delete('/predictions/:id/outcome', async (req, res) => {
  const userId = req.appSession.user.id;
  if (!(await requireDb(res))) return;

  let deleted;
  try {
    deleted = await OutcomeCapture.findOneAndDelete({
      predictionId: req.params.id,
      userId,
    });
  } catch {
    deleted = null;
  }
  if (!deleted) {
    return res.status(404).json({
      msg: 'No outcome recorded for this prediction.',
      code: 'OUTCOME_NOT_FOUND',
    });
  }
  return res.json({ predictionId: req.params.id, deleted: true });
});

// Everything else under /api/predictor is a hard 404.
router.use((_req, res) => res.status(404).json({ msg: 'Not found', code: 'NOT_FOUND' }));

module.exports = router;
