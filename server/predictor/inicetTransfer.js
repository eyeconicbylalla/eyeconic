'use strict';

const { WIDTH_MODEL, LOW_GT_COUNT, NOTES } = require('./config');
const { mean, sampleSd } = require('./aggregation');
const { halfWidthCorrects } = require('./widthModel');
const { scoreForCorrects } = require('./transfer');

/**
 * INI-CET Percentile-Transfer Prior — spec §9 (Phase 5 / M2).
 *
 * AIIMS has NEVER published INI-CET marks: officially only rank + percentile
 * exist. The corrects→percentile step therefore has NO official ground truth
 * anywhere and rests on a crowd-sourced labelled prior (the Hazra
 * corrects→AIR ladders — UR-only), exactly as §9 mandates:
 *
 *   corrects (mean of GTs, ± width model, §3.3/§11)
 *     → marks      EXACT pattern arithmetic (200Q, +1/−⅓, no-skip §3.4)
 *     → AIR        crowd prior ladder (piecewise-linear, marks vs log-AIR;
 *                  monotone)                       ← the WEAK step
 *     → percentile EXACT official lookup (rank→percentile rows of the paired
 *                  session distribution)           ← official
 *   resolveRankRange then maps percentile→rank through the SAME official rows.
 *
 * Honest coverage states (§12-style): the ladder spans corrects 110–160.
 * Above it: 'above-prior' (best case rank 1). Below it: 'below-prior'
 * (worst case beyond the ladder — no extrapolation, §5.2 no fabrication).
 *
 * Tier accounting (§5.4): the crowd ladder is Tier 3 in the ladder's
 * vocabulary. For INI-CET it is the PRIMARY bridge — by structural necessity,
 * not choice — and the estimate records that fact explicitly
 * (transfer.mode = 'TIER_3_CROWD_PRIOR_PRIMARY').
 */

/** Piecewise-linear marks→AIR prior over the ladder points (monotone checked at build). */
function buildPriorModel(prior, pattern) {
  const pts = (prior.runtime_points || [])
    .map((p) => ({ corrects: p.corrects, air: p.air }))
    .sort((a, b) => a.corrects - b.corrects);
  if (pts.length < 3) {
    throw new Error('INI-CET prior needs at least 3 ladder points.');
  }
  for (let i = 1; i < pts.length; i += 1) {
    // ascending corrects => strictly improving (smaller) AIR
    if (pts[i].air >= pts[i - 1].air) {
      throw new Error(`INI-CET prior ladder not monotone at ${pts[i].corrects} corrects.`);
    }
  }
  const marks = pts.map((p) => scoreForCorrects(p.corrects, pattern));

  /** AIR estimate for a marks value; null outside the ladder's span. */
  function airForMarks(m) {
    if (m < marks[0] || m > marks[marks.length - 1]) return null;
    // exact rung marks return the rung AIR exactly (previously only the top
    // rung was special-cased; rung interpolation returned it only up to
    // exp/log float noise — matters for marksForAir's inverse identity)
    for (let i = 0; i < marks.length; i += 1) {
      if (m === marks[i]) return pts[i].air;
    }
    // interpolate in log(AIR): ladders span two orders of magnitude, so the
    // log scale is where piecewise-linear is least distorting
    let i = 0;
    while (i < marks.length - 2 && marks[i + 1] < m) i += 1;
    const t = (m - marks[i]) / (marks[i + 1] - marks[i]);
    const la = Math.log(pts[i].air);
    const lb = Math.log(pts[i + 1].air);
    return Math.exp(la + t * (lb - la));
  }

  /**
   * Inverse ladder (Desired Branch Phase 2 — DBP §3.2.2): the marks whose
   * ladder AIR is `air`, interpolating in the SAME log(AIR) space so the
   * transform is exactly invertible inside the span
   * (marksForAir(airForMarks(m)) === m there).
   *
   * CAREFUL with orientation: pts are sorted ASCENDING by corrects, so airs
   * strictly DESCEND with the index — pts[0] is the ladder FLOOR (fewest
   * corrects, worst AIR) and pts[last] the best rung. airSpan is echoed in
   * that same pts order ([worstAir, bestAir]); the bounds here are computed
   * from the points themselves so orientation can never bite again.
   *
   * NO extrapolation beyond the ladder's ends (§5.2 no fabrication):
   *   air better than the best rung  → { state: 'above-ladder' }
   *   air beyond the floor rung      → { state: 'below-ladder' }
   * In the reverse direction this ladder is the LOAD-BEARING step (AIIMS has
   * never published marks) — callers must carry the crowd-sourced labelling.
   */
  function marksForAir(air) {
    if (!Number.isFinite(air)) {
      throw new TypeError('marksForAir expects a number');
    }
    const bestAir = pts[pts.length - 1].air; // smallest AIR on the ladder
    const worstAir = pts[0].air; // largest AIR on the ladder
    if (air < bestAir) return { state: 'above-ladder' };
    if (air > worstAir) return { state: 'below-ladder' };
    // exact rung (including both ends)
    for (let i = 0; i < pts.length; i += 1) {
      if (pts[i].air === air) return { marks: marks[i] };
    }
    // strictly between rungs i and i+1 (airs strictly decrease as i grows)
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].air > air) i += 1;
    const t = (Math.log(pts[i].air) - Math.log(air)) /
      (Math.log(pts[i].air) - Math.log(pts[i + 1].air)); // 0..1
    return { marks: marks[i] + t * (marks[i + 1] - marks[i]) };
  }

  return Object.freeze({
    priorId: prior.snapshot_id,
    urOnly: prior.source.ur_only === true,
    points: pts.length,
    correctsSpan: [pts[0].corrects, pts[pts.length - 1].corrects],
    marksSpan: [marks[0], marks[marks.length - 1]],
    airSpan: [pts[0].air, pts[pts.length - 1].air],
    airForMarks,
    marksForAir,
  });
}

