const crypto = require('crypto');

/**
 * Encrypted, stateless session for students authenticated against the
 * Eyeconic App API.
 *
 * The session cookie wraps the student's App JWT + a profile snapshot in an
 * AES-256-GCM envelope keyed by SESSION_SECRET. Properties:
 *
 *  - HttpOnly + Secure + SameSite=Lax: never readable by page JavaScript and
 *    never sent on cross-site POSTs (CSRF). Path=/api scopes it to the API.
 *  - Stateless: works on Vercel serverless (no store, no cold-start loss).
 *  - Expiry mirrors the App JWT (7 days). The App API remains the authority:
 *    whenever the wrapped token stops verifying there, every proxied call
 *    clears the cookie and the client returns to the login screen.
 *  - No token, email or name ever appears in a URL.
 */

const SESSION_COOKIE_NAME = 'ec_app_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // mirrors the App API's 7d user JWT

// AES-256-GCM: 12-byte IV, 16-byte auth tag, ciphertext — all base64url.
const IV_LENGTH = 12;
const VERSION = 'v1';

function sessionKey() {
  // Same resolution order as config/appApi.js: explicit env value, then the
  // local-only development secret, never anything in production.
  const secret = (process.env.SESSION_SECRET || '').trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-session-secret-local-only-0000000000000');
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set (32+ characters) to use website-app sessions.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSession(payload) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decryptSession(cookieValue) {
  if (typeof cookieValue !== 'string' || !cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  let iv, tag, ciphertext;
  try {
    iv = Buffer.from(parts[1], 'base64url');
    tag = Buffer.from(parts[2], 'base64url');
    ciphertext = Buffer.from(parts[3], 'base64url');
  } catch {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (!payload || typeof payload !== 'object' || typeof payload.token !== 'string') return null;
    return payload;
  } catch {
    // Wrong key or tampered cookie — treat as anonymous.
    return null;
  }
}

/** Public profile snapshot kept alongside the token (never sensitive). */
function buildSessionUser(appUser) {
  if (!appUser || typeof appUser !== 'object') return null;
  return {
    id: String(appUser._id || appUser.id),
    name: typeof appUser.name === 'string' ? appUser.name : '',
    email: typeof appUser.email === 'string' ? appUser.email : '',
    role: typeof appUser.role === 'string' ? appUser.role : 'student',
    isFreeUser: appUser.isFreeUser === true,
    profilePicture: typeof appUser.profilePicture === 'string' ? appUser.profilePicture : null,
  };
}

function createSessionPayload(appToken, appUser) {
  return {
    token: appToken,
    user: buildSessionUser(appUser),
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

function setSessionCookie(res, appToken, appUser) {
  const value = encryptSession(createSessionPayload(appToken, appUser));
  // Prefix with __Host- in production? __Host- requires Secure + Path=/ —
  // our Path=/api scoping is intentional, so keep the plain name.
  res.cookie(SESSION_COOKIE_NAME, value, sessionCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
}

function readSession(req) {
  const cookieValue = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : undefined;
  const payload = decryptSession(cookieValue);
  if (!payload) return null;
  if (Date.now() > payload.expiresAt) return null;
  return payload;
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  encryptSession,
  decryptSession,
  buildSessionUser,
  setSessionCookie,
  clearSessionCookie,
  readSession,
};
