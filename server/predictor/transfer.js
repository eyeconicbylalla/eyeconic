'use strict';

const {
  TRANSFER,
  WIDTH_MODEL,
  LOW_GT_COUNT,
  NOTES,
} = require('./config');
const { mean, sampleSd } = require('./aggregation');
const { halfWidthCorrects } = require('./widthModel');

/**
 * Percentile-Transfer Prior — spec §5, with the Tier 1/Tier 2 fallback ladder
 * of §5.4. This is the bridge that works without paired Eyeconic GT→outcome
 * data: the student's GT standing is TRANSFERRED onto the official exam
 * distribution as a RANGE, never a point.
 *
 * Pipeline (all in "transferred score" space, per exam pattern):
 *
 *   per GT:  Tier 2 (GT-cohort percentile → official rank → score) when a
 *            cohort ≥ TRANSFER.TIER2_MIN_COHORT exists for that GT, else
 *            Tier 1 (fraction-correct parity: corrects → exam score under
 *            the pattern's marking, assuming all questions attempted, §3.4)
 *   then:    mean of transferred scores (≡ mean of corrects × 5 − 200 when
 *            every GT is Tier 1 — the confirmed §3.3 aggregation, exactly)
 *   then:    ± halfWidth(n, dispersion) in corrects units (§11 width model)
 *   then:    percentile interval endpoints via the official distribution
 *
 * Tier 2 cohort contract: cohortProvider(gtId) returns null or
 * { size, corrects[] } — the corrects of ALL completed attempts on that GT,
 * including the student's own. The mid-rank percentile definition is pinned
 * in config (TRANSFER.COHORT_PERCENTILE_DEF) and computed HERE so no caller
 * can quietly redefine it. Tier 2 falls back to Tier 1 when the cohort is
 * missing, too small, or yields a percentile the official distribution
 * cannot invert (above/below its recorded range).
 */

/** Mid-rank percentile of a value inside a cohort (config-pinned definition). */
function cohortPercentile(corrects, cohortCorrects) {
  let below = 0;
  let equal = 0;
  for (const c of cohortCorrects) {
    if (c < corrects) below += 1;
    else if (c === corrects) equal += 1;
  }
  return (100 * (below + 0.5 * equal)) / cohortCorrects.length;
}

/** Exam-score for a corrects count under a pattern, assuming all questions attempted (§3.4 A1+A2). */
function scoreForCorrects(corrects, pattern) {
  const { totalQuestions, positive, negative } = pattern;
  const wrong = totalQuestions - corrects; // no-skip assumption
  return corrects * positive - wrong * negative;
}

/** Inverse of scoreForCorrects — corrects-equivalent of a transferred score. */
function correctsForScore(score, pattern) {
  const { totalQuestions, positive, negative } = pattern;
  return (score + totalQuestions * negative) / (positive + negative);
}

/**
 * Run the ladder over the deduped per-GT selections.
 * @returns {{perGt: Array, tiers: {TIER_1: number, TIER_2: number}, mixedTiers: boolean,
 *            fallbacks: Array}}
 */
function selectTiers(perGt, { pattern, distModel, cohortProvider }) {
  const out = [];
  const tiers = { TIER_1: 0, TIER_2: 0 };
  const fallbacks = [];

  for (const gt of perGt) {
    const { selected } = gt;
    let tier = 'TIER_1';
    let transferredScore = scoreForCorrects(selected.corrects, pattern);
    let cohortSize = null;
    let fallbackReason = null;

    const canUseCohort = typeof cohortProvider === 'function' && gt.gtId;
    if (canUseCohort) {
      const cohort = cohortProvider(gt.gtId);
      if (cohort && Array.isArray(cohort.corrects) && cohort.corrects.length > 0) {
        cohortSize = cohort.corrects.length;
        if (cohortSize >= TRANSFER.TIER2_MIN_COHORT) {
          const p = cohortPercentile(selected.corrects, cohort.corrects);
          const rank = (1 - p / 100) * distModel.numericPairs;
          const resolved = distModel.scoreForRank(rank);
          if (Number.isFinite(resolved.score)) {
            tier = 'TIER_2';
            transferredScore = resolved.score;
          } else {
            fallbackReason = 'cohort-percentile-outside-distribution';
          }
        } else {
          fallbackReason = 'cohort-below-min-size';
        }
      } else {
        fallbackReason = 'no-cohort';
      }
    }

    tiers[tier] += 1;
    if (fallbackReason && canUseCohort) {
      fallbacks.push({ gtId: gt.gtId, reason: fallbackReason });
    }
    out.push({
      gtId: gt.gtId,
      provenance: gt.provenance,
      corrects: selected.corrects,
      tier,
      tierRule: tier === 'TIER_2' ? TRANSFER.TIER2_RULE_ID : TRANSFER.TIER1_RULE_ID,
      transferredScore,
      cohortSize: tier === 'TIER_2' ? cohortSize : undefined,
    });
  }

  return {
    perGt: out,
    tiers,
    mixedTiers: tiers.TIER_1 > 0 && tiers.TIER_2 > 0,
    fallbacks,
  };
}

/** Round to `digits` decimals without float noise. */
function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Build the percentile-range estimate.
 *
 * @param {object} args
 *   perGt:     deduped per-GT selections (aggregation.aggregate output)
 *   pattern:   exam pattern (config.EXAMS[id].pattern)
 *   distModel: built from the official distribution snapshot
 *   cohortProvider: optional (gtId) => null | {size, corrects[]}
 * @returns estimate object — the Phase 3 stage output (spec §18 Phase 3
 *   done-when: defensible percentile range + tiers recorded)
 */
