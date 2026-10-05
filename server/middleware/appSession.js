'use strict';

const { readSession } = require('../services/appSession');
const { resolveBearerSession } = require('../services/appBearerSession');

/**
 * Guards the /api/app/* proxy surface (and /api/app-auth/session): resolves
 * the encrypted session cookie into req.appSession = { token, user }.
 * No/invalid/expired cookie → 401 APP_SESSION_REQUIRED (the client shows the
 * login screen). Session-validity against the App API is enforced by the
 * upstream on every proxied call.
 */
function requireAppSession(req, res, next) {
  const session = readSession(req);
  if (!session || !session.token) {
    return res.status(401).json({
      msg: 'Your session has expired. Please log in again.',
      code: 'APP_SESSION_REQUIRED',
    });
  }
  req.appSession = session;
  next();
}

/**
 * Cookie-first variant for surfaces that also serve the mobile mentorship
 * app (today: /api/predictor only).
 *
 * Resolution order:
 *   1. Valid session cookie — byte-identical to requireAppSession; the
 *      website's browser flow is completely unchanged and an Authorization
 *      header, if present, is ignored.
 *   2. Otherwise Authorization: Bearer <app JWT> — verified against the App
 *      API (/auth/me, short-lived cache), then attached as the same
 *      req.appSession = { token, user } shape downstream code already uses.
 *
 * Failure mapping (same envelope everywhere, so every client can treat
 * "not authenticated" identically):
 *   - no cookie AND no/invalid Authorization → 401 APP_SESSION_REQUIRED
 *   - App API rejects the token (invalid/expired/forged) → 401 APP_SESSION_REQUIRED
 *   - App API unreachable/misconfigured → its status/code passthrough
 *     (503/504) — an outage must never masquerade as a login problem
 *   - too many failed Bearer verifications from this IP → 429 RATE_LIMITED
 *     (recently verified tokens still pass via the verification cache)
 */
async function requireAppSessionOrBearer(req, res, next) {
  const session = readSession(req);
  if (session && session.token) {
    req.appSession = session;
    return next();
  }

  let result;
  try {
    result = await resolveBearerSession(req.header('Authorization'), req.ip);
  } catch (error) {
    // resolveBearerSession is written not to throw; this is a belt-and-
    // braces guard so a bug can never hang the request.
    console.error('[app-session] Bearer resolution failed', {
      message: error && error.message,
      name: error && error.name,
    });
    return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
  }

  if (result.status === 'authenticated') {
    req.appSession = { token: result.token, user: result.user };
    return next();
  }

  if (result.status === 'throttled') {
    return res.status(429).json({
      msg: 'Too many invalid sign-in attempts. Please try again later.',
      code: 'RATE_LIMITED',
    });
  }

  if (result.status === 'unavailable') {
    const { error } = result;
    const status = error && Number.isInteger(error.status) ? error.status : 503;
    return res.status(status).json({
      msg: (error && error.message) || 'Eyeconic is taking a moment to respond. Please try again.',
      code: (error && error.code) || 'APP_UNAVAILABLE',
    });
  }

  if (result.status === 'error') {
    console.error('[app-session] Unexpected Bearer error', {
      message: result.error && result.error.message,
      name: result.error && result.error.name,
    });
    return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
  }

  // no-credentials (header absent/malformed) or rejected (App API said 401,
  // recorded toward the per-IP brake inside the service): exactly the
  // response a missing cookie produces.
  return res.status(401).json({
    msg: 'Your session has expired. Please log in again.',
    code: 'APP_SESSION_REQUIRED',
  });
}

module.exports = requireAppSession;
module.exports.requireAppSession = requireAppSession;
module.exports.requireAppSessionOrBearer = requireAppSessionOrBearer;
