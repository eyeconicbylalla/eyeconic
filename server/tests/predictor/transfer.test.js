/**
 * Phase 3 unit tests — the Percentile-Transfer Prior (spec §5) and its
 * Tier 1/Tier 2 fallback ladder (§5.4), run against the REAL official
 * distribution snapshot (never synthetic distributions).
 *
 * Synthetic cohort fixtures appear ONLY here, as test inputs to exercise the
 * Tier 2 mechanism — they are never stored or served as data (§4).
 */

const {
  buildEstimate,
  selectTiers,
  cohortPercentile,
  scoreForCorrects,
  correctsForScore,
} = require('../../predictor/transfer');
const { buildDistributionModel } = require('../../predictor/distributionModel');
const store = require('../../predictor/store');
const { TRANSFER } = require('../../predictor/config');
const { aggregate } = require('../../predictor/aggregation');

const PATTERN = { totalQuestions: 200, positive: 4, negative: 1, maxMarks: 800 };
let dist;

beforeAll(() => {
  dist = buildDistributionModel(store.loadNeetPgDistribution().data);
});

const perGtOf = (values) =>
  aggregate(
    values.map((corrects, i) => ({
      gtId: `gt-${i}`,
      provenance: 'self-reported',
      attempts: [{ corrects, totalQuestions: 200, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 0 }],
    }))
  ).perGt;

describe('marking-scheme transfer (Tier 1 core math)', () => {
  it('maps corrects to exam score under no-skip +4/−1: score = 5c − 200', () => {
    expect(scoreForCorrects(200, PATTERN)).toBe(800);
    expect(scoreForCorrects(100, PATTERN)).toBe(300);
    expect(scoreForCorrects(0, PATTERN)).toBe(-200);
  });

  it('inverts exactly', () => {
    for (const c of [0, 37, 100, 163, 200]) {
      expect(correctsForScore(scoreForCorrects(c, PATTERN), PATTERN)).toBe(c);
    }
  });
});

