const mongoose = require('mongoose');

// Fixed-window rate limit counters kept in MongoDB so limits survive
// serverless invocations (process memory cannot be trusted on Vercel).
const RateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, default: 0 },
    windowStart: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimit', RateLimitSchema);
