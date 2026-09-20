/**
 * Phase 4 unit tests — NEET PG rank range resolution (spec §18 Phase 4).
 *
 * Acceptance standard from the spec: this stage is an exact lookup over
 * official data — "any mismatch is an ingestion bug, not a tolerance
 * question". Covered here:
 *   1. spot-check sample of official score→rank pairs reproduce EXACTLY
 *   2. official category-cutoff anchors agree (golden phase4_anchors)
 *   3. monotonicity of the mapping
 *   4. coverage states (§12 honesty) — no fabricated rank endpoints
 *   5. percentile↔rank cross-check (same pinned formula, both directions)
 */

const { resolveRankRange } = require('../../predictor/rankResolution');
const { buildEstimate } = require('../../predictor/transfer');
const { buildDistributionModel } = require('../../predictor/distributionModel');
const store = require('../../predictor/store');
const { aggregate } = require('../../predictor/aggregation');

const goldens = require('../../predictor-data/golden/v1/goldens.json').checks;
const ANCHORS = goldens.phase4_anchors;

const PATTERN = { totalQuestions: 200, positive: 4, negative: 1, maxMarks: 800 };
let dist;

const perGtOf = (values) =>
  aggregate(
    values.map((corrects, i) => ({
      gtId: `gt-${i}`,
      provenance: 'self-reported',
      attempts: [{ corrects, totalQuestions: 200, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 0 }],
    }))
  ).perGt;

/** Full pipeline estimate for a set of manual GT values. */
function estimateFor(values) {
  return buildEstimate({ perGt: perGtOf(values), pattern: PATTERN, distModel: dist, cohortProvider: null });
}

beforeAll(() => {
  dist = buildDistributionModel(store.loadNeetPgDistribution().data);
});

describe('Phase 4 done-when #1 — official score→rank pairs reproduce exactly', () => {
  it('every 5th band of the official distribution reproduces its exact rank interval', () => {
    // Deterministic sample (~144 bands) over all 719 official score bands.
    const bands = Object.entries(store.loadNeetPgDistribution().data.bands)
      .map(([score, b]) => ({ score: Number(score), minR: b[0], maxR: b[1] }))
      .sort((a, b) => a.score - b.score);
    const sample = bands.filter((_, i) => i % 5 === 0);
    expect(sample.length).toBeGreaterThanOrEqual(140);
    for (const band of sample) {
      expect(dist.rankIntervalForScore(band.score)).toEqual({ minR: band.minR, maxR: band.maxR });
    }
  });

  it('golden-pinned bands reproduce exactly (Phase 2 fixtures reused)', () => {
    expect(dist.rankIntervalForScore(707)).toEqual({ minR: 1, maxR: 1 });
    expect(dist.rankIntervalForScore(695)).toEqual({ minR: 5, maxR: 6 });
    expect(dist.rankIntervalForScore(500)).toEqual({ minR: 24573, maxR: 24966 });
  });
});

describe('Phase 4 done-when #2 — official category-cutoff anchors agree', () => {
  it('50th percentile rank resolves to the official UR/EWS qualifying score', () => {
    const rank = Math.round((1 - 50 / 100) * dist.numericPairs);
    expect(dist.scoreForRank(rank).score).toBe(ANCHORS.ur_ews_50th); // 276
  });

  it('45th percentile rank resolves to the official UR-PwD qualifying score', () => {
    const rank = Math.round((1 - 45 / 100) * dist.numericPairs);
    expect(dist.scoreForRank(rank).score).toBe(ANCHORS.ur_pwd_45th); // 255
  });

  it('40th percentile rank resolves to the official SC/ST/OBC qualifying score', () => {
    const rank = Math.round((1 - 40 / 100) * dist.numericPairs);
    expect(dist.scoreForRank(rank).score).toBe(ANCHORS.sc_st_obc_40th); // 235
  });

  it('the anchors sit inside their score bands (band-rounded agreement)', () => {
    for (const [pct, score] of [[50, ANCHORS.ur_ews_50th], [45, ANCHORS.ur_pwd_45th], [40, ANCHORS.sc_st_obc_40th]]) {
      const iv = dist.rankIntervalForScore(score);
      const rankAtPct = (1 - pct / 100) * dist.numericPairs;
      expect(iv.minR).toBeLessThanOrEqual(rankAtPct + 0.5);
      expect(iv.maxR).toBeGreaterThanOrEqual(rankAtPct - 0.5);
    }
  });
});

