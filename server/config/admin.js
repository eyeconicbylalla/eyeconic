const crypto = require('crypto');

// Admin credentials live ONLY in server-side environment variables.
// They are never hardcoded, never sent to the frontend, and never
// accepted through URLs or query strings.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_TOKEN_EXPIRES = process.env.ADMIN_TOKEN_EXPIRES || '8h';

// Fallback identity used for display-only fields (blog author metadata,
// audit log actors). This is not a credential.
const ADMIN_DISPLAY_EMAIL = 'admin@eyeconic1.com';

function isAdminConfigured() {
  return Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();

const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

function isValidAdminCredentials(email, password) {
  if (!isAdminConfigured() || !email || !password) return false;
  const emailMatch = safeEqual(String(email).trim().toLowerCase(), ADMIN_EMAIL);
  const passwordMatch = safeEqual(String(password), ADMIN_PASSWORD);
  return emailMatch && passwordMatch;
}

module.exports = {
  ADMIN_TOKEN_EXPIRES,
  getAdminIdentity: () => ADMIN_EMAIL || ADMIN_DISPLAY_EMAIL,
  isAdminConfigured,
  isValidAdminCredentials,
};
