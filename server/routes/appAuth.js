const express = require('express');
const {
  callAppApi,
  AppApiError,
  isIntegrationConfigured,
} = require('../config/appApi');
const {
  setSessionCookie,
  clearSessionCookie,
  buildSessionUser,
  readSession,
} = require('../services/appSession');
const { hitRateLimit, clientIp } = require('../services/rateLimiter');
const { isValidEmail } = require('../utils/validation');

const router = express.Router();

/**
 * Student authentication against the Eyeconic App API (the identity
 * authority). All responses are JSON; the browser only ever receives the
 * public profile — the App JWT lives inside the encrypted HttpOnly cookie.
 */

const LOGIN_MAX_PER_IP = Number(process.env.APP_LOGIN_MAX_PER_IP || 10);
const HANDOFF_MAX_PER_IP = Number(process.env.APP_HANDOFF_MAX_PER_IP || 20);

const SESSION_ME_TIMEOUT_MS = Number(process.env.APP_SESSION_ME_TIMEOUT_MS || 10000);

const notConfigured = (res) =>
  res.status(503).json({
    msg: 'Website sign-in is not configured on this server.',
    code: 'INTEGRATION_NOT_CONFIGURED',
  });

const appErrorResponse = (res, error, fallbackStatus = 503, fallbackCode = 'APP_UNAVAILABLE') => {
  if (error instanceof AppApiError) {
    return res.status(error.status).json({ msg: error.message, code: error.code });
  }
  console.error('[app-auth] Unexpected error', {
    message: error && error.message,
    stack: error && error.stack,
  });
  return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
};

// POST /api/app-auth/login { email, password }
router.post('/login', async (req, res) => {
  try {
    if (!isIntegrationConfigured()) return notConfigured(res);

    const limit = await hitRateLimit(`app-login:ip:${clientIp(req)}`, {
      windowMs: 15 * 60 * 1000,
      max: LOGIN_MAX_PER_IP,
    });
    if (!limit.allowed) {
      return res.status(429).json({
        msg: 'Too many login attempts. Please try again later.',
        code: 'RATE_LIMITED',
      });
    }

    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ msg: 'Invalid email or password.', code: 'VALIDATION_ERROR' });
    }

    const data = await callAppApi('/auth/login', {
      method: 'POST',
      body: { email, password },
      requestId: req.requestId,
    });

    if (!data || typeof data.token !== 'string' || !data.user) {
      // Log the response SHAPE only (top-level keys) — never the body, which
      // may carry user PII. The real App login always returns {token, user};
      // a bare {token} means we reached a non-App endpoint (e.g. this
      // server's own legacy /api/auth/login via a bad APP_API_BASE_URL).
      console.error('[app-auth] App login response missing token/user', {
        requestId: req.requestId,
        responseType: data === null ? 'null' : typeof data,
        responseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
      });
      return res.status(503).json({ msg: 'Sign-in is temporarily unavailable.', code: 'APP_UNAVAILABLE' });
    }

    setSessionCookie(res, data.token, data.user);
    return res.json({ user: buildSessionUser(data.user) });
  } catch (error) {
    // Map the App API's 400 or 401 "Invalid email or password." to a clean 401 —
    // same user-facing outcome, standard semantics for the web client.
    if (error instanceof AppApiError && (error.status === 400 || error.status === 401)) {
      return res.status(401).json({ msg: error.message || 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    }
    return appErrorResponse(res, error);
  }
});

// GET /api/app-auth/session — current student.
//
// Contract: anonymous visitors get 200 {user: null} — a session PROBE must
// never be an error, or every public page load shows console failures.
// 401 is reserved for a real, previously-working session that the App API
// has rejected (expired/revoked) — the client then returns to the login UI.
router.get('/session', async (req, res) => {
  try {
    if (!isIntegrationConfigured()) return notConfigured(res);

    const session = readSession(req);
    if (!session || !session.user) {
      // No cookie (or expired long ago): plain "not signed in".
      return res.json({ user: null });
    }

    try {
      const freshUser = await callAppApi('/auth/me', {
        userToken: session.token,
        timeoutMs: SESSION_ME_TIMEOUT_MS,
        requestId: req.requestId,
      });
      if (freshUser && (freshUser._id || freshUser.id)) {
        return res.json({ user: buildSessionUser(freshUser) });
      }
      throw new AppApiError('Unexpected response from Eyeconic.', { status: 503 });
    } catch (error) {
      if (error instanceof AppApiError && error.status === 401) {
        // The App JWT no longer verifies upstream (expired/revoked/deleted
        // user) — end the website session.
        clearSessionCookie(res);
        return res.status(401).json({
          msg: 'Your session has expired. Please log in again.',
          code: 'APP_SESSION_REQUIRED',
        });
      }
      // Cold start / transient outage: fall back to the session snapshot so
      // the shell still renders; data calls will surface their own errors.
      return res.json({ user: session.user, stale: true });
    }
  } catch (error) {
    return appErrorResponse(res, error);
  }
});

// POST /api/app-auth/logout
router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  return res.json({ msg: 'Logged out' });
});

// POST /api/app-auth/handoff { code, dest } — app → website session bridge.
router.post('/handoff', async (req, res) => {
  try {
    if (!isIntegrationConfigured()) return notConfigured(res);

    const limit = await hitRateLimit(`app-handoff:ip:${clientIp(req)}`, {
      windowMs: 10 * 60 * 1000,
      max: HANDOFF_MAX_PER_IP,
    });
    if (!limit.allowed) {
      return res.status(429).json({
        msg: 'Too many link activations. Please try again later.',
        code: 'RATE_LIMITED',
      });
    }

    const code = String((req.body || {}).code || '').trim();
    const dest = String((req.body || {}).dest || '');
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) {
      return res.status(400).json({
        msg: 'This link is invalid or has expired. Please reopen the website from the Eyeconic app.',
        code: 'HANDOFF_INVALID',
      });
    }
    if (dest && !/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*$/.test(dest)) {
      return res.status(400).json({ msg: 'Invalid destination.', code: 'VALIDATION_ERROR' });
    }

    const data = await callAppApi('/integration/v1/handoff/consume', {
      method: 'POST',
      body: { code },
      serviceAuth: true,
      requestId: req.requestId,
    });

    if (!data || typeof data.token !== 'string' || !data.user) {
      console.error('[app-auth] Handoff consume response missing token/user', {
        requestId: req.requestId,
        responseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
      });
      return res.status(503).json({ msg: 'Sign-in is temporarily unavailable.', code: 'APP_UNAVAILABLE' });
    }

    setSessionCookie(res, data.token, data.user);
    return res.json({ user: buildSessionUser(data.user), dest: dest || '/dashboard' });
  } catch (error) {
    if (error instanceof AppApiError && (error.status === 400 || error.status === 404)) {
      return res.status(400).json({
        msg: 'This link is invalid or has expired. Please reopen the website from the Eyeconic app.',
        code: 'HANDOFF_INVALID',
      });
    }
    if (error instanceof AppApiError && error.status === 401) {
      // Service credentials rejected upstream — a configuration problem, not
      // a user error. Never blame the user for it.
      console.error('[app-auth] Handoff service auth rejected — check APP_INTEGRATION_TOKEN');
      return res.status(503).json({
        msg: 'Website sign-in is temporarily unavailable.',
        code: 'APP_UNAVAILABLE',
      });
    }
    return appErrorResponse(res, error);
  }
});

module.exports = router;