/** Round to `digits` decimals without float noise. */
function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Build the INI-CET percentile-range estimate (Phase 5 stage output).
 *
 * @param {object} args
 *   perGt:       deduped per-GT selections (aggregation.aggregate output)
 *   pattern:     EXAMS.INI_CET.pattern
 *   priorModel:  buildPriorModel(...) over the committed ladder prior
 *   rpModel:     buildRankPercentileModel(...) over the official distribution
 *   category:    validated category (or null) — reserved categories get the
 *                UR-only-prior warning here (§9: weaker still for them)
 */
function buildIniCetEstimate({ perGt, pattern, priorModel, rpModel, category }) {
  const values = perGt.map((g) => g.selected.corrects);
  const n = values.length;
  const centerCorrects = mean(values);
  const sd = sampleSd(values);

  const halfWidth = halfWidthCorrects({ n, sd });
  const total = pattern.totalQuestions;
  const cLo = Math.max(0, centerCorrects - halfWidth);
  const cHi = Math.min(total, centerCorrects + halfWidth);
  const mCenter = scoreForCorrects(centerCorrects, pattern);
  const mLo = scoreForCorrects(cLo, pattern);
  const mHi = scoreForCorrects(cHi, pattern);

  // --- the weak step: marks → AIR via the crowd ladder ---
  const airBest = priorModel.airForMarks(mHi); // better marks => better AIR
  const airWorst = priorModel.airForMarks(mLo);
  const abovePrior = airBest === null && mHi > scoreForCorrects(priorModel.correctsSpan[1], pattern);
  const belowPrior = airWorst === null && mLo < scoreForCorrects(priorModel.correctsSpan[0], pattern);

  // --- official normalization: AIR → percentile (exact stored lookup) ---
  let pBest;
  let pWorst;
  let coverage = 'full';
  if (abovePrior && belowPrior) {
    coverage = 'spans-prior';
    pBest = 100;
    pWorst = 0;
  } else if (abovePrior) {
    coverage = 'above-prior';
    pBest = 100;
    // R9 crash fix (2026-09-26, docs/READINESS_SCORE.md §18.3/§25): when the
    // ENTIRE range is above the ladder, airWorst is null too and
    // Math.round(null) = 0 made percentileForRank throw (Phase-0 repro: a
    // single 200/200 GT → "percentileForRank: invalid rank 0"). The honest
    // bound is the ladder's BEST rung: every rank in the range is better than
    // it, so the worst percentile is bounded by that rung's percentile. Only
    // the previously-THROWING path changes — no result a student ever received
    // is altered (crash fix, not a methodology change; no version bump).
    pWorst = rpModel.percentileForRank(
      airWorst === null ? Math.min(...priorModel.airSpan) : Math.round(airWorst)
    ).lo;
  } else if (belowPrior) {
    coverage = 'below-prior';
    // R9 symmetric guard: whole range BELOW the ladder ⇒ airBest is null
    // (e.g. corrects ≈ 0) — bound the best percentile by the ladder FLOOR
    // rung, mirroring the above-prior case. Same crash class, same reasoning.
    pBest = rpModel.percentileForRank(
      airBest === null ? Math.max(...priorModel.airSpan) : Math.round(airBest)
    ).hi;
    pWorst = 0;
  } else if (airBest === null || airWorst === null) {
    // one end exactly at a ladder edge (airForMarks is null only outside span)
    coverage = airBest === null ? 'partial-top' : 'partial-bottom';
    pBest = airBest === null ? 100 : rpModel.percentileForRank(Math.round(airBest)).hi;
    pWorst = airWorst === null ? 0 : rpModel.percentileForRank(Math.round(airWorst)).lo;
  } else {
    pBest = rpModel.percentileForRank(Math.round(airBest)).hi;
    pWorst = rpModel.percentileForRank(Math.round(airWorst)).lo;
    // partial coverage if the ladder range exits the qualified field at the bottom
    if (airWorst > rpModel.lastRank) coverage = 'partial-bottom';
  }

  const centerAir = priorModel.airForMarks(mCenter);
  const centerPercentile = centerAir === null
    ? (mCenter > scoreForCorrects(priorModel.correctsSpan[1], pattern) ? 100 : 0)
    : rpModel.percentileForRank(Math.round(centerAir)).hi;

  // --- warnings (§14 + §9's weaker-step flags) ---
  const warnings = [];
  if (n <= LOW_GT_COUNT.max) warnings.push({ code: 'LOW_GT_COUNT', note: LOW_GT_COUNT.note });
  if (perGt.some((g) => g.selected.skippedCount > 0)) {
    warnings.push({
      code: 'NO_SKIP_ASSUMPTION_WEAKENED',
      note:
        'One or more selected Grand Test attempts had skipped questions; the no-skip assumption (and therefore the performance estimate) is weakened for those GTs.',
    });
  }
  warnings.push({
    code: 'CROWD_SOURCED_PRIOR',
    note:
      'AIIMS has never published INI-CET marks. The corrects→percentile step uses a crowd-sourced ladder (Dr Mayukh Hazra compilations) as a labelled prior — an estimate with no official ground truth. The percentile→rank step, in contrast, is an exact lookup over official AIIMS results.',
  });
  if (category && category.value !== 'UR') {
    warnings.push({
      code: 'PRIOR_UR_ONLY',
      note:
        `The crowd-sourced prior behind the corrects→percentile step is UR-only; for category ${category.value} the estimate is weaker still (spec §9).`,
    });
  }
  if (WIDTH_MODEL.provisional) warnings.push({ code: 'PROVISIONAL_WIDTHS', note: NOTES.PROVISIONAL_WIDTHS });

  return {
    stage: 'PERCENTILE_RANGE',
    /** Unrounded internals for exact rank resolution (never display-rounded). */
    internal: Object.freeze({
      mLo,
      mHi,
      mCenter,
      cLo,
      cHi,
      halfWidth,
      centerCorrects,
      airBest,
      airWorst,
    }),
    performance: {
      aggregateMethod: 'mean', // §3.3 confirmed default
      patternVersion: null, // filled by the strategy (config value)
      pattern: { ...pattern },
      centerCorrects: round(centerCorrects, 2),
      halfWidthCorrects: round(halfWidth, 2),
      correctsRange: [round(cLo, 2), round(cHi, 2)],
      marksRange: [round(mLo, 1), round(mHi, 1)],
      dispersion: { sdCorrects: round(sd, 2), method: 'sample-sd' },
    },
    percentile: {
      range: [round(pWorst, 3), round(pBest, 3)],
      center: round(centerPercentile, 3),
      definition:
        `Official AIIMS ${rpModel.session} session percentiles (stored values of ${rpModel.snapshotId}; ` +
        `${rpModel.rows.toLocaleString('en-US')} qualified MD/MS candidates) — the percentile↔rank relationship is official data; the corrects→percentile step that produced this range is a crowd-sourced estimate.`,
      coverage,
    },
    transfer: {
      mode: 'TIER_3_CROWD_PRIOR_PRIMARY',
      tiers: { TIER_1: 0, TIER_2: 0, TIER_3: n },
      priorId: priorModel.priorId,
      priorProvenance: 'crowd-sourced (UR-only) — see snapshot provenance',
      priorPoints: priorModel.points,
      priorCorrectsSpan: priorModel.correctsSpan,
      urOnly: priorModel.urOnly,
    },
    warnings,
    notes: [
      NOTES.NO_SKIP,
      NOTES.DIFFICULTY_PARITY,
      'AIIMS publishes no INI-CET marks — this estimate rests on a crowd-sourced corrects→AIR prior (UR-only) for its weakest step; rank resolution is official.',
      NOTES.ESTIMATE_DISCLAIMER,
    ],
  };
}

module.exports = { buildIniCetEstimate, buildPriorModel };
