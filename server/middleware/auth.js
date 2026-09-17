const jwt = require('jsonwebtoken');

// Verifies user JWTs issued by /api/auth/signup and /api/auth/login.
// Admin tokens ({ role: 'admin' }) deliberately fail here: they carry no
// user identity and must never act as a student.
module.exports = function (req, res, next) {
  const header = req.header('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.user || !decoded.user.id) return res.status(401).json({ msg: 'Token is not valid' });
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
