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
 */

const CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  EXAM_NOT_AVAILABLE: 'EXAM_NOT_AVAILABLE',
  STEP_NOT_IMPLEMENTED: 'STEP_NOT_IMPLEMENTED',
  DATA_INTEGRITY: 'DATA_INTEGRITY',
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

module.exports = {
  CODES,
  PredictorError,
  invalidInput,
  examNotAvailable,
  stepNotImplemented,
  dataIntegrity,
};
