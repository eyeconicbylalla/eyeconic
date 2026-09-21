/**
 * Phase 3 unit tests — distribution model: EXACT lookups over the official
 * NBEMS 2025 snapshot (DS-NEETPG-DISTRIBUTION-2025-v1). These are
 * correctness properties (spec §18 Phase 4 standard): a wrong lookup is a
 * bug, not a tolerance question. Anchors are pinned to Phase 2 goldens
 * (golden/v1/goldens.json) — the values below were verified there.
 */

const { buildDistributionModel } = require('../../predictor/distributionModel');
const store = require('../../predictor/store');
const { PredictorError, CODES } = require('../../predictor/errors');

const goldens = require('../../predictor-data/golden/v1/goldens.json').checks;

let model; // built once from the committed, hash-verified snapshot

beforeAll(() => {
  model = buildDistributionModel(store.loadNeetPgDistribution().data);
});

describe('distribution model — build integrity', () => {
  it('loads the committed snapshot with its Phase 2 golden facts', () => {
    expect(model.snapshotId).toBe('DS-NEETPG-DISTRIBUTION-2025-v1');
    expect(model.numericPairs).toBe(goldens.distribution_2025.numeric_pairs); // 230,096
    expect(model.maxScore).toBe(goldens.distribution_2025.max_score); // 707
    expect(model.minScore).toBe(-40);
    expect(model.lastRank).toBe(230114); // 230,096 numeric + 18 withheld-interleaved
  });

  it('rejects non-contiguous or malformed band structures', () => {
    const broken = {
      snapshot_id: 'test',
      validation: { numeric_pairs: 3 },
      bands: { 10: [1, 2, 2], 9: [3, 3, 1] }, // fine (contiguous)…
    };
    expect(() => buildDistributionModel(broken)).not.toThrow();

    const gap = {
      snapshot_id: 'test',
      validation: { numeric_pairs: 3 },
      bands: { 10: [1, 1, 1], 9: [3, 3, 2] }, // rank 2 missing
    };
    expect(() => buildDistributionModel(gap)).toThrow(PredictorError);

    const sumWrong = {
      snapshot_id: 'test',
      validation: { numeric_pairs: 99 },
      bands: { 10: [1, 1, 1] },
    };
    expect(() => buildDistributionModel(sumWrong)).toThrow(PredictorError);
  });
});

describe('distribution model — rank lookups', () => {
  it('score 707 is exactly rank 1 (golden anchor)', () => {
    expect(model.rankIntervalForScore(707)).toEqual({ minR: 1, maxR: 1 });
  });

  it('pinned golden band: score 695 → ranks 5–6', () => {
    expect(model.rankIntervalForScore(695)).toEqual({ minR: 5, maxR: 6 });
  });

  it('an observed mid-distribution score resolves to its stored band', () => {
    // score 500 → [24573, 24966] (verified against the snapshot)
    expect(model.rankIntervalForScore(500)).toEqual({ minR: 24573, maxR: 24966 });
  });

  it('an UNOBSERVED score inserts between its neighbours (contiguity semantics)', () => {
    // 706 unobserved; 705 band starts at rank 2 ⇒ insertion rank exactly 2
    expect(model.rankIntervalForScore(706)).toEqual({ minR: 2, maxR: 2 });
  });

  it('scores beyond the recorded range carry explicit states, not clamped numbers', () => {
    expect(model.rankIntervalForScore(708)).toEqual({ state: 'above' });
    expect(model.rankIntervalForScore(-41)).toEqual({ state: 'below' });
  });
});

describe('distribution model — pinned percentile formula', () => {
  it('percentile(r) = 100 × (1 − r / 230,096)', () => {
    expect(model.percentileForRank(1)).toBeCloseTo(99.999565, 4);
    expect(model.percentileForRank(230096)).toBe(0);
    expect(model.percentileForRank(115048)).toBeCloseTo(50, 6);
  });

  it('withheld-interleaved tail ranks clamp at 0 rather than going negative', () => {
    expect(model.percentileForRank(230114)).toBe(0);
  });

  it('percentile intervals: [worst, best] = [pct(maxR), pct(minR)]', () => {
    const iv = model.percentileIntervalForScore(500);
    expect(iv.lo).toBeCloseTo(model.percentileForRank(24966), 8);
    expect(iv.hi).toBeCloseTo(model.percentileForRank(24573), 8);
    expect(iv.lo).toBeLessThan(iv.hi);
  });
});

