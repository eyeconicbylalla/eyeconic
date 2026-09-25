'use strict';

/**
 * Typed error for the Platform Choice Recommender (mirrors the predictor's
 * PredictorError contract: codes map to HTTP statuses in the route layer).
 */

const CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  NO_PLATFORMS_CONFIGURED: 'NO_PLATFORMS_CONFIGURED',
});

const STATUS_BY_CODE = Object.freeze({
  [CODES.INVALID_INPUT]: 400,
  [CODES.NO_PLATFORMS_CONFIGURED]: 503,
});

class PlatformChoiceError extends Error {
  constructor(message, { code = CODES.INVALID_INPUT, field = null, suggestions = null } = {}) {
    super(message);
    this.name = 'PlatformChoiceError';
    this.code = code;
    this.field = field;
    this.suggestions = suggestions;
  }
}

module.exports = { PlatformChoiceError, CODES, STATUS_BY_CODE };
