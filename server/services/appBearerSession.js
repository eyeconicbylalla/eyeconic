'use strict';

const crypto = require('crypto');
const { callAppApi, AppApiError } = require('../config/appApi');
const { buildSessionUser } = require('./appSession');

/**
 * Bearer-token authentication for the Eyeconic mentorship app (mobile).
 *
 * The website's browser clients authenticate with the encrypted HttpOnly
 * session cookie (services/appSession.js), which wraps the student's App
 * JWT. A React Native client has no cookie semantics we can rely on, but it
 * holds the SAME App JWT the cookie wraps — so it presents it directly as
 *   Authorization: Bearer <app-jwt>
 * and this service verifies it the only correct way: against the issuer.
 * The App API remains the identity authority; this server never verifies a
 * JWT signature itself (no shared secret, no second source of truth).
 *
 * Verification result shape (never throws):
 *   { status: 'authenticated', token, user }   App API confirmed the token
 *   { status: 'no-credentials' }               header absent or malformed
 *   { status: 'rejected' }                     App API replied 401
 *   { status: 'unavailable', error }           AppApiError (5xx/timeout/
 *                                              not configured) — caller maps
 *                                              to 503, never blames the user
 */

// How long a verified token's public profile snapshot is trusted before the
// next request re-verifies. Keeps the hot path off the App API (Render cold
// starts make a per-request verify genuinely slow) while staying well inside
// the App JWT's 7-day validity: a revoked/deleted user is still cut off
// within this window at the latest.
const BEARER_CACHE_TTL_MS = (() => {
  const raw = Number(process.env.APP_BEARER_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 15 * 60 * 1000;
})();

// Hard cap on cached verifications. Bounded so a token-spraying client
// cannot grow the map without limit; entries are pruned by expiry first and
// then oldest-first (Map preserves insertion order).
const BEARER_CACHE_MAX = 500;

// RFC 7235 auth-scheme is case-insensitive; one non-space token. Generous
// length cap so absurd headers are rejected before any hashing/upstream call.
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;
const TOKEN_MAX_LENGTH = 4096;

/** sha256(token) — the cache key; the raw JWT is never a map key or logged. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const verifiedCache = new Map(); // hashToken(token) -> { user, expiresAt }

// Per-IP brake on FAILED Bearer verifications (mirror of the handoff-consume
// brake in the App backend's integration route). A rejected token has no
// userId, so the predictor's per-user budgets never apply — without this, a
// token-spraying client turns every request into an upstream /auth/me call.
// In-memory (per instance, fail-open), same trade-off as that precedent.
// Only upstream-rejected tokens count: outages ('unavailable') and routine
// cookie-less browser probes ('no-credentials') must never build up a block.
const BEARER_FAIL_WINDOW_MS = 10 * 60 * 1000;
const bearerFailures = new Map(); // ip -> [timestamp, ...]

function tooManyBearerFailures(ip) {
  const limit = Number(process.env.APP_BEARER_FAIL_LIMIT);
  const max = Number.isFinite(limit) && limit >= 0 ? limit : 30;
  if (max === 0) return false; // brake explicitly disabled
  const now = Date.now();
  const recent = (bearerFailures.get(ip) || []).filter((ts) => now - ts < BEARER_FAIL_WINDOW_MS);
  if (recent.length === 0) bearerFailures.delete(ip);
  else bearerFailures.set(ip, recent);
  return recent.length >= max;
}

function recordBearerFailure(ip) {
  const now = Date.now();
  const recent = (bearerFailures.get(ip) || []).filter((ts) => now - ts < BEARER_FAIL_WINDOW_MS);
  recent.push(now);
  bearerFailures.set(ip, recent);
}

function cacheGet(key) {
  const entry = verifiedCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    verifiedCache.delete(key);
    return null;
  }
  return entry;
}

function cachePut(key, user) {
  // Prune expired entries, then enforce the cap oldest-first.
  const now = Date.now();
  for (const [k, entry] of verifiedCache) {
    if (now > entry.expiresAt) verifiedCache.delete(k);
  }
  while (verifiedCache.size >= BEARER_CACHE_MAX) {
    const oldest = verifiedCache.keys().next().value;
    verifiedCache.delete(oldest);
  }
  verifiedCache.set(key, { user, expiresAt: now + BEARER_CACHE_TTL_MS });
}

/** Extract the raw token from an Authorization header value, or null. */
function parseBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = BEARER_PATTERN.exec(headerValue);
  if (!match) return null;
  const token = match[1];
  if (token.length > TOKEN_MAX_LENGTH) return null;
  return token;
}

/**
 * Resolve an Authorization header value into an app session
 * ({ token, user }) using the App API as the authority.
 *
 * `ip` keys the failed-verification brake. Resolution order matters:
 *   1. parse — no usable Bearer → no-credentials (no state touched)
 *   2. verification cache — a recently verified token is free, so a
 *      legitimate user keeps working even from an IP the brake has tripped
 *      (shared NATs/CGNAT make IP blocks otherwise blunt)
 *   3. brake — a tripped IP is refused BEFORE an upstream verification call
 *   4. verify against /auth/me; a rejection is recorded toward the brake
 */
async function resolveBearerSession(headerValue, ip) {
  const token = parseBearerToken(headerValue);
  if (!token) return { status: 'no-credentials' };

  const key = hashToken(token);
  const cached = cacheGet(key);
  if (cached) {
    return { status: 'authenticated', token, user: cached.user };
  }

  if (ip && tooManyBearerFailures(ip)) {
    return { status: 'throttled' };
  }

  if (BEARER_CACHE_TTL_MS === 0) {
    // Caching explicitly disabled (e.g. debugging) — verify every time.
    return verifyAndBuild(token, ip);
  }

  let result;
  try {
    result = await verifyAndBuild(token, ip);
  } catch (error) {
    return { status: 'error', error };
  }
  // Cache only confirmations; rejections stay uncached so a user whose
  // token was just renewed is never locked out by a stale negative.
  if (result.status === 'authenticated') {
    cachePut(key, result.user);
  }
  return result;
}

async function verifyAndBuild(token, ip) {
  let appUser;
  try {
    // Same verification the website's own session refresh uses
    // (routes/appAuth.js GET /session): the App API answers with the
    // user document or 401. Freshness (revocation, deletion) is its call.
    appUser = await callAppApi('/auth/me', { userToken: token });
  } catch (error) {
    if (error instanceof AppApiError && error.status === 401) {
      if (ip) recordBearerFailure(ip);
      return { status: 'rejected' };
    }
    return { status: 'unavailable', error };
  }

  if (!appUser || typeof appUser !== 'object' || !(appUser._id || appUser.id)) {
    // A 200 without a usable user is a contract break upstream — treat as
    // an outage, not as a valid identity.
    return {
      status: 'unavailable',
      error: new AppApiError('Unexpected response from the Eyeconic App API.', {
        status: 503,
        code: 'APP_UNAVAILABLE',
      }),
    };
  }

  return { status: 'authenticated', token, user: buildSessionUser(appUser) };
}

/** Test hook — drop all cached verifications (mirrors predictor store.resetCache). */
function resetBearerSessionCache() {
  verifiedCache.clear();
  bearerFailures.clear();
}

module.exports = {
  resolveBearerSession,
  parseBearerToken,
  tooManyBearerFailures,
  recordBearerFailure,
  resetBearerSessionCache,
};
