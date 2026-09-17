const mongoose = require('mongoose');

// Database-backed OTP store. Replaces the old in-memory map so OTPs work
// across serverless invocations. Only the bcrypt hash of the OTP is
// stored; TTL index removes expired records automatically.
const OtpSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    otpHash: { type: String, required: true },
    attemptCount: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', OtpSchema);
