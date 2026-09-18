const { readSession } = require('../services/appSession');

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

module.exports = requireAppSession;
