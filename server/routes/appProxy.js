const express = require('express');
const { callAppApi, AppApiError } = require('../config/appApi');
const { clearSessionCookie } = require('../services/appSession');
const requireAppSession = require('../middleware/appSession');
const { sameOriginGuard } = require('../middleware/sameOrigin');

const router = express.Router();

/**
 * Allowlisted proxy from the website to the Eyeconic App API (source of
 * truth for quizzes, attempts and analytics).
 *
 * Design rules:
 *  - EXPLICIT route table only — never a generic passthrough (no SSRF, no
 *    accidental exposure of admin endpoints).
 *  - The caller's identity is the student's App JWT from the session cookie;
 *    the App API enforces per-user authorization exactly as it does for the
 *    mobile app. This server adds no authority of its own.
 *  - Query parameters are filtered per route.
 *  - App API 401 → session cleared + 401 (client returns to login).
 *  - App API 403/404/409/429 → passed through with the upstream message.
 *  - Timeouts / 5xx → 503 with a friendly message (Render cold starts).
 */

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const GROUP_BY_VALUES = new Set(['section', 'subject', 'topic', 'tag']);
const RANGE_VALUES = new Set(['30d', '90d', '180d', '365d', 'all']);

function sanitizeInt(value, { min, max, fallback }) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < min || num > max) return fallback;
  return num;
}

function pickGroupBy(raw) {
  const value = String(raw || '').trim();
  return GROUP_BY_VALUES.has(value) ? value : 'section';
}

function pickAnalyticsQuery(query) {
  const out = {};
  if (query.range && RANGE_VALUES.has(String(query.range))) out.range = String(query.range);
  const page = sanitizeInt(query.page, { min: 1, max: 100, fallback: null });
  if (page) out.page = page;
  const limit = sanitizeInt(query.limit, { min: 1, max: 50, fallback: null });
  if (limit) out.limit = limit;
  return out;
}

function buildQueryString(params) {
  const search = new URLSearchParams(params);
  const str = search.toString();
  return str ? `?${str}` : '';
}

/**
 * Small per-instance GET cache. Only the quiz list is cached (10s) — enough
 * to absorb dashboard bursts per warm lambda without ever showing stale
 * attempt/answer state. Attempt-status calls are never cached.
 */
const QUIZ_LIST_CACHE_TTL_MS = 10 * 1000;
const quizListCache = new Map(); // key: `${userId}` → { at, data }

function sendAppError(res, error, requestId) {
  if (error instanceof AppApiError) {
    if (error.status === 401) {
      // Upstream rejected the session token — end the website session.
      clearSessionCookie(res);
      return res.status(401).json({
        msg: 'Your session has expired. Please log in again.',
        code: 'APP_SESSION_REQUIRED',
      });
    }
    return res.status(error.status).json({
      msg: error.message,
      code: error.code,
      ...(error.upstream && error.upstream.code ? { appCode: error.upstream.code } : {}),
      // Daily PYQ date-rollover hint so the client can refetch immediately.
      ...(error.upstream && typeof error.upstream.currentDate === 'string'
        ? { currentDate: error.upstream.currentDate }
        : {}),
    });
  }
  console.error('[app-proxy] Unexpected error', {
    requestId,
    message: error && error.message,
    name: error && error.name,
  });
  return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
}

// CSRF defence-in-depth for state-changing routes now lives in
// middleware/sameOrigin.js: the browser's Origin must be one of the site's
// ALLOWED ORIGINS (localhost in development). Comparing Origin to the Host
// header — the previous approach — rejected the site's own traffic behind
// rewriting proxies (Vite dev proxy in development, Vercel's /api rewrite in
// production).

router.use(requireAppSession);
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sameOriginGuard(req, res, next);
  return next();
});

// ---- Tests (quiz list) ----------------------------------------------------

