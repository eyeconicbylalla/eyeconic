const jwt = require('jsonwebtoken');
const { isAdminConfigured } = require('../config/admin');

// Authorization gate for admin endpoints. Expects a short-lived admin
// JWT issued by POST /api/auth/admin/login in the Authorization header.
//   missing/invalid/expired token -> 401
//   valid token without admin role -> 403
module.exports = function requireAdmin(req, res, next) {
  if (!isAdminConfigured()) {
    return res.status(503).json({ msg: 'Admin access is not configured on the server.' });
  }

  const header = req.header('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ msg: 'Forbidden: admin role required' });
    }
    req.admin = { role: 'admin' };
    return next();
  } catch (_err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};
