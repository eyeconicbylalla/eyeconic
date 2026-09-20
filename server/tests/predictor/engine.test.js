/**
 * Phase 3 unit tests — engine end-to-end: predict() assembles the full
 * result record (estimate + inputs + method metadata) that Phase 7 will serve
 * and Phase 9 will persist — everything needed for reproducibility is
 * already on the object.
 */

const { createPredictorEngine } = require('../../predictor');
const { METHOD_VERSION } = require('../../predictor/config');
const { PredictorError, CODES } = require('../../predictor/errors');

const manual = (corrects, extra = {}) => ({
  provenance: 'self-reported',
  attempts: [{ corrects, status: 'completed', ...extra }],
});

let engine;

beforeAll(() => {
  engine = createPredictorEngine();
});

describe('engine.listExams', () => {
  it('exposes both MVP exams with explicit availability', () => {
    const exams = engine.listExams();
    expect(exams.map((e) => e.id).sort()).toEqual(['INI_CET', 'NEET_PG']);
    const ini = exams.find((e) => e.id === 'INI_CET');
    expect(ini.available).toBe(false);
    expect(ini.milestone).toBe('M2');
  });
});

describe('engine.predict — happy path (NEET PG, manual GTs)', () => {
  const request = {
    exam: 'NEET_PG',
    gts: [manual(120), manual(126), manual(123)],
  };

  it('returns the Phase 4 stage with a defensible percentile range', () => {
    const result = engine.predict(request);
    expect(result.exam).toBe('NEET_PG');
    expect(result.estimate.stage).toBe('PERCENTILE_RANGE');
    const [pLo, pHi] = result.estimate.percentile.range;
    expect(pLo).toBeLessThan(pHi);
    expect(pLo).toBeGreaterThanOrEqual(0);
    expect(pHi).toBeLessThanOrEqual(100);
  });

  it('returns the exact AIR range over the official distribution (Phase 4)', () => {
    const result = engine.predict(request);
    expect(result.method.stage).toBe('RANK_RANGE');
    expect(result.rank.stage).toBe('RANK_RANGE');
    expect(result.rank.coverage).toBe('full');
    expect(result.rank.bestRank).toBeLessThan(result.rank.worstRank);
    expect(Number.isInteger(result.rank.bestRank)).toBe(true);
    expect(Number.isInteger(result.rank.worstRank)).toBe(true);
    expect(result.rank.examYear).toBe(2025);
  });

  it('without a category, branch results are an explicit CATEGORY_REQUIRED state (§3.6)', () => {
    const result = engine.predict(request);
    expect(result.branches.stage).toBe('BRANCHES');
    expect(result.branches.coverage).toBe('CATEGORY_REQUIRED');
    expect(result.branches.message).toMatch(/Category is required/i);
    expect(result.method.stage).toBe('RANK_RANGE'); // rank stage still the top stage
  });

  it('with a category, full branch results with §12 banding and context (Phase 6)', () => {
    const result = engine.predict({ ...request, category: 'UR' });
    expect(result.method.stage).toBe('BRANCHES');
    expect(result.branches.stage).toBe('BRANCHES');
    expect(['MATCHED', 'PARTIAL']).toContain(result.branches.coverage);
    expect(result.branches.dataCoverage.years).toEqual([2024, 2025]);
    expect(result.branches.dataCoverage.snapshotIds).toEqual([
      'DS-NEETPG-COUNSELLING-2024-v1',
      'DS-NEETPG-COUNSELLING-2025-v1',
    ]);
    expect(result.branches.category).toEqual({ value: 'UR', pwd: false });
    expect(result.branches.quota).toBe('AIQ');
    // mean 123 corrects ⇒ AIR ~14k–67k ⇒ UR AIQ must have real possibilities
    const total = result.branches.years.reduce((a, y) => a + y.counts.total, 0);
    expect(total).toBeGreaterThan(50);
    const row = result.branches.years[1].rows.COMFORTABLE[0];
    expect(row).toMatchObject({
      category: 'UR',
      quota: 'AIQ',
      year: 2025,
      band: 'COMFORTABLE',
    });
    expect(row.institute).toBeTruthy();
    expect(row.branch).toBeTruthy();
    expect(Number.isInteger(row.closingRank)).toBe(true);
    expect(result.branches.notes[0]).toMatch(/not a guarantee/i);
  });

  it('records the transfer tier used (done-when requirement)', () => {
    const result = engine.predict(request);
    expect(result.estimate.transfer.tiers).toEqual({ TIER_1: 3, TIER_2: 0 });
    expect(result.estimate.transfer.mixedTiers).toBe(false);
    expect(result.estimate.transfer.tier2CohortThreshold).toBe(100);
    expect(result.estimate.transfer.perGt.every((g) => g.tier === 'TIER_1')).toBe(true);
  });

  it('carries full method metadata for Phase 9 persistence', () => {
    const result = engine.predict(request);
    expect(result.method.version).toBe(METHOD_VERSION);
    expect(result.method.stage).toBe('RANK_RANGE');
    expect(result.method.assumptions).toEqual([
      'no-skip',
      'full-length-standard-pattern',
      'difficulty-parity',
    ]);
    expect(result.method.aggregation.dedupRuleId).toBe('one-per-gt-v1');
    expect(result.method.widthModel.id).toBe('sqrt-decay-v1');
    expect(result.method.widthModel.provisional).toBe(true);
    expect(result.method.datasetSnapshots.distribution).toBe('DS-NEETPG-DISTRIBUTION-2025-v1');
    expect(result.method.datasetSnapshots.counselling).toEqual([
      'DS-NEETPG-COUNSELLING-2024-v1',
      'DS-NEETPG-COUNSELLING-2025-v1',
    ]);
  });

  it('echoes inputs with provenance, category, and quota context', () => {
    const result = engine.predict(request);
    expect(result.input.gts).toHaveLength(3);
    expect(result.input.gts.every((g) => g.provenance === 'self-reported')).toBe(true);
    expect(result.input.category).toBeNull(); // §3.6: absent, not defaulted
    expect(result.input.quota).toBe('AIQ');
    expect(result.input.quotaDefaulted).toBe(true);
    expect(result.input.quotaLabel).toBe('All India Quota');
  });

  it('reports aggregation stats including the robust alternatives (§3.3)', () => {
    const result = engine.predict(request);
    expect(result.aggregation.n).toBe(3);
    expect(result.aggregation.values).toEqual([120, 126, 123]);
    expect(result.aggregation.mean).toBe(123);
    expect(result.aggregation.median).toBe(123);
    expect(result.aggregation.trimmedMean).toBe(123);
    expect(result.aggregation.lowDataCaution).toBe(false); // 3 GTs > 2
  });

  it('flags low-data caution for 1–2 GTs (§14)', () => {
    const one = engine.predict({ exam: 'NEET_PG', gts: [manual(100)] });
    expect(one.aggregation.lowDataCaution).toBe(true);
    const codes = one.estimate.warnings.map((w) => w.code);
    expect(codes).toContain('LOW_GT_COUNT');
  });

  it('accepts category (+PwD) alongside the percentile request (feeds the Phase 6 branch stage)', () => {
    const result = engine.predict({
      ...request,
      category: 'OBC',
      pwd: true,
      quota: 'AIQ',
    });
    expect(result.input.category).toEqual({ value: 'OBC', pwd: true });
    expect(result.input.quotaDefaulted).toBe(false);
  });
});

