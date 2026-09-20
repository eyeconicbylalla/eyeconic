'use strict';

/**
 * CSRF defence-in-depth for state-changing routes: when the browser sends an
 * Origin header, it must belong to this site.
 *
 * The check is against the ALLOWED-ORIGIN ALLOWLIST (the same list used for
 * CORS in server.js), NOT against the request's Host header. Comparing
 * Origin to Host breaks behind every rewriting proxy — the Vite dev proxy
 * (changeOrigin rewrites Host to :5000 while the page is on :5173) and the
 * production Vercel rewrite (/api → the server project's domain) — which
 * would reject the site's own legitimate traffic in dev AND production.
 *
 * Properties:
 *  - no Origin (mobile app, curl, server-to-server) → allowed (the session
 *    cookie is HttpOnly + SameSite=Lax, which already blocks cross-site POSTs)
 *  - Origin in the allowlist (production domains, or anything via
 *    ALLOWED_ORIGINS) → allowed
 *  - localhost/127.0.0.1 origins → allowed OUTSIDE production only
 *  - anything else → 403 CSRF_REJECTED
 */

const DEFAULT_PRODUCTION_ORIGINS = [
  'https://www.eyeconicneetpg.com',
  'https://eyeconicneetpg.com',
];
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/** Same resolution order as server.js CORS: ALLOWED_ORIGINS env, else site defaults. */
function resolveAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_PRODUCTION_ORIGINS);
}

function sameOriginGuard(req, res, next) {
  const origin = req.header('Origin');
  if (!origin) return next(); // non-browser client
  if (resolveAllowedOrigins().has(origin)) return next();
  if (process.env.NODE_ENV !== 'production' && LOCAL_DEV_ORIGIN.test(origin)) {
    return next();
  }
  return res.status(403).json({ msg: 'Cross-origin request rejected.', code: 'CSRF_REJECTED' });
}

module.exports = { sameOriginGuard, resolveAllowedOrigins, DEFAULT_PRODUCTION_ORIGINS };