router.get('/quizzes', async (req, res) => {
  const userId = req.appSession.user ? req.appSession.user.id : 'unknown';
  const cached = quizListCache.get(userId);
  if (cached && Date.now() - cached.at < QUIZ_LIST_CACHE_TTL_MS) {
    return res.json(cached.data);
  }
  try {
    const data = await callAppApi('/quizzes', {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    if (Array.isArray(data)) {
      quizListCache.set(userId, { at: Date.now(), data });
      if (quizListCache.size > 200) {
        const oldest = quizListCache.keys().next().value;
        quizListCache.delete(oldest);
      }
    }
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- Attempt status/resume (declared BEFORE /quizzes/:quizId) --------------

router.get('/quizzes/attempt/:attemptId', async (req, res) => {
  const { attemptId } = req.params;
  if (!OBJECT_ID_PATTERN.test(attemptId)) {
    return res.status(400).json({ msg: 'Invalid attempt id', code: 'VALIDATION_ERROR' });
  }
  try {
    const data = await callAppApi(`/quizzes/attempt/${attemptId}`, {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- Student analytics (self) ----------------------------------------------

router.get('/analytics/me', async (req, res) => {
  try {
    const data = await callAppApi(
      `/quizzes/analytics/me${buildQueryString(pickAnalyticsQuery(req.query))}`,
      { userToken: req.appSession.token, requestId: req.requestId }
    );
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Anonymous cohort comparison (student self): own latest finalized attempt
// vs aggregate statistics of the same test's cohort. The App API computes
// and anonymises everything — this proxy forwards no parameters.
router.get('/analytics/me/comparison', async (req, res) => {
  try {
    const data = await callAppApi('/quizzes/analytics/me/comparison', {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- Quiz detail / lifecycle (per quiz) -------------------------------------
//
// NOTE: routes are declared FLAT on this router on purpose — Express 4 does
// not propagate params from `router.use('/quizzes/:quizId', subRouter)`
// mounts into the sub-router's req.params. `/quizzes/attempt/:attemptId`
// above must stay registered before `/quizzes/:quizId` so "attempt" is never
// captured as a quiz id.

function requireQuizId(req, res, next) {
  if (!OBJECT_ID_PATTERN.test(req.params.quizId)) {
    return res.status(400).json({ msg: 'Invalid quiz id', code: 'VALIDATION_ERROR' });
  }
  return next();
}

function requireAttemptId(req, res, next) {
  if (!OBJECT_ID_PATTERN.test(req.params.attemptId)) {
    return res.status(400).json({ msg: 'Invalid attempt id', code: 'VALIDATION_ERROR' });
  }
  return next();
}

// Quiz detail (instructions, questions without answers, attemptStatus).
router.get('/quizzes/:quizId', requireQuizId, async (req, res) => {
  try {
    const data = await callAppApi(`/quizzes/${req.params.quizId}`, {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Start / resume an attempt. The App API is authoritative: it resumes an
// in-progress attempt, refuses completed ones (400) and enforces schedule.
router.post('/quizzes/:quizId/start', requireQuizId, async (req, res) => {
  try {
    const body = {};
    if (req.body && typeof req.body.precheckToken === 'string') {
      body.precheckToken = req.body.precheckToken;
    }
    const data = await callAppApi(`/quizzes/${req.params.quizId}/start`, {
      method: 'POST',
      body,
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    quizListCache.delete(req.appSession.user ? req.appSession.user.id : 'unknown');
    return res.status(200).json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Save one answer (autosave). 403 SECTION_LOCKED / TIME_EXPIRED pass through.
router.put(
  '/quizzes/:quizId/attempt/:attemptId/answer',
  requireQuizId,
  requireAttemptId,
  async (req, res) => {
    const payload = req.body || {};
    const questionIndex = Number(payload.questionIndex);
    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 10000) {
      return res.status(400).json({ msg: 'Invalid questionIndex', code: 'VALIDATION_ERROR' });
    }
    // Only forward the fields the App API accepts — 'selectedAnswer' is Mixed
    // (number | number[] | record) and is validated server-side there.
    const body = {
      questionIndex,
      selectedAnswer: 'selectedAnswer' in payload ? payload.selectedAnswer : -1,
    };
    if (typeof payload.questionId === 'string') body.questionId = payload.questionId;
    if (typeof payload.markedForReview === 'boolean') body.markedForReview = payload.markedForReview;
    const timeSpent = Number(payload.timeSpent);
    if (Number.isFinite(timeSpent) && timeSpent >= 0 && timeSpent < 24 * 60 * 60) {
      body.timeSpent = Math.round(timeSpent);
    }
    try {
      const data = await callAppApi(
        `/quizzes/${req.params.quizId}/attempt/${req.params.attemptId}/answer`,
        {
          method: 'PUT',
          body,
          userToken: req.appSession.token,
          requestId: req.requestId,
        }
      );
      return res.json(data);
    } catch (error) {
      return sendAppError(res, error, req.requestId);
    }
  }
);

// Submit a section (section-locked quizzes).
router.post(
  '/quizzes/:quizId/attempt/:attemptId/sections/:sectionIndex/submit',
  requireQuizId,
  requireAttemptId,
  async (req, res) => {
    const { sectionIndex } = req.params;
    if (!/^\d+$/.test(sectionIndex) || Number(sectionIndex) > 100) {
      return res.status(400).json({ msg: 'Invalid section index', code: 'VALIDATION_ERROR' });
    }
    try {
      const data = await callAppApi(
        `/quizzes/${req.params.quizId}/attempt/${req.params.attemptId}/sections/${sectionIndex}/submit`,
        {
          method: 'POST',
          body: { isAutoSubmit: req.body && req.body.isAutoSubmit === true },
          userToken: req.appSession.token,
          requestId: req.requestId,
        }
      );
      return res.json(data);
    } catch (error) {
      return sendAppError(res, error, req.requestId);
    }
  }
);

// Submit the whole attempt. Idempotent upstream (200 isAlreadySubmitted /
// 409 SUBMIT_IN_PROGRESS) — both pass straight through.
router.post(
  '/quizzes/:quizId/attempt/:attemptId/submit',
  requireQuizId,
  requireAttemptId,
  async (req, res) => {
    try {
      const data = await callAppApi(
        `/quizzes/${req.params.quizId}/attempt/${req.params.attemptId}/submit`,
        {
          method: 'POST',
          body: { isAutoSubmit: req.body && req.body.isAutoSubmit === true },
          userToken: req.appSession.token,
          requestId: req.requestId,
        }
      );
      quizListCache.delete(req.appSession.user ? req.appSession.user.id : 'unknown');
      return res.json(data);
    } catch (error) {
      return sendAppError(res, error, req.requestId);
    }
  }
);

// Tab-switch logging (web parity with the app's proctoring/integrity signal).
router.post(
  '/quizzes/:quizId/attempt/:attemptId/tab-switch',
  requireQuizId,
  requireAttemptId,
  async (_req, res) => {
    try {
      const data = await callAppApi(
        `/quizzes/${_req.params.quizId}/attempt/${_req.params.attemptId}/tab-switch`,
        {
          method: 'POST',
          body: {},
          userToken: _req.appSession.token,
          requestId: _req.requestId,
        }
      );
      return res.json(data);
    } catch (error) {
      // Tab-switch logging must never break the taking experience.
      if (error instanceof AppApiError && error.status >= 400 && error.status < 500) {
        return res.json({ message: 'Tab switch not recorded', ignored: true });
      }
      return sendAppError(res, error, _req.requestId);
    }
  }
);

// Own results for a finalized attempt.
router.get(
  '/quizzes/:quizId/attempt/:attemptId/results',
  requireQuizId,
  requireAttemptId,
  async (req, res) => {
    try {
      const data = await callAppApi(
        `/quizzes/${req.params.quizId}/attempt/${req.params.attemptId}/results${buildQueryString({
          groupBy: pickGroupBy(req.query.groupBy),
        })}`,
        { userToken: req.appSession.token, requestId: req.requestId }
      );
      return res.json(data);
    } catch (error) {
      return sendAppError(res, error, req.requestId);
    }
  }
);

// Request a retest on a finalized attempt.
router.post(
  '/quizzes/:quizId/attempt/:attemptId/request-retest',
  requireQuizId,
  requireAttemptId,
  async (req, res) => {
    try {
      const data = await callAppApi(
        `/quizzes/${req.params.quizId}/attempt/${req.params.attemptId}/request-retest`,
        {
          method: 'POST',
          body: {},
          userToken: req.appSession.token,
          requestId: req.requestId,
        }
      );
      return res.json(data);
    } catch (error) {
      return sendAppError(res, error, req.requestId);
    }
  }
);

// ---- Daily PYQ (10 past questions per day, App API authoritative) -----------

// Shared page/limit sanitizer for paginated history surfaces (Daily PYQ,
// Mini CCT).
function pickDailyPyqHistoryQuery(query) {
  const out = {};
  const page = sanitizeInt(query.page, { min: 1, max: 1000, fallback: null });
  if (page) out.page = page;
  const limit = sanitizeInt(query.limit, { min: 1, max: 50, fallback: null });
  if (limit) out.limit = limit;
  return out;
}

// Today's frozen set (or the student's completed attempt) + streak.
router.get('/daily-pyq/today', async (req, res) => {
  try {
    const data = await callAppApi('/daily-pyq/today', {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Submit today's answers. Only whitelisted fields are forwarded; grading,
// the daily set and scoring stay entirely server-side in the App API.
router.post('/daily-pyq/submit', async (req, res) => {
  const payload = req.body || {};
  if (typeof payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return res.status(400).json({ msg: 'Invalid date', code: 'VALIDATION_ERROR' });
  }
  if (payload.answers !== undefined && !Array.isArray(payload.answers)) {
    return res.status(400).json({ msg: 'Invalid answers', code: 'VALIDATION_ERROR' });
  }
  const body = { date: payload.date, answers: Array.isArray(payload.answers) ? payload.answers : [] };
  const timeTaken = Number(payload.timeTakenSeconds);
  if (Number.isFinite(timeTaken) && timeTaken >= 0) {
    body.timeTakenSeconds = Math.round(timeTaken);
  }
  try {
    const data = await callAppApi('/daily-pyq/submit', {
      method: 'POST',
      body,
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Own attempt history (paginated summaries).
router.get('/daily-pyq/history', async (req, res) => {
  try {
    const data = await callAppApi(
      `/daily-pyq/history${buildQueryString(pickDailyPyqHistoryQuery(req.query))}`,
      { userToken: req.appSession.token, requestId: req.requestId }
    );
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// One own attempt's graded detail.
router.get('/daily-pyq/attempts/:attemptId', requireAttemptId, async (req, res) => {
  try {
    const data = await callAppApi(`/daily-pyq/attempts/${req.params.attemptId}`, {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- Mini CCT (30-question mini grand test, App API authoritative) ----------

// Dashboard card payload: latest visible Mini CCT + the caller's status.
router.get('/mini-cct/latest', async (req, res) => {
  try {
    const data = await callAppApi('/mini-cct/latest', {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Own Mini CCT attempt history (paginated summaries).
router.get('/mini-cct/attempts', async (req, res) => {
  try {
    const data = await callAppApi(
      `/mini-cct/attempts${buildQueryString(pickDailyPyqHistoryQuery(req.query))}`,
      { userToken: req.appSession.token, requestId: req.requestId }
    );
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// One own attempt's analysis dashboard. All scoring, database averages,
// percentile and free-user gating happen upstream in the App API.
router.get('/mini-cct/attempts/:attemptId/analysis', requireAttemptId, async (req, res) => {
  try {
    const data = await callAppApi(`/mini-cct/attempts/${req.params.attemptId}/analysis`, {
      userToken: req.appSession.token,
      requestId: req.requestId,
    });
    return res.json(data);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// Everything not in the table is a hard 404 — no fall-through proxying.
router.use((_req, res) =>
  res.status(404).json({ msg: 'Not found', code: 'NOT_FOUND' })
);

module.exports = router;
