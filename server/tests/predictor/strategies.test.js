/**
 * Exam-strategy interface contract (spec §18): NEET PG wires the full
 * pipeline validate → aggregate → estimatePercentileRange → resolveRankRange
 * → resolveBranches (Phases 3, 4, 6); INI-CET is a scaffolded registry entry
 * that refuses everything until Phase 5 (M2).
 */

const { createNeetPgStrategy } = require('../../predictor/strategies/neetPg');
const { createIniCetStrategy } = require('../../predictor/strategies/iniCet');
const { buildStrategies } = require('../../predictor/strategies');
const store = require('../../predictor/store');
const { CODES, PredictorError } = require('../../predictor/errors');

const manual = (corrects) => ({
  provenance: 'self-reported',
  attempts: [{ corrects, status: 'completed' }],
});

let neetPg;

beforeAll(() => {
  neetPg = createNeetPgStrategy({
    loadDistribution: store.loadNeetPgDistribution,
    loadCounselling: store.loadNeetPgCounselling,
  });
});

describe('strategy registry', () => {
  it('registers both MVP exams; availability is explicit', () => {
    const registry = buildStrategies({
      loadDistribution: store.loadNeetPgDistribution,
      loadCounselling: store.loadNeetPgCounselling,
    });
    expect(Object.keys(registry).sort()).toEqual(['INI_CET', 'NEET_PG']);
    expect(registry.NEET_PG.available).toBe(true);
    expect(registry.INI_CET.available).toBe(true); // live since the M2 UI step
  });
});

describe('NEET PG strategy — live Phase 3 steps', () => {
  it('validate → aggregate → estimatePercentileRange compose end-to-end', () => {
    const validated = neetPg.validate({ exam: 'NEET_PG', gts: [manual(120), manual(128)] });
    const aggregation = neetPg.aggregate(validated);
    const estimate = neetPg.estimatePercentileRange({ validated, aggregation });

    expect(estimate.stage).toBe('PERCENTILE_RANGE');
    expect(estimate.performance.patternVersion).toBe('800-scale (+4/-1)');
    expect(estimate.transfer.tiers).toEqual({ TIER_1: 2, TIER_2: 0 });
    expect(estimate.percentile.range[0]).toBeLessThan(estimate.percentile.range[1]);
  });

  it('validateForBranches enforces category presence (§3.6 gate for Phase 6)', () => {
    const validated = neetPg.validate({ exam: 'NEET_PG', gts: [manual(100)] });
    expect(() => neetPg.validateForBranches(validated)).toThrow(PredictorError);
  });

  it('distributionMeta reports the verified snapshot backing the strategy', () => {
    expect(neetPg.distributionMeta()).toEqual({
      snapshotId: 'DS-NEETPG-DISTRIBUTION-2025-v1',
      numericPairs: 230096,
    });
  });
});

describe('all interface steps live through Phase 6', () => {
  it('NEET PG resolveRankRange is exact (Phase 4)', () => {
    const validated = neetPg.validate({ exam: 'NEET_PG', gts: [manual(120)] });
    const aggregation = neetPg.aggregate(validated);
    const estimate = neetPg.estimatePercentileRange({ validated, aggregation });
    const rank = neetPg.resolveRankRange({ validated, estimate });
    expect(rank.stage).toBe('RANK_RANGE');
    expect(rank.examYear).toBe(2025);
    expect(rank.bestRank).toBeLessThan(rank.worstRank);
  });

  it('NEET PG resolveBranches matches cutoffs (Phase 6), gated on category', () => {
    const withCat = neetPg.validate({ exam: 'NEET_PG', gts: [manual(120)], category: 'UR' });
    const agg = neetPg.aggregate(withCat);
    const est = neetPg.estimatePercentileRange({ validated: withCat, aggregation: agg });
    const rank = neetPg.resolveRankRange({ validated: withCat, estimate: est });
    const branches = neetPg.resolveBranches({ validated: withCat, rank });
    expect(branches.stage).toBe('BRANCHES');
    expect(['MATCHED', 'PARTIAL']).toContain(branches.coverage);
    expect(branches.dataCoverage.years).toEqual([2024, 2025]);

    // §3.6 gate: no category → typed error, never a silent default
    const noCat = neetPg.validate({ exam: 'NEET_PG', gts: [manual(120)] });
    expect(() => neetPg.resolveBranches({ validated: noCat, rank })).toThrow(PredictorError);
    try {
      neetPg.resolveBranches({ validated: noCat, rank });
    } catch (e) {
      expect(e.code).toBe(CODES.INVALID_INPUT);
    }
  });
});

describe('INI-CET strategy (implemented in Phases 5+6 / M2)', () => {
  const iniCet = createIniCetStrategy();

  it('is registered and LIVE since the M2 UI step', () => {
    expect(iniCet.available).toBe(true);
    expect(iniCet.milestone).toBe('M2');
  });

  it('validate accepts INI-CET requests through the shared §3.5 rules', () => {
    const v = iniCet.validate({ exam: 'INI_CET', gts: [manual(130)] });
    expect(v.exam.id).toBe('INI_CET');
    expect(v.quota).toBe('INI'); // single pool, §3.6
    expect(() => iniCet.validate({ exam: 'INI_CET', gts: [manual(250)] })).toThrow(PredictorError);
  });

  it('data-dependent steps refuse loudly without wired loaders (nothing half-built is servable)', () => {
    // minimal valid-shaped args so the missing-loader guard is what fires
    const calls = {
      estimatePercentileRange: { validated: { exam: { pattern: {} }, category: null }, aggregation: { perGt: [] } },
      resolveRankRange: { estimate: { internal: {}, percentile: { range: [50, 60] } } },
    };
    for (const step of Object.keys(calls)) {
      let err = null;
      try {
        iniCet[step](calls[step]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(PredictorError);
      expect(err.code).toBe(CODES.STEP_NOT_IMPLEMENTED);
    }
  });

  it('branches are implemented (Phase 6 M2) — no step refuses except the loaders', () => {
    // resolveBranches is live; without a wired counselling loader it still
    // refuses loudly (nothing half-built is servable)
    let err = null;
    try {
      iniCet.resolveBranches({
        validated: { exam: { pattern: {} }, category: { value: 'UR', pwd: false }, quota: 'INI', gts: [] },
        rank: { bestRank: 500, worstRank: 900 },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PredictorError);
    expect(err.code).toBe(CODES.STEP_NOT_IMPLEMENTED);
  });
});