describe('engine.predict — dedup visible end-to-end (§3.3 one value per GT)', () => {
  it('uses only the selected attempt per GT and lists exclusions', () => {
    const result = engine.predict({
      exam: 'NEET_PG',
      gts: [
        {
          gtId: 'gt-1',
          provenance: 'auto-captured',
          attempts: [
            { corrects: 100, status: 'completed', endedAt: 1000 },
            { corrects: 118, status: 'completed', endedAt: 2000 },
          ],
        },
        manual(124),
      ],
    });
    expect(result.aggregation.values).toEqual([118, 124]);
    const gt1 = result.input.gts[0];
    expect(gt1.selected.corrects).toBe(118);
    expect(gt1.excluded).toEqual([{ corrects: 100, reason: 'superseded-by-newer-attempt' }]);
    expect(gt1.provenance).toBe('auto-captured');
  });
});

describe('engine.predict — Tier 2 via injected cohort provider (mechanism test)', () => {
  it('flips a GT with a sufficient cohort to Tier 2 and records the threshold', () => {
    const cohort = Array.from({ length: 150 }, (_, i) => 40 + (i % 80)); // 150 attempts
    const withCohort = createPredictorEngine({
      cohortProvider: (gtId) => (gtId === 'gt-1' ? { size: cohort.length, corrects: cohort } : null),
    });
    const result = withCohort.predict({
      exam: 'NEET_PG',
      gts: [
        { gtId: 'gt-1', provenance: 'auto-captured', attempts: [{ corrects: 110, status: 'completed' }] },
        manual(130),
      ],
    });
    expect(result.estimate.transfer.tiers).toEqual({ TIER_1: 1, TIER_2: 1 });
    expect(result.estimate.transfer.mixedTiers).toBe(true);
    const tier2Gt = result.estimate.transfer.perGt.find((g) => g.tier === 'TIER_2');
    expect(tier2Gt.gtId).toBe('gt-1');
    expect(tier2Gt.cohortSize).toBe(150);
    const codes = result.estimate.warnings.map((w) => w.code);
    expect(codes).toContain('MIXED_TRANSFER_TIERS');
  });
});

describe('engine.predict — error paths surface typed errors', () => {
  it('unknown exam → INVALID_INPUT listing supported exams', () => {
    expect(() => engine.predict({ exam: 'NEET-UG', gts: [manual(100)] })).toThrow(PredictorError);
  });

  it('INI-CET → EXAM_NOT_AVAILABLE (M2)', () => {
    try {
      engine.predict({ exam: 'INI_CET', gts: [manual(100)] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PredictorError);
      expect(e.code).toBe(CODES.EXAM_NOT_AVAILABLE);
    }
  });

  it('invalid GT values bubble the field path', () => {
    try {
      engine.predict({ exam: 'NEET_PG', gts: [manual(999)] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe(CODES.INVALID_INPUT);
      expect(e.details.field).toBe('gts[0].attempts[0].corrects');
    }
  });

  it('non-object requests are rejected', () => {
    expect(() => engine.predict(null)).toThrow(PredictorError);
    expect(() => engine.predict('NEET_PG')).toThrow(PredictorError);
  });
});
