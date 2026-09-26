const mongoose = require('mongoose');

/**
 * Readiness Score — served-result record (Feature 09,
 * docs/READINESS_SCORE.md §16; decision R8 approved 2026-09-26).
 *
 * Mirrors the Prediction/DesiredBranchQuery persist-before-serve convention:
 * every readiness result the API serves is written here BEFORE the response
 * goes out — a failed write means the result is not served. These records
 * (state + inputs + calendar + method version) are exactly the labels a
 * future improvement-rate calibration needs when linked to OutcomeCapture
 * (§16 rationale: skipping persistence would repeat the "unpersisted
 * prediction = calibration sample lost" mistake).
 *
 * Stored fields per the §16 contract:
 *   - request: the exact body the engine consumed (byte-faithful; for a §18.2
 *     session rollover this is the stripped body the engine actually ran on,
 *     with the client's original session echoed in `rollover`)
 *   - methodVersion + method: readiness method version + full method block
 *   - input / standing / calendar / anchors / target / gap / state: the §10
 *     result stages (anchors = the full context ladder, not just the target)
 *   - warnings + notes: inherited + readiness notes, exactly as served
 *   - resultHash: sha256 of the canonical JSON of the stored stages
 * Plus two additive display/annotation stages the §10 record carries:
 *   - examLabel / explanation: engine display stages (§11 copy, §8 convention)
 *     so GET serves the same shape POST served
 *   - rollover: the §18.2 session-rollover annotation, or null
 *
 * userId is the canonical App backend User._id, stored as a string — same
 * convention as Prediction/DesiredBranchQuery.
 */
const ReadinessQuerySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    exam: { type: String, required: true },

    // The exact request body the engine consumed (§16 reproducibility).
    request: { type: mongoose.Schema.Types.Mixed, required: true },

    methodVersion: { type: String, required: true },
    method: { type: mongoose.Schema.Types.Mixed, required: true },

    input: { type: mongoose.Schema.Types.Mixed, required: true },
    standing: { type: mongoose.Schema.Types.Mixed, required: true },
    calendar: { type: mongoose.Schema.Types.Mixed, required: true },
    anchors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    target: { type: mongoose.Schema.Types.Mixed, required: true },
    gap: { type: mongoose.Schema.Types.Mixed, required: true },
    // Exactly three states (FR-4/R4) — mirrors predictor/readiness.js STATES,
    // pinned equal by the readiness API tests.
    state: {
      type: String,
      required: true,
      enum: ['READY', 'MODERATELY_READY', 'BARELY_READY'],
    },
    warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    notes: { type: [String], default: [] },

    // Additive display stages the engine record carries (kept so GET serves
    // the identical shape POST served).
    examLabel: { type: String, default: null },
    explanation: { type: mongoose.Schema.Types.Mixed, default: null },
    // §18.2 session-rollover annotation ({ requestedSession, resolvedSession,
    // note }) when the client-targeted session had passed at request time.
    rollover: { type: mongoose.Schema.Types.Mixed, default: null },

    // sha256 of the canonical JSON of the stored stages — retrievable results
    // can be checked for drift/corruption (same as Prediction/DesiredBranchQuery).
    resultHash: { type: String, required: true },
  },
  { timestamps: true } // createdAt = served-at
);

// Student-facing history: newest first per user.
ReadinessQuerySchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.ReadinessQuery || mongoose.model('ReadinessQuery', ReadinessQuerySchema);
