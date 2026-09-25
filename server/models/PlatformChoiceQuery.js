const mongoose = require('mongoose');

/**
 * Platform Choice Recommender — served recommendation record (Feature 06).
 *
 * Mirrors the Prediction / DesiredBranchQuery persist-before-serve convention:
 * every recommendation the API serves is written here BEFORE the response goes
 * out — a failed write means the result is not served. A stored record keeps
 * the student's INTENT (exam, session, hours, previous resource, switching
 * openness, weakest subjects) alongside the server-derived context that fed
 * the scoring (Mini CCT reference, desired branch) and the tiered result —
 * exactly what mentor analytics and future tuning will want.
 *
 * userId is the canonical App backend User._id (integration Phase 3), stored
 * as a string — same convention as Prediction / DesiredBranchQuery.
 */
const PlatformChoiceQuerySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    exam: { type: String, required: true },

    // The exact validated request body the engine consumed.
    request: { type: mongoose.Schema.Types.Mixed, required: true },

    methodVersion: { type: String, required: true },

    // Validated input + the server-derived context summary (what fed scoring).
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    // The tiered result as served (platforms, reasons, notes, match scores).
    result: { type: mongoose.Schema.Types.Mixed, required: true },

    // sha256 of the canonical JSON of the stored stages — retrievable records
    // can be checked for drift/corruption (same as Prediction).
    resultHash: { type: String, required: true },
  },
  { timestamps: true } // createdAt = served-at
);

// Student-facing history: newest first per user.
PlatformChoiceQuerySchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PlatformChoiceQuery ||
  mongoose.model('PlatformChoiceQuery', PlatformChoiceQuerySchema);
