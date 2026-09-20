'use strict';

const { INPUT_RULES, AGGREGATION } = require('./config');

/**
 * GT aggregation — spec §3.3.
 *
 * One value per GT: the dedup rule from the Phase 1 audit (G3), versioned in
 * config.AGGREGATION — "latest completed attempt per GT, preferring an
 * approved-and-used retest". Then transparent statistics over the selected
 * values: mean (confirmed MVP default) plus median and trimmed mean
 * (robust alternatives, reported alongside for Phase 4/5/11 evaluation —
 * spec §3.3 requires the choice to be evaluated against inspected data and
 * documented; with zero GT attempts recorded there is no empirical basis to
 * overturn the confirmed mean, see docs/RANK_PREDICTOR_PHASE3_REPORT.md).
 */

/** Selection reasons recorded per attempt — surfaced to the UI and Phase 9 persistence. */
const EXCLUSION_REASONS = Object.freeze({
  NOT_COMPLETED: 'not-a-completed-attempt',
  SUPERSEDED: 'superseded-by-newer-attempt',
  SUPERSEDED_RETEST: 'superseded-by-approved-used-retest',
});

/**
 * Pick the one attempt that represents a GT.
 * Order of precedence: completed status → approved-and-used retest → latest
 * endedAt (null endedAt counts as oldest; final tiebreak = array order, the
 * app appends attempts chronologically).
 */
function selectAttemptPerGt(gt) {
  const completed = [];
  const excluded = [];
  for (const attempt of gt.attempts) {
    if (INPUT_RULES.COMPLETED_ATTEMPT_STATUSES.includes(attempt.status)) {
      completed.push(attempt);
    } else {
      excluded.push({ corrects: attempt.corrects, reason: EXCLUSION_REASONS.NOT_COMPLETED });
    }
  }
  if (completed.length === 0) {
    return null; // validation rejects this earlier; kept defensive
  }

  const retests = completed.filter((a) => a.retestApprovedUsed);
  const pool = retests.length > 0 ? retests : completed;
  const supersededReason = retests.length > 0
    ? EXCLUSION_REASONS.SUPERSEDED_RETEST
    : EXCLUSION_REASONS.SUPERSEDED;

  let best = null;
  pool.forEach((attempt) => {
    const endedAt = attempt.endedAt === null || attempt.endedAt === undefined
      ? -Infinity
      : attempt.endedAt;
    if (best === null || endedAt >= best.endedAt) {
      // >= : array order breaks exact timestamp ties (later entry wins)
      best = { attempt, endedAt };
    }
  });

  for (const attempt of completed) {
    if (attempt === best.attempt) continue;
    excluded.push({ corrects: attempt.corrects, reason: supersededReason });
  }

  return { selected: best.attempt, excluded };
}

/** Mean of numbers. */
function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Median (average of the middle two for even n). */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Trimmed mean: drop one min and one max, average the rest. First defined at
 * n = TRIM_MIN_N (below that the estimate collapses toward the median and
 * tells the student nothing new).
 */
function trimmedMean(values) {
  if (values.length < AGGREGATION.TRIM_MIN_N) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const inner = sorted.slice(1, -1);
  return mean(inner);
}

/** Sample standard deviation (n−1); 0 for a single value (no spread observable). */
function sampleSd(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((acc, x) => acc + (x - m) * (x - m), 0);
  return Math.sqrt(ss / (values.length - 1));
}

/**
 * Dedup + aggregate.
 * @param {Array} gts normalized GT entries from validation.validateRequest
 * @returns {{perGt: Array, stats: object}} per-GT selection with exclusions,
 *   and stats = { n, values, mean, median, trimmedMean, sd, min, max, range,
 *   aggregate (the AGGREGATION.method value actually used) }
 */
function aggregate(gts) {
  const perGt = gts.map((gt) => {
    const pick = selectAttemptPerGt(gt);
    return {
      gtId: gt.gtId,
      provenance: gt.provenance,
      selected: pick
        ? {
            corrects: pick.selected.corrects,
            totalQuestions: pick.selected.totalQuestions,
            endedAt: pick.selected.endedAt,
            retestApprovedUsed: pick.selected.retestApprovedUsed,
            skippedCount: pick.selected.skippedCount,
          }
        : null,
      excluded: pick ? pick.excluded : [],
    };
  });

  const values = perGt.map((g) => g.selected.corrects);
  const stats = {
    n: values.length,
    values,
    mean: mean(values),
    median: median(values),
    trimmedMean: trimmedMean(values),
    sd: sampleSd(values),
    min: Math.min(...values),
    max: Math.max(...values),
    range: Math.max(...values) - Math.min(...values),
    aggregate: AGGREGATION.method,
  };
  return { perGt, stats };
}

module.exports = {
  aggregate,
  selectAttemptPerGt,
  mean,
  median,
  trimmedMean,
  sampleSd,
  EXCLUSION_REASONS,
};
