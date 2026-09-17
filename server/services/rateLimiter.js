const RateLimit = require('../models/RateLimit');

// Fixed-window rate limiter backed by MongoDB. Each key holds a counter
// for its window; the TTL index cleans stale documents up afterwards.
// Keys should carry their own scope, e.g. `login:ip:1.2.3.4`.
async function hitRateLimit(key, { windowMs, max }) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs + 10 * 60 * 1000);

  try {
    const doc = await RateLimit.findOneAndUpdate(
      { key, windowStart: { $gte: cutoff } },
      { $inc: { count: 1 }, $set: { expiresAt } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return { allowed: doc.count <= max, count: doc.count, remaining: Math.max(0, max - doc.count) };
  } catch (err) {
    if (err && err.code === 11000) {
      // A stale window exists for this key: atomically reset it.
      const doc = await RateLimit.findOneAndUpdate(
        { key, windowStart: { $lt: cutoff } },
        { $set: { count: 1, windowStart: now, expiresAt } },
        { new: true }
      );
      if (doc) return { allowed: doc.count <= max, count: doc.count, remaining: Math.max(0, max - doc.count) };
      return { allowed: true, count: 1, remaining: max - 1 }; // lost a rare race; allow this request
    }
    throw err;
  }
}

// Express is behind Vercel's proxy; trust proxy is enabled in server.js.
function clientIp(req) {
  return (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown').toString();
}

module.exports = { hitRateLimit, clientIp };
