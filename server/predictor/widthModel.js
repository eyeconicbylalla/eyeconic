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
 * Pattern scaling (2026-09-24): the provisional constants are expressed at
 * the 200-QUESTION REFERENCE pattern (see config.WIDTH_MODEL) and scaled
 * proportionally to the exam's totalQuestions, keeping the same RELATIVE
 * width across patterns (200 → ×1.0 unchanged; 180 → ×0.9). SPREAD_K is not
 * scaled: it multiplies sd, which is already in the current pattern's
 * corrects units. sd itself is NOT rescaled — dispersion measured on a
 * student's actual GTs is pattern-native.
 *
 * All constants are PROVISIONAL (see config.WIDTH_MODEL for provenance and
 * the calibration path). Evidence for the current values:
 * scripts/phase3/calibration_report.js.
 */
const WIDTH_REFERENCE_TOTAL = 200;

function halfWidthCorrects({ n, sd, totalQuestions = WIDTH_REFERENCE_TOTAL }, params = WIDTH_MODEL.params) {
  if (!Number.isFinite(n) || n < 1) {
    throw new TypeError(`halfWidthCorrects: n must be >= 1 (got ${n})`);
  }
  if (!Number.isFinite(sd) || sd < 0) {
    throw new TypeError(`halfWidthCorrects: sd must be >= 0 (got ${sd})`);
  }
  if (!Number.isFinite(totalQuestions) || totalQuestions < 1) {
    throw new TypeError(`halfWidthCorrects: totalQuestions must be >= 1 (got ${totalQuestions})`);
  }
  const {
    singleGtHalfWidthCorrects: single,
    floorHalfWidthCorrects: floor,
    spreadCoefficient: spreadK,
    maxHalfWidthCorrects: max,
  } = params;
  const scale = totalQuestions / WIDTH_REFERENCE_TOTAL;
  const s = single * scale;
  const f = floor * scale;
  const m = max * scale;
  const base = f + (s - f) / Math.sqrt(n);
  return Math.min(m, base + spreadK * sd);
}

module.exports = { halfWidthCorrects };