function buildEstimate({ perGt, pattern, distModel, cohortProvider }) {
  const ladder = selectTiers(perGt, { pattern, distModel, cohortProvider });

  // Corrects-equivalent transferred values: mean over these IS the confirmed
  // §3.3 mean-of-corrects for the all-Tier-1 launch mode (linear identity).
  const values = ladder.perGt.map((g) => correctsForScore(g.transferredScore, pattern));
  const n = values.length;
  const centerCorrects = mean(values);
  const sd = sampleSd(values);

  const halfWidth = halfWidthCorrects({ n, sd });
  const total = pattern.totalQuestions;
  const cLo = Math.max(0, centerCorrects - halfWidth);
  const cHi = Math.min(total, centerCorrects + halfWidth);
  const sCenter = scoreForCorrects(centerCorrects, pattern);
  const sLo = scoreForCorrects(cLo, pattern);
  const sHi = scoreForCorrects(cHi, pattern);

  // --- coverage states (§12-style honesty at the percentile stage) ---
  const aboveAll = sLo > distModel.maxScore; // entire estimate above every recorded score
  const belowAll = sHi < distModel.minScore; // entire estimate below every recorded score
  const pcts = distModel.percentileIntervalForScore;
  let pWorst;
  let pBest;
  let coverage = 'full';
  if (aboveAll) {
    pWorst = distModel.percentileForRank(1);
    pBest = 100;
    coverage = 'above-distribution';
  } else if (belowAll) {
    pWorst = 0;
    pBest = distModel.percentileForRank(distModel.lastRank); // clamped ≥ 0 in the model
    coverage = 'below-distribution';
  } else {
    const worst = pcts(sLo);
    const best = pcts(sHi);
    pWorst = worst.state === 'below' ? 0 : worst.lo;
    pBest = best.state === 'above' ? 100 : best.hi;
    if (worst.state === 'below' && best.state === 'above') coverage = 'spans-distribution';
    else if (worst.state === 'below') coverage = 'partial-bottom';
    else if (best.state === 'above') coverage = 'partial-top';
  }

  // Center percentile (midpoint of the center score's interval).
  const centerIv = pcts(sCenter);
  const centerPercentile = centerIv.state
    ? (centerIv.state === 'above' ? 100 : 0)
    : (centerIv.lo + centerIv.hi) / 2;

  // --- warnings (§14 + assumption violations detectable at prediction time) ---
  const warnings = [];
  if (n <= LOW_GT_COUNT.max) warnings.push({ code: 'LOW_GT_COUNT', note: LOW_GT_COUNT.note });
  if (perGt.some((g) => g.selected.skippedCount > 0)) {
    warnings.push({
      code: 'NO_SKIP_ASSUMPTION_WEAKENED',
      note:
        'One or more selected Grand Test attempts had skipped questions; the no-skip assumption (and therefore the performance estimate) is weakened for those GTs.',
    });
  }
  if (ladder.mixedTiers) warnings.push({ code: 'MIXED_TRANSFER_TIERS', note: 'Some Grand Tests used cohort-percentile transfer (Tier 2) and others fraction-correct parity (Tier 1).' });
  if (WIDTH_MODEL.provisional) warnings.push({ code: 'PROVISIONAL_WIDTHS', note: NOTES.PROVISIONAL_WIDTHS });

  return {
    stage: 'PERCENTILE_RANGE',
    /**
     * Unrounded internals consumed by Phase 4 rank resolution (exact lookups
     * must not inherit display rounding — up to 0.25 marks of drift at band
     * edges would move ranks by tens). Not part of the UI contract.
     */
    internal: Object.freeze({
      sLo,
      sHi,
      sCenter,
      cLo,
      cHi,
      halfWidth,
      centerCorrects,
    }),
    performance: {
      aggregateMethod: 'mean', // §3.3 confirmed default; alternatives in aggregation stats
      patternVersion: null, // filled by the strategy (config value)
      pattern: { ...pattern },
      centerCorrects: round(centerCorrects, 2),
      halfWidthCorrects: round(halfWidth, 2),
      correctsRange: [round(cLo, 2), round(cHi, 2)],
      scoreRange: [round(sLo, 1), round(sHi, 1)],
      dispersion: { sdCorrects: round(sd, 2), method: 'sample-sd' },
    },
    percentile: {
      // 3 decimals, not 2: top-of-distribution percentiles crowd against 100
      // (rank 40 of 230,096 is already 99.983) and 2dp would collapse the
      // range into a fake point at the top end.
      range: [round(pWorst, 3), round(pBest, 3)],
      center: round(centerPercentile, 3),
      definition: NOTES.PERCENTILE_DEF,
      coverage,
    },
    transfer: {
      tiers: ladder.tiers,
      mixedTiers: ladder.mixedTiers,
      tier2CohortThreshold: TRANSFER.TIER2_MIN_COHORT,
      tier2CohortThresholdProvisional: TRANSFER.TIER2_MIN_COHORT_PROVISIONAL,
      tier2Fallbacks: ladder.fallbacks,
      perGt: ladder.perGt.map((g) => ({
        ...g,
        transferredScore: round(g.transferredScore, 1),
      })),
    },
    warnings,
    notes: [NOTES.NO_SKIP, NOTES.DIFFICULTY_PARITY, NOTES.ESTIMATE_DISCLAIMER],
  };
}

module.exports = {
  buildEstimate,
  selectTiers,
  cohortPercentile,
  scoreForCorrects,
  correctsForScore,
};
