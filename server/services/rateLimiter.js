const RateLimit = require('../models/RateLimit');
const { ensureDbConnection } = require('../config/db');

// In-memory fallback map if DB is unreachable, connecting, or unconfigured
const memoryLimits = new Map();

// Periodic sweep to prevent unbounded memory growth in long-running processes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of memoryLimits.entries()) {
    if (now - val.windowStart > 60 * 60 * 1000) {
      memoryLimits.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// Fixed-window rate limiter backed by MongoDB with in-memory graceful fallback.
// Each key holds a counter for its window; the TTL index cleans stale documents up.
// Never throws unhandled errors to caller — auth & API endpoints degrade gracefully.
async function hitRateLimit(key, { windowMs, max }) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs + 10 * 60 * 1000);

  // If DB is configured, try to use it with lazy connection
  if (process.env.MONGO_URI) {
    try {
      await ensureDbConnection();
      const doc = await RateLimit.findOneAndUpdate(
        { key, windowStart: { $gte: cutoff } },
        { $inc: { count: 1 }, $set: { expiresAt } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return { allowed: doc.count <= max, count: doc.count, remaining: Math.max(0, max - doc.count) };
    } catch (err) {
      if (err && err.code === 11000) {
        // A stale window exists for this key: atomically reset it.
        try {
          const doc = await RateLimit.findOneAndUpdate(
            { key, windowStart: { $lt: cutoff } },
            { $set: { count: 1, windowStart: now, expiresAt } },
            { new: true }
          );
          if (doc) return { allowed: doc.count <= max, count: doc.count, remaining: Math.max(0, max - doc.count) };
          return { allowed: true, count: 1, remaining: max - 1 };
        } catch {
          // Fall through to memory limiter
        }
      }
      console.warn('[rateLimiter] MongoDB rate limit error, using memory fallback:', err && err.message);
    }
  }

  // In-memory rate limiting fallback (safe for serverless or when Mongo is disconnected)
  const current = memoryLimits.get(key);
  if (!current || now.getTime() - current.windowStart > windowMs) {
    memoryLimits.set(key, { count: 1, windowStart: now.getTime() });
    return { allowed: true, count: 1, remaining: Math.max(0, max - 1) };
  }
  current.count += 1;
  return {
    allowed: current.count <= max,
    count: current.count,
    remaining: Math.max(0, max - current.count),
  };
}

// Express is behind Vercel's proxy; trust proxy is enabled in server.js.
function clientIp(req) {
  return (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown').toString();
}

module.exports = { hitRateLimit, clientIp };
