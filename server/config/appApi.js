/**
 * Client for the Eyeconic Mentorship App API (Render) — the single source of
 * truth for students, quizzes, attempts and analytics.
 *
 * Only this server talks to the App API for the integrated experience:
 *  - Browser calls go to OUR /api/app-auth/* and /api/app/* routes, which
 *    attach the user's App JWT from an encrypted HttpOnly session cookie.
 *    The App JWT is therefore never exposed to website JavaScript.
 *  - The handoff-consume call is service-authenticated with
 *    APP_INTEGRATION_TOKEN (mirrored as INTEGRATION_SERVICE_TOKEN on the
 *    App backend).
 *
 * Render free-tier cold starts can take ~50s, so the default timeout is
 * deliberately generous; callers treat timeouts as 503/504, never as
 * authoritative "not found".
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.APP_API_TIMEOUT_MS || 55000);

// Dev default matches the app backend's local port (backend/server.js).
const DEV_APP_API_BASE_URL = 'http://localhost:3000/api';

// Local-development-only shared secret. MUST be identical to the app
// backend's dev default (backend/middleware/serviceAuth.js). Never used in
// production: there, both sides must set real values or the integration
// stays disabled (503 INTEGRATION_NOT_CONFIGURED).
const DEV_INTEGRATION_TOKEN = 'dev-integration-service-token-local-only-000';
const DEV_SESSION_SECRET = 'dev-session-secret-local-only-0000000000000';

const isProduction = () => process.env.NODE_ENV === 'production';

const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/**
 * Loop guard: APP_API_BASE_URL must point at the EYECONIC APP API, never at
 * this website server itself. A self-referencing base URL silently routes
 * App logins to this server's own legacy /api/auth/login (CRM) route —
 * which produces wrong-looking 401s (real app students are not CRM users)
 * and shape-mismatch 503s. Detect the obvious self-reference (localhost on
 * our own PORT) and turn it into an explicit, actionable error.
 */
/**
 * True when the App API target is a loopback address — i.e. local
 * development against the sibling eyeconic-app backend. Used to enrich
 * failure logs with the target and the remediation hint; remote targets
 * (production) keep the terse failure-class-only logging.
 */