describe('distribution model — inverse lookup (Tier 2 support)', () => {
  it('rank 1 → score 707; ranks inside a band → that band’s score', () => {
    expect(model.scoreForRank(1)).toEqual({ score: 707 });
    expect(model.scoreForRank(3)).toEqual({ score: 705 }); // band [2,3]
    expect(model.scoreForRank(24966)).toEqual({ score: 500 });
  });

  it('fractional ranks between bands interpolate linearly', () => {
    // between 707 (rank 1) and 705 (rank 2): rank 1.5 → score 706
    expect(model.scoreForRank(1.5).score).toBeCloseTo(706, 6);
  });

  it('out-of-range ranks carry states', () => {
    expect(model.scoreForRank(0.5)).toEqual({ state: 'above' });
    expect(model.scoreForRank(230115)).toEqual({ state: 'below' });
  });
});

describe('distribution model — monotonicity over the full snapshot', () => {
  it('best-possible rank is strictly non-improving as score falls', () => {
    // Walk every band score plus 0.5-offsets between them.
    let prevBest = 0;
    for (let s = model.maxScore; s >= model.minScore; s -= 1) {
      const iv = model.rankIntervalForScore(s);
      if (iv.state) continue;
      expect(iv.minR).toBeGreaterThanOrEqual(prevBest);
      prevBest = iv.minR;
    }
  });
});

describe('distribution model — requiredScoreForRank (strict tie-band guarantee, Desired Branch Phase 2)', () => {
  // Top bands (goldens): 707 → [1,1], 705 → [2,3], 701 → [4,4], 695 → [5,6].
  it('returns a band score only when that band’s worst rank clears the target', () => {
    expect(model.requiredScoreForRank(6)).toEqual({ score: 695 }); // 6 is 695’s band end
    expect(model.requiredScoreForRank(5)).toEqual({ score: 701 }); // inside [5,6] → band above
    expect(model.requiredScoreForRank(4)).toEqual({ score: 701 }); // 4 is 701’s band end
    expect(model.requiredScoreForRank(3)).toEqual({ score: 705 }); // 3 is 705’s band end
    expect(model.requiredScoreForRank(2)).toEqual({ score: 707 }); // inside [2,3] → 707
    expect(model.requiredScoreForRank(7)).toEqual({ score: 695 }); // first rank past 695’s band end
  });

  it('mid-range and bottom anchors (goldens)', () => {
    expect(model.requiredScoreForRank(100)).toEqual({ score: 666 });
    expect(model.requiredScoreForRank(9511)).toEqual({ score: 559 });
    expect(model.requiredScoreForRank(230087)).toEqual({ score: -11 });
    // last recorded rank and beyond → the lowest observed score already clears
    expect(model.requiredScoreForRank(230114)).toEqual({ score: -40 });
    expect(model.requiredScoreForRank(230115)).toEqual({ score: -40 });
  });

  it('rank 1 resolves to the best recorded score; sub-1 ranks are an above state', () => {
    expect(model.requiredScoreForRank(1)).toEqual({ score: 707 }); // band [1,1] ends at 1
    expect(model.requiredScoreForRank(0.5)).toEqual({ state: 'above' });
    expect(() => model.requiredScoreForRank(NaN)).toThrow(TypeError);
  });

  it('structural invariant over EVERY band: the answer’s worst rank clears the target', () => {
    // For each band: its last rank resolves to its own score; its first rank
    // (when not also its last) resolves to the band above’s score.
    const bands = Object.entries(store.loadNeetPgDistribution().data.bands)
      .map(([s, b]) => ({ score: Number(s), minR: b[0], maxR: b[1] }))
      .sort((a, b) => b.score - a.score);
    expect(bands.length).toBe(model.bandCount);
    for (let i = 0; i < bands.length; i += 1) {
      const end = model.requiredScoreForRank(bands[i].maxR);
      expect(end).toEqual({ score: bands[i].score });
      if (bands[i].minR < bands[i].maxR) {
        const start = model.requiredScoreForRank(bands[i].minR);
        if (i === 0) expect(start).toEqual({ state: 'above' });
        else expect(start).toEqual({ score: bands[i - 1].score });
      }
      // guarantee proper: scoring the answer lands at worst maxR ≤ target
      const ri = model.rankIntervalForScore(end.score);
      expect(ri.maxR).toBeLessThanOrEqual(bands[i].maxR);
    }
  });

  it('monotone: the required score never increases as the target rank loosens', () => {
    let prev = Infinity;
    for (let r = 1; r <= model.lastRank; r += 137) {
      const res = model.requiredScoreForRank(r);
      if (res.state) continue;
      expect(res.score).toBeLessThanOrEqual(prev);
      prev = res.score;
    }
  });
});
