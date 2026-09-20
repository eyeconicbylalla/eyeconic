const mongoose = require('mongoose');

/**
 * Rank & Branch Predictor — served-prediction record (spec §18 Phase 9,
 * built inside Phase 7: an unpersisted prediction is a calibration sample
 * lost forever).
 *
 * Every prediction the API serves is written here BEFORE the response goes
 * out — a failed write means the prediction is not served. Stored fields per
 * §18 Phase 9:
 *   - inputs (each GT tagged auto-captured vs self-reported) → input +
 *     request (the exact request body, for byte-faithful re-derivation)
 *   - aggregation used, transfer tier used → aggregation + estimate.transfer
 *   - method version → methodVersion + method (full method block)
 *   - dataset snapshot versions → method.datasetSnapshots
 *   - outputs (ranges) → estimate + rank + branches summary
 *   - data-coverage references, timestamp, user → dataCoverage* + createdAt + userId
 *
 * Branch result ROWS are deliberately not stored (a mid-range prediction
 * carries ~2,300 rows/year): they are a deterministic function of
 * (request, method version, snapshot versions), all stored, and the API
 * re-derives + re-verifies them on demand (see routes/predictor.js).
 *
 * userId is the canonical App backend User._id (integration Phase 3), stored
 * as a string because the website has no FK into the App's database.
 * resultHash pins the stored stages against tampering/corruption.
 */
const PredictionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    exam: { type: String, required: true },

    // The exact request body the engine consumed (§18 Phase 9 reproducibility).
    request: { type: mongoose.Schema.Types.Mixed, required: true },

    methodVersion: { type: String, required: true },
    method: { type: mongoose.Schema.Types.Mixed, required: true },

    input: { type: mongoose.Schema.Types.Mixed, required: true },
    aggregation: { type: mongoose.Schema.Types.Mixed, required: true },
    estimate: { type: mongoose.Schema.Types.Mixed, required: true },
    rank: { type: mongoose.Schema.Types.Mixed, required: true },
    branches: { type: mongoose.Schema.Types.Mixed, required: true }, // summary, no row arrays

    // sha256 of the canonical JSON of the stored stages — retrievable
    // predictions can be checked for drift/corruption.
    resultHash: { type: String, required: true },
  },
  { timestamps: true } // createdAt = served-at (§18 Phase 9 timestamp)
);

// Student-facing history: newest first per user.
PredictionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Prediction || mongoose.model('Prediction', PredictionSchema);
