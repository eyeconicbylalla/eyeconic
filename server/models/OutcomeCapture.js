const mongoose = require('mongoose');

/**
 * Rank & Branch Predictor — outcome capture (spec §15, §18 Phase 10a).
 *
 * The consent-based post-exam self-report that starts building the paired
 * "GT performance → actual exam outcome" dataset (§4) the predictor cannot
 * exist without. 10a scope: actual score / percentile / rank ONLY —
 * counselling outcomes and allotted branches are 10b (M2) and rejected by the
 * API, not silently stored.
 *
 * Linkage (§15: "every outcome links back to the stored prediction (method +
 * dataset snapshot versions, Phase 9) and the GT history that produced it —
 * that link is what makes the pair usable for calibration"):
 *   - predictionId joins to the Prediction document (inputs, GT history,
 *     aggregation, transfer tier, ranges — everything Phase 9 stored).
 *   - linkage copies the method version + dataset snapshot ids + GT count +
 *     prediction date AT CAPTURE TIME, so the pair stays auditable even if
 *     the prediction document were later modified; the API re-verifies the
 *     copy on read (linkageCheck) exactly like the Prediction resultHash.
 *
 * One outcome per prediction (unique index): corrections overwrite via the
 * PUT endpoint, they never append — a student's latest self-report is the
 * record. Withdrawal (DELETE) removes the document entirely — consent-based
 * means withdrawable.
 *
 * §15 "store the minimum required… nothing speculative": no free-text, no
 * counselling fields, no email copies — numbers, consent timestamp, linkage.
 */
const OutcomeCaptureSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    // Singleton per prediction (§18 Phase 10a: one-outcome-per-prediction).
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },

    exam: { type: String, required: true },

    // §15 consent: submission is voluntary; every PUT re-consents, and the
    // timestamp records WHEN consent was given for the stored values.
    consentGivenAt: { type: Date, required: true },

    // Actual result (all optional at the field level — the API requires at
    // least one — and nullable so a correction can withdraw a single value).
    outcome: {
      score: { type: Number, default: null }, // NEET PG: integer 0..800 (800-scale pattern)
      percentile: { type: Number, default: null }, // 0..100, up to 4 decimals
      rank: { type: Number, default: null }, // AIR, integer >= 1
    },

    // Copied from the Prediction at capture time (see header) — read back
    // and verified against the live prediction on every GET.
    linkage: {
      methodVersion: { type: String, required: true },
      datasetSnapshots: { type: mongoose.Schema.Types.Mixed, required: true },
      predictionCreatedAt: { type: Date },
      gtsUsed: { type: Number },
    },

    // 10a is self-report; the field exists so later automation (Phase 10b+)
    // can be distinguished without a migration.
    source: { type: String, default: 'self-reported' },
  },
  { timestamps: true } // createdAt = first capture, updatedAt = last correction
);

// "My outcomes" listing (and calibration assembly in later phases).
OutcomeCaptureSchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.OutcomeCapture || mongoose.model('OutcomeCapture', OutcomeCaptureSchema);
