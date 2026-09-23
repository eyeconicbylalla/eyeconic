const mongoose = require('mongoose');

/**
 * Desired Branch Predictor — served reverse-query record (Feature 02,
 * docs/DESIRED_BRANCH_PREDICTOR.md §7.4; decision D6 approved 2026-09-21).
 *
 * Mirrors the Prediction model's persist-before-serve convention: every
 * reverse result the API serves is written here BEFORE the response goes out
 * — a failed write means the result is not served. A stored query records the
 * student's INTENT (which branch, which category) alongside the computed
 * target/required/gap stages — exactly the label the Phase 11 calibration and
 * the future Platform Choice Recommender will want.
 *
 * Stored fields per the DBP §7.4 contract:
 *   - request: the exact request body (byte-faithful re-derivation)
 *   - methodVersion + method: reverse method version + full method block
 *   - input: branch/category/pwd/quota (+ per-GT provenance when GTs given)
 *   - target / required / current / gap: the four result stages
 *   - warnings + notes: the §14-style strings served with the result
 *   - resultHash: sha256 of the canonical JSON of the stored stages
 *
 * userId is the canonical App backend User._id (integration Phase 3), stored
 * as a string — same convention as Prediction.
 */
const DesiredBranchQuerySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    exam: { type: String, required: true },

    // The exact request body the engine consumed (§18 Phase 9 discipline).
    request: { type: mongoose.Schema.Types.Mixed, required: true },

    methodVersion: { type: String, required: true },
    method: { type: mongoose.Schema.Types.Mixed, required: true },

    input: { type: mongoose.Schema.Types.Mixed, required: true },
    target: { type: mongoose.Schema.Types.Mixed, required: true },
    required: { type: mongoose.Schema.Types.Mixed, default: null }, // null when NO_DATA_FOR_FILTER
    current: { type: mongoose.Schema.Types.Mixed, default: null }, // null when no GTs supplied
    gap: { type: mongoose.Schema.Types.Mixed, default: null },
    warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    notes: { type: [String], default: [] },

    // sha256 of the canonical JSON of the stored stages — retrievable
    // results can be checked for drift/corruption (same as Prediction).
    resultHash: { type: String, required: true },
  },
  { timestamps: true } // createdAt = served-at
);

// Student-facing history: newest first per user.
DesiredBranchQuerySchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.DesiredBranchQuery || mongoose.model('DesiredBranchQuery', DesiredBranchQuerySchema);