describe('Phase 4 — rank range resolution across coverage states', () => {
  it('full coverage: best = band minR at top score, worst = band maxR at bottom score', () => {
    const est = estimateFor([120, 130]); // center 125 → score 425
    const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
    expect(rank.coverage).toBe('full');
    const { sLo, sHi } = est.internal;
    expect(rank.bestRank).toBe(dist.rankIntervalForScore(sHi).minR);
    expect(rank.worstRank).toBe(dist.rankIntervalForScore(sLo).maxR);
    expect(rank.bestRank).toBeLessThan(rank.worstRank);
    expect(rank.rankRange).toEqual([rank.bestRank, rank.worstRank]);
    expect(rank.beyondLastRecordedRank).toBeNull();
    expect(rank.examYear).toBe(2025);
  });

  it('partial-top: upper end beyond the data ⇒ best rank 1 + flag', () => {
    const est = estimateFor([195]);
    const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
    expect(rank.coverage).toBe('partial-top');
    expect(rank.bestRank).toBe(1);
    expect(rank.bestBeyondData).toBe(true);
    expect(rank.worstRank).toBeGreaterThan(1);
    expect(rank.worstBeyondData).toBe(false);
  });

  it('above-distribution: whole range above every recorded score ⇒ rank 1 band', () => {
    const est = estimateFor([200]);
    const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
    expect(rank.coverage).toBe('above-distribution');
    expect(rank.rankRange).toEqual([1, 1]);
  });

  it('partial-bottom: lower end below the data ⇒ worst rank null + last-recorded echo', () => {
    const est = estimateFor([30]);
    const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
    expect(rank.coverage).toBe('partial-bottom');
    expect(rank.worstRank).toBeNull();
    expect(rank.worstBeyondData).toBe(true);
    expect(rank.beyondLastRecordedRank).toBe(dist.lastRank); // 230,114
    expect(rank.bestRank).toBeGreaterThan(0);
  });

  it('below-distribution: whole range below the recorded data ⇒ both ends null', () => {
    const est = estimateFor([5]);
    const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
    expect(rank.coverage).toBe('below-distribution');
    expect(rank.rankRange).toEqual([null, null]);
    expect(rank.beyondLastRecordedRank).toBe(dist.lastRank);
  });

  it('rejects estimates without internals (contract with Phase 3)', () => {
    expect(() => resolveRankRange({ estimate: {}, distModel: dist })).toThrow(TypeError);
  });
});

describe('Phase 4 done-when #3 — monotonicity of the mapping', () => {
  it('best and worst ranks never worsen as mean corrects rise', () => {
    let prevBest = Infinity;
    let prevWorst = Infinity;
    for (let c = 40; c <= 190; c += 10) {
      const est = estimateFor([c]);
      const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
      const best = rank.bestRank ?? 1;
      const worst = rank.worstRank ?? Infinity;
      expect(best).toBeLessThanOrEqual(prevBest);
      expect(worst).toBeLessThanOrEqual(prevWorst);
      prevBest = best;
      prevWorst = worst;
    }
  });

  it('more GTs (tight) never widen the rank range beyond the 1-GT range at the same level', () => {
    const one = resolveRankRange({ estimate: estimateFor([130]), distModel: dist, examYear: 2025 });
    const many = resolveRankRange({
      estimate: estimateFor([130, 130, 130, 130, 130, 130]),
      distModel: dist,
      examYear: 2025,
    });
    expect(many.bestRank).toBeGreaterThanOrEqual(one.bestRank);
    expect(many.worstRank).toBeLessThanOrEqual(one.worstRank);
  });
});

describe('Phase 4 — percentile↔rank cross-check (pinned formula, both directions)', () => {
  it('inverting the percentile range reproduces the direct rank endpoints exactly (full coverage)', () => {
    for (const values of [[80], [100, 110], [140, 145, 150], [165]]) {
      const est = estimateFor(values);
      const rank = resolveRankRange({ estimate: est, distModel: dist, examYear: 2025 });
      if (rank.coverage !== 'full') continue;
      const [pWorst, pBest] = est.percentile.range;
      // rounding of the displayed percentile (3dp) allows small slack
      const fromPctBest = (1 - pBest / 100) * dist.numericPairs;
      const fromPctWorst = (1 - pWorst / 100) * dist.numericPairs;
      expect(Math.abs(fromPctBest - rank.bestRank)).toBeLessThanOrEqual(1);
      expect(Math.abs(fromPctWorst - rank.worstRank)).toBeLessThanOrEqual(1);
    }
  });
});