function isLocalAppApiTarget(baseUrl) {
  if (!baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function detectSelfReference(baseUrl) {
  if (!baseUrl) return false;
  const ownPort = process.env.PORT || 5000;
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname;
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    return isLoopback && String(port) === String(ownPort);
  } catch {
    return false;
  }
}

function resolveAppApiBaseUrl() {
  const configured = (process.env.APP_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return isProduction() ? '' : DEV_APP_API_BASE_URL;
}

function resolveIntegrationToken() {
  const configured = (process.env.APP_INTEGRATION_TOKEN || '').trim();
  if (configured) return configured;
  if (isProduction()) return '';
  warnOnce(
    'appIntegrationToken',
    '[app-api] APP_INTEGRATION_TOKEN is not set — using the LOCAL-ONLY development token. Set real values in production.'
  );
  return DEV_INTEGRATION_TOKEN;
}

function resolveSessionSecret() {
  const configured = (process.env.SESSION_SECRET || '').trim();
  if (configured) return configured;
  if (isProduction()) return '';
  warnOnce(
    'appSessionSecret',
    '[app-session] SESSION_SECRET is not set — using a LOCAL-ONLY development secret. Set a real value in production.'
  );
  return DEV_SESSION_SECRET;
}

function isIntegrationConfigured() {
  const secret = resolveSessionSecret();
  return Boolean(
    resolveAppApiBaseUrl() &&
      resolveIntegrationToken() &&
      secret &&
      secret.length >= 32
  );
}

const APP_UNAVAILABLE_MESSAGE =
  'Eyeconic is taking a moment to respond. Please try again in a few seconds.';

class AppApiError extends Error {
  constructor(message, { status = 503, code = 'APP_UNAVAILABLE', upstream = null }) {
    super(message);
    this.name = 'AppApiError';
    this.status = status;
    this.code = code;
    this.upstream = upstream;
  }
}

/**
 * Perform a JSON request against the App API.
 *
 * @param {string} path — path under the App API base, e.g. '/auth/login'
 * @param {object} options
 * @param {string} [options.method='GET']
 * @param {object} [options.body] — JSON body
 * @param {string} [options.userToken] — Bearer user JWT from the session
 * @param {boolean} [options.serviceAuth=false] — use APP_INTEGRATION_TOKEN instead
 * @param {number} [options.timeoutMs]
 * @param {string} [options.requestId] — for correlated logging
 * @returns {Promise<object>} parsed response body
 * @throws {AppApiError} — with mapped status/code; never throws raw network errors
 */
async function callAppApi(path, options = {}) {
  const baseUrl = resolveAppApiBaseUrl();
  if (!baseUrl) {
    throw new AppApiError('Website integration is not configured on this server.', {
      status: 503,
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
  }
  if (detectSelfReference(baseUrl)) {
    warnOnce(
      'appApiSelfReference',
      `[app-api] FATAL CONFIG: APP_API_BASE_URL (${baseUrl}) points at THIS website server, not the Eyeconic App API. ` +
        'App logins would loop back to the legacy CRM route. Set APP_API_BASE_URL to the App API, e.g. http://localhost:3000/api locally.'
    );
    throw new AppApiError(
      'Sign-in is misconfigured on this server (the Eyeconic API address points back at the website). Please contact support.',
      { status: 503, code: 'APP_API_MISCONFIGURED' }
    );
  }

  const {
    method = 'GET',
    body,
    userToken,
    serviceAuth = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requestId,
  } = options;

  const token = serviceAuth ? resolveIntegrationToken() : userToken;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestId) headers['X-Request-Id'] = requestId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';
    // Never log tokens, bodies or full URLs — just the failure class. A
    // LOCAL target is the exception: localhost:3000 carries no secrets, and
    // an unreachable local backend is the #1 cause of dashboard-wide 503s in
    // development, so name the target and the fix.
    const localTarget = isLocalAppApiTarget(baseUrl);
    console.error(
      `[app-api] ${isAbort ? 'timeout' : 'network error'} calling ${method} ${path}`,
      {
        requestId,
        name: error && error.name,
        ...(localTarget
          ? {
              target: baseUrl,
              hint:
                'The local App backend is not running — every /api/app/* route returns 503 until it is. ' +
                'Start the full stack: powershell -ExecutionPolicy Bypass -File scripts\\dev-all.ps1 ' +
                '(or the backend alone: cd eyeconic-app\\backend && npm run dev)',
            }
          : {}),
      }
    );
    throw new AppApiError(
      isAbort ? 'The Eyeconic service took too long to respond.' : APP_UNAVAILABLE_MESSAGE,
      { status: isAbort ? 504 : 503, code: isAbort ? 'APP_TIMEOUT' : 'APP_UNAVAILABLE' }
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const upstream = {
      status: response.status,
      message: (data && (data.message || data.msg)) || null,
      code: (data && (data.code || data.errorCode)) || null,
      // Narrow passthrough for the Daily PYQ date-rollover hint (the App API
      // returns today's date so the client can refetch immediately).
      currentDate: data && typeof data.currentDate === 'string' ? data.currentDate : null,
    };
    // 4xx from the App API is a meaningful answer (bad credentials, locked
    // section, not found…); 5xx is an outage — degrade, don't leak internals.
    if (response.status >= 500) {
      console.error(`[app-api] upstream 5xx on ${method} ${path}`, {
        requestId,
        upstreamStatus: response.status,
      });
      throw new AppApiError(APP_UNAVAILABLE_MESSAGE, { status: 503, code: 'APP_UNAVAILABLE' });
    }
    throw new AppApiError(
      upstream.message || 'The request to Eyeconic was rejected.',
      {
        status: response.status,
        code: upstream.code || 'APP_REQUEST_REJECTED',
        upstream,
      }
    );
  }

  return data;
}

module.exports = {
  resolveAppApiBaseUrl,
  isLocalAppApiTarget,
  isIntegrationConfigured,
  callAppApi,
  AppApiError,
  APP_UNAVAILABLE_MESSAGE,
};