describe('tier ladder (§5.4)', () => {
  it('without a cohort provider every GT transfers on Tier 1 (launch mode)', () => {
    const ladder = selectTiers(perGtOf([120, 130]), {
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(ladder.tiers).toEqual({ TIER_1: 2, TIER_2: 0 });
    expect(ladder.perGt[0].transferredScore).toBe(5 * 120 - 200);
    expect(ladder.fallbacks).toEqual([]);
  });

  it('a cohort at/above the threshold flips that GT to Tier 2 with the pinned mid-rank percentile', () => {
    const cohortCorrects = Array.from({ length: TRANSFER.TIER2_MIN_COHORT }, (_, i) => i); // 0..99
    const perGt = perGtOf([50]);
    perGt[0].gtId = 'real-gt';
    const ladder = selectTiers(perGt, {
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: () => ({ size: cohortCorrects.length, corrects: cohortCorrects }),
    });
    expect(ladder.tiers).toEqual({ TIER_1: 0, TIER_2: 1 });
    // mid-rank percentile of 50 in 0..99: below=50, equal=1 → (50+0.5)/100 = 50.5
    const p = cohortPercentile(50, cohortCorrects);
    expect(p).toBeCloseTo(50.5, 10);
    const rank = (1 - p / 100) * dist.numericPairs;
    expect(ladder.perGt[0].transferredScore).toBeCloseTo(dist.scoreForRank(rank).score, 6);
    expect(ladder.perGt[0].cohortSize).toBe(cohortCorrects.length);
  });

  it('a cohort below the threshold falls back to Tier 1 with a recorded reason', () => {
    const perGt = perGtOf([100]);
    perGt[0].gtId = 'small-gt';
    const ladder = selectTiers(perGt, {
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: () => ({ size: TRANSFER.TIER2_MIN_COHORT - 1, corrects: [1, 2, 3] }),
    });
    expect(ladder.tiers).toEqual({ TIER_1: 1, TIER_2: 0 });
    expect(ladder.fallbacks).toEqual([
      { gtId: 'small-gt', reason: 'cohort-below-min-size' },
    ]);
  });

  it('a missing cohort records the fallback; mixed tiers are flagged', () => {
    const perGt = perGtOf([100, 140]);
    perGt[0].gtId = 'gt-with-cohort';
    perGt[1].gtId = 'gt-without';
    const big = Array.from({ length: 150 }, (_, i) => i);
    const ladder = selectTiers(perGt, {
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: (gtId) =>
        gtId === 'gt-with-cohort' ? { size: 150, corrects: big } : null,
    });
    expect(ladder.tiers).toEqual({ TIER_1: 1, TIER_2: 1 });
    expect(ladder.mixedTiers).toBe(true);
    expect(ladder.fallbacks).toEqual([{ gtId: 'gt-without', reason: 'no-cohort' }]);
  });

  it('cohortPercentile implements the pinned definition (below + 0.5·ties)/size', () => {
    expect(cohortPercentile(10, [10, 10, 20, 5])).toBeCloseTo(50, 10); // below=1, ties=2 → (1+1)/4
    expect(cohortPercentile(99, [1, 2, 3])).toBe(100);
    expect(cohortPercentile(0, [0, 0])).toBeCloseTo(50, 10);
  });
});

describe('estimate assembly (percentile range + coverage states)', () => {
  it('all-Tier-1 estimate: center is exactly the §3.3 mean of corrects (identity)', () => {
    const est = buildEstimate({
      perGt: perGtOf([120, 130]),
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(est.performance.centerCorrects).toBe(125);
    // score range endpoints follow the corrects range under 5c − 200 (tolerance:
    // endpoints are rounded independently to 2/1 decimals)
    const { correctsRange, scoreRange } = est.performance;
    expect(scoreRange[0]).toBeCloseTo(5 * correctsRange[0] - 200, 0);
    expect(scoreRange[1]).toBeCloseTo(5 * correctsRange[1] - 200, 0);
    expect(est.percentile.range[0]).toBeLessThan(est.percentile.range[1]);
    expect(est.percentile.coverage).toBe('full');
    expect(est.transfer.tiers).toEqual({ TIER_1: 2, TIER_2: 0 });
    expect(est.stage).toBe('PERCENTILE_RANGE');
  });

  it('a mid-range estimate brackets the official distribution correctly', () => {
    // mean 100 → center score 300 → band [102996, 103605] → ~55th percentile
    const centerIv = dist.percentileIntervalForScore(300);
    const centerPct = (centerIv.lo + centerIv.hi) / 2;
    const est = buildEstimate({
      perGt: perGtOf([100]),
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(est.percentile.center).toBeCloseTo(centerPct, 1);
    // n=1 ⇒ widest width; the range must contain the center interval
    expect(est.percentile.range[0]).toBeLessThan(centerIv.lo);
    expect(est.percentile.range[1]).toBeGreaterThan(centerIv.hi);
  });

  it('top-of-class estimate reports partial-top coverage when the upper end exits the data', () => {
    const est = buildEstimate({
      perGt: perGtOf([195]),
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(est.percentile.coverage).toBe('partial-top');
    expect(est.percentile.range[1]).toBe(100);
    expect(est.percentile.range[0]).toBeLessThan(100);
  });

  it('estimate fully above every recorded score reports above-distribution (§12 honesty)', () => {
    const est = buildEstimate({
      perGt: perGtOf([200]),
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(est.percentile.coverage).toBe('above-distribution');
    expect(est.percentile.range[1]).toBe(100);
  });

  it('weak estimate reports below-distribution / partial-bottom without fabricating', () => {
    const below = buildEstimate({
      perGt: perGtOf([5]),
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(below.percentile.coverage).toBe('below-distribution');
    expect(below.percentile.range[0]).toBe(0);

    const partial = buildEstimate({
      perGt: perGtOf([30]),
      pattern: PATTERN,
      distModel: dist,
      cohortProvider: null,
    });
    expect(partial.percentile.coverage).toBe('partial-bottom');
    expect(partial.percentile.range[0]).toBe(0);
    expect(partial.percentile.range[1]).toBeGreaterThan(0);
  });

  it('more GTs with tight values produce a narrower percentile range than one GT (§11)', () => {
    const one = buildEstimate({ perGt: perGtOf([120]), pattern: PATTERN, distModel: dist });
    const many = buildEstimate({
      perGt: perGtOf([120, 121, 120, 122, 121, 120]),
      pattern: PATTERN,
      distModel: dist,
    });
    expect(many.performance.halfWidthCorrects).toBeLessThan(one.performance.halfWidthCorrects);
    const widthOne = one.percentile.range[1] - one.percentile.range[0];
    const widthMany = many.percentile.range[1] - many.percentile.range[0];
    expect(widthMany).toBeLessThan(widthOne);
  });

  it('warnings: low GT count, provisional widths, and weakened no-skip assumption', () => {
    const perGt = perGtOf([110]);
    perGt[0].selected.skippedCount = 7;
    const est = buildEstimate({ perGt, pattern: PATTERN, distModel: dist });
    const codes = est.warnings.map((w) => w.code);
    expect(codes).toContain('LOW_GT_COUNT');
    expect(codes).toContain('PROVISIONAL_WIDTHS');
    expect(codes).toContain('NO_SKIP_ASSUMPTION_WEAKENED');
  });

  it('notes always carry the no-skip assumption, parity, and disclaimer strings (§13/§14)', () => {
    const est = buildEstimate({ perGt: perGtOf([110]), pattern: PATTERN, distModel: dist });
    expect(est.notes).toHaveLength(3);
    expect(est.notes[0]).toMatch(/assumes you attempted all questions/i);
    expect(est.notes[2]).toMatch(/Estimate based on historical data/i);
  });
});
