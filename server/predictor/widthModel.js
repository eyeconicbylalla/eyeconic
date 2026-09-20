'use strict';

const { WIDTH_MODEL } = require('./config');

/**
 * Range-width model — spec §11: half-width = f(GT count n, GT dispersion sd),
 * in corrects units.
 *
 *   halfWidth(n, sd) = min(MAX, FLOOR + (SINGLE_GT − FLOOR)/√n + SPREAD_K × sd)
 *
 * Properties required by §11 (each pinned by a unit test):
 *  - 1 GT produces the widest base width;
 *  - width shrinks as n grows (1/√n — standard-error scaling), toward FLOOR;
 *  - a scattered GT set widens the range (SPREAD_K × sd) — consistency is
 *    visible in the output;
 *  - never below FLOOR, never above MAX (pathological dispersion guard).
 *
 * All constants are PROVISIONAL (see config.WIDTH_MODEL for provenance and
 * the calibration path). Evidence for the current values:
 * scripts/phase3/calibration_report.js.
 */
function halfWidthCorrects({ n, sd }, params = WIDTH_MODEL.params) {
  if (!Number.isFinite(n) || n < 1) {
    throw new TypeError(`halfWidthCorrects: n must be >= 1 (got ${n})`);
  }
  if (!Number.isFinite(sd) || sd < 0) {
    throw new TypeError(`halfWidthCorrects: sd must be >= 0 (got ${sd})`);
  }
  const {
    singleGtHalfWidthCorrects: single,
    floorHalfWidthCorrects: floor,
    spreadCoefficient: spreadK,
    maxHalfWidthCorrects: max,
  } = params;
  const base = floor + (single - floor) / Math.sqrt(n);
  return Math.min(max, base + spreadK * sd);
}

module.exports = { halfWidthCorrects };
