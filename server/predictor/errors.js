'use strict';

/**
 * Typed errors for the Rank & Branch Predictor engine.
 *
 * Codes are stable strings: Phase 7's API layer will map them to HTTP status
 * codes, so they are part of the engine's contract from day one.
 *
 *   INVALID_INPUT        — request rejected by §3.5/§3.6 validation (never clamped)
 *   EXAM_NOT_AVAILABLE   — exam id known but its milestone hasn't shipped (INI-CET → M2)
 *   STEP_NOT_IMPLEMENTED — interface step reserved for a later phase (rank → P4,
 *                          branches → P6); callable so the interface is real, but
 *                          refuses to produce a half-built result
 *   DATA_INTEGRITY       — predictor-data snapshot failed its MANIFEST hash check
 *   NO_UPCOMING_EXAM     — Readiness Score exam calendar has no session for the
 *                          exam within its horizon (Feature 09,
 *                          docs/READINESS_SCORE.md §7.2/§19); the API layer maps
 *                          it to 409 — the system never guesses a date silently
 *   INPUT_MODE_CONFLICT   — Readiness request valued both input modes (or
 *                          neither): corrects XOR score, one per request
 *                          (Feature 09 §15/§18.1)
 *   SCORE_OUT_OF_RANGE    — Readiness score outside the exam pattern's
 *                          achievable range [−negative×total, maxMarks]
 *                          (Feature 09 §18.1; bounds derived from config,
 *                          never literals)
 */

const CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  EXAM_NOT_AVAILABLE: 'EXAM_NOT_AVAILABLE',
  STEP_NOT_IMPLEMENTED: 'STEP_NOT_IMPLEMENTED',
  DATA_INTEGRITY: 'DATA_INTEGRITY',
  NO_UPCOMING_EXAM: 'NO_UPCOMING_EXAM',
  INPUT_MODE_CONFLICT: 'INPUT_MODE_CONFLICT',
  SCORE_OUT_OF_RANGE: 'SCORE_OUT_OF_RANGE',
});

class PredictorError extends Error {
  /**
   * @param {string} code one of CODES
   * @param {string} message human-readable, safe to surface to a student
   * @param {object} [details] structured context (field path, exam id, phase…)
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PredictorError';
    this.code = code;
    this.details = details;
  }
}

function invalidInput(message, details = {}) {
  return new PredictorError(CODES.INVALID_INPUT, message, details);
}

function examNotAvailable(message, details = {}) {
  return new PredictorError(CODES.EXAM_NOT_AVAILABLE, message, details);
}

function stepNotImplemented(step, phase) {
  return new PredictorError(
    CODES.STEP_NOT_IMPLEMENTED,
    `'${step}' is not implemented yet — it lands in ${phase}.`,
    { step, phase }
  );
}

function dataIntegrity(message, details = {}) {
  return new PredictorError(CODES.DATA_INTEGRITY, message, details);
}

function noUpcomingExam(message, details = {}) {
  return new PredictorError(CODES.NO_UPCOMING_EXAM, message, details);
}

function inputModeConflict(message, details = {}) {
  return new PredictorError(CODES.INPUT_MODE_CONFLICT, message, details);
}

function scoreOutOfRange(message, details = {}) {
  return new PredictorError(CODES.SCORE_OUT_OF_RANGE, message, details);
}

module.exports = {
  CODES,
  PredictorError,
  invalidInput,
  examNotAvailable,
  stepNotImplemented,
  dataIntegrity,
  noUpcomingExam,
  inputModeConflict,
  scoreOutOfRange,
};
