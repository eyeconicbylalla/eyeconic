const mongoose = require('mongoose');

/**
 * Rank & Branch Predictor — outcome capture (spec §15, §18 Phases 10a+10b).
 *
 * The consent-based post-exam self-report that starts building the paired
 * "GT performance → actual exam outcome" dataset (§4) the predictor cannot
 * exist without. 10a captured actual score / percentile / rank; 10b adds the
 * counselling outcome (allotted status + allotted institute/branch + round,
 * exactly the §15 "Counselling outcome where available / actual allotted
 * college-branch, if voluntarily provided" list, nothing more).
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
 * §15 "store the minimum required… nothing speculative": no free-text beyond
 * the allotted institute/branch/round strings §15 itself names, no email
 * copies — numbers, the counselling block, consent timestamp, linkage.
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
    // least one value overall — and nullable so a correction can withdraw a
    // single value).
    outcome: {
      score: { type: Number, default: null }, // NEET PG: integer 0..800 (800-scale pattern)
      percentile: { type: Number, default: null }, // 0..100, up to 4 decimals
      rank: { type: Number, default: null }, // AIR, integer >= 1
    },

    // Counselling outcome (Phase 10b, §15): null until shared. status is the
    // outcome itself; the allotted institute/branch/round strings are stored
    // AS TYPED (self-reported, trimmed/length-checked by the API) — canonical
    // matching against the counselling dictionaries happens at
    // evaluation-dataset assembly, so the raw self-report is never overwritten.
    counselling: {
      status: { type: String, default: null }, // 'ALLOTTED' | 'NOT_ALLOTTED'
      allottedInstitute: { type: String, default: null }, // as typed, ≤120 chars
      allottedBranch: { type: String, default: null }, // as typed, ≤120 chars
      round: { type: String, default: null }, // as typed, ≤40 chars (e.g. 'R2', 'mop-up')
    },

    // Copied from the Prediction at capture time (see header) — read back
    // and verified against the live prediction on every GET.
    linkage: {
      methodVersion: { type: String, required: true },
      datasetSnapshots: { type: mongoose.Schema.Types.Mixed, required: true },
      predictionCreatedAt: { type: Date },
      gtsUsed: { type: Number },
    },

    // 10a/10b are self-report; the field exists so later automation (§15
    // "later automation where possible") can be distinguished without a migration.
    source: { type: String, default: 'self-reported' },
  },
  { timestamps: true } // createdAt = first capture, updatedAt = last correction
);

// "My outcomes" listing (and calibration assembly in later phases).
OutcomeCaptureSchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.OutcomeCapture || mongoose.model('OutcomeCapture', OutcomeCaptureSchema);
