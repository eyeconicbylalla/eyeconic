/**
 * Desired Branch Predictor — Phase 3 engine-surface tests
 * (docs/DESIRED_BRANCH_PREDICTOR.md §6, §7.2): validateDesiredBranchRequest →
 * strategy.resolveDesiredBranch composition through engine.predictRequired,
 * for both exams, all gap states (D7 normative rules), warnings, and the
 * error battery. Forward predict() must stay byte-identical (pinned by the
 * existing engine/strategy suites; regression-green here).
 */

const { createPredictorEngine } = require('../../predictor');
const { validateDesiredBranchRequest } = require('../../predictor/validation');
const { PredictorError, CODES } = require('../../predictor/errors');

const engine = createPredictorEngine();

const gts = (...corrects) =>
  corrects.map((c) => ({
    gtId: null,
    provenance: 'self-reported',
    attempts: [{ corrects: c, totalQuestions: 200, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 0 }],
  }));

/** NEET PG runs the 180-question pattern since the 2026-09-24 migration. */
const neetGts = (...corrects) =>
  corrects.map((c) => ({
    gtId: null,
    provenance: 'self-reported',
    attempts: [{ corrects: c, totalQuestions: 180, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 0 }],
  }));

const NEET_GM = 'm.d. (general medicine)'; // golden target [13, 9511]
const INI_GM = 'general medicine'; // golden target [4, 2910]

describe('validateDesiredBranchRequest — reverse contract', () => {
  it('normalizes a valid request; gts optional; quota echoed from the exam', () => {
    const v = validateDesiredBranchRequest({
      exam: 'NEET_PG', branchKey: '  m.d. (general medicine) ', category: 'UR',
    });
    expect(v.exam.id).toBe('NEET_PG');
    expect(v.branchKey).toBe('m.d. (general medicine)');
    expect(v.category).toEqual({ value: 'UR', pwd: false });
    expect(v.quota).toBe('AIQ');
    expect(v.gts).toBeNull();
    const withGts = validateDesiredBranchRequest({
      exam: 'INI_CET', branchKey: INI_GM, category: 'OBC', pwd: true, gts: gts(120),
    });
    expect(withGts.quota).toBe('INI');
    expect(withGts.gts).toHaveLength(1);
  });

  it('category is required — never defaulted (§3.6 in the reverse direction)', () => {
    expect(() => validateDesiredBranchRequest({ exam: 'NEET_PG', branchKey: NEET_GM }))
      .toThrow(/Category is required to target a branch/);
    expect(() => validateDesiredBranchRequest({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'GEN' }))
      .toThrow(/Category must be one of/);
  });

  it('branchKey required; pwd boolean; empty gts array rejected like the forward flow', () => {
    expect(() => validateDesiredBranchRequest({ exam: 'NEET_PG', branchKey: '  ', category: 'UR' }))
      .toThrow(/Select the branch/);
    expect(() => validateDesiredBranchRequest({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', pwd: 'yes' }))
      .toThrow(/pwd must be true or false/);
    expect(() => validateDesiredBranchRequest({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: [] }))
      .toThrow(/at least one Grand Test/);
  });

  it('exam rules are the shared forward rules (unknown / quota scope)', () => {
    expect(() => validateDesiredBranchRequest({ exam: 'FMGE', branchKey: NEET_GM, category: 'UR' }))
      .toThrow(/Unknown exam/);
    expect(() => validateDesiredBranchRequest({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', quota: 'DNB' }))
      .toThrow(/currently cover/);
  });
});

describe('engine.predictRequired — NEET PG (official reverse chain)', () => {
  it('full result: method block, golden target range, required corrects, no-gap state', () => {
    const r = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
    expect(r.exam).toBe('NEET_PG');
    expect(r.method).toMatchObject({
      version: 'desired-neetpg-v2',
      stage: 'REQUIRED_PERFORMANCE',
      assumptions: ['no-skip', 'full-length-standard-pattern', 'difficulty-parity'],
    });
    // Targets are expressed on the 180-question / 720-mark pattern (§10 echo).
    expect(r.method.pattern).toEqual({
      totalQuestions: 180, positive: 4, negative: 1, maxMarks: 720, version: '720-scale (+4/-1)',
    });
    expect(r.method.datasetSnapshots).toMatchObject({
      counselling: ['DS-NEETPG-COUNSELLING-2024-v1', 'DS-NEETPG-COUNSELLING-2025-v1'],
      distribution: 'DS-NEETPG-DISTRIBUTION-2025-v1',
      prior: null,
    });
    expect(r.target.targetRankRange).toEqual([13, 9511]);
    expect(r.target.coverage).toBe('MATCHED');
    // Bridged goldens: 800-scale scores 687/559 → 720-scale 618.3/503.1 →
    // 180-question corrects 160/137 (never the old 178/152 — corrects are not
    // scale-free across question counts).
    expect(r.required.perClosing.map((e) => [e.closing, e.corrects])).toEqual([[13, 160], [9511, 137]]);
    expect(r.current).toBeNull();
    expect(r.input.gts).toBeNull();
    expect(r.gap).toEqual({
      status: 'NO_CURRENT_DATA', gapToSafe: null, gapToLikely: null,
      bounded: { safe: false, likely: false },
    });
    // NEET PG carries no crowd-prior warning
    expect(r.warnings.map((w) => w.code)).not.toContain('CROWD_SOURCED_PRIOR');
    expect(r.warnings.map((w) => w.code)).toContain('HIGH_VARIABILITY'); // ratio 731.62
  });

  it('D7 gap states over the golden target (T_safe 160, T_likely 137 on the 180-question pattern)', () => {
    const onTrack = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: neetGts(170, 180) });
    // n=2 is still low-data by the forward semantics (LOW_GT_COUNT.max = 2)
    expect(onTrack.current.aggregation).toMatchObject({ n: 2, mean: 175, lowDataCaution: true });
    expect(onTrack.gap).toEqual({
      status: 'ON_TRACK', gapToSafe: 15, gapToLikely: 38, bounded: { safe: false, likely: false },
    });

    const within = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: neetGts(150, 160, 155) });
    expect(within.gap).toEqual({
      status: 'WITHIN_REACH', gapToSafe: -5, gapToLikely: 18, bounded: { safe: false, likely: false },
    });

    const below = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: neetGts(100) });
    expect(below.gap.status).toBe('BELOW_TARGET');
    expect(below.gap.gapToLikely).toBe(-37);
    // one GT → low-data caution surfaces (§14)
    expect(below.warnings.map((w) => w.code)).toContain('LOW_GT_COUNT');
    expect(below.current.aggregation.lowDataCaution).toBe(true);
  });

  it('boundary comparisons are inclusive at both thresholds (unrounded mean vs integers)', () => {
    const atSafe = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: neetGts(160, 160) });
    expect(atSafe.gap.status).toBe('ON_TRACK'); // mean 160 ≥ T_safe 160
    const atLikely = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: neetGts(137, 137) });
    expect(atLikely.gap.status).toBe('WITHIN_REACH'); // 137 ≥ T_likely, < T_safe
  });

  it('skipped GTs weaken the current average (same warning as forward)', () => {
    const r = engine.predictRequired({
      exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR',
      gts: [{ gtId: null, provenance: 'self-reported', attempts: [{ corrects: 160, totalQuestions: 180, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 12 }] }],
    });
    expect(r.warnings.map((w) => w.code)).toContain('NO_SKIP_ASSUMPTION_WEAKENED');
  });

  it('reserved category shifts the target (OBC golden [174, 10075])', () => {
    const r = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'OBC' });
    expect(r.target.targetRankRange).toEqual([174, 10075]);
    expect(r.input.category).toEqual({ value: 'OBC', pwd: false });
  });

  it('unknown branch throws INVALID_INPUT with suggestions (engine-level)', () => {
    let err = null;
    try {
      engine.predictRequired({ exam: 'NEET_PG', branchKey: 'general medicin', category: 'UR' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PredictorError);
    expect(err.code).toBe(CODES.INVALID_INPUT);
    expect(err.details.suggestions).toContain(NEET_GM);
  });
});

describe('engine.predictRequired — INI-CET (crowd-ladder reverse chain)', () => {
  it('full result: golden target [4, 2910], safe end bounded-above, likely end resolvable', () => {
    const r = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR' });
    expect(r.method.version).toBe('desired-inicet-v1');
    expect(r.method.datasetSnapshots).toMatchObject({
      prior: 'PR-INICET-HAZRA-CORRECTS-AIR-v1',
      distribution: null,
    });
    expect(r.method.datasetSnapshots.counselling).toHaveLength(6);
    expect(r.target.targetRankRange).toEqual([4, 2910]);
    expect(r.required.perClosing.map((e) => [e.closing, e.state, e.corrects])).toEqual([
      [4, 'above-ladder', null], // D7: no finite target — ON_TRACK impossible
      [2910, 'in-ladder', 134],
    ]);
    expect(r.warnings.map((w) => w.code)).toContain('CROWD_SOURCED_PRIOR');
    expect(r.warnings.map((w) => w.code)).not.toContain('PRIOR_UR_ONLY'); // UR query
  });

  it('D7 bounded-safe gap: state falls out of the likely end alone', () => {
    const within = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR', gts: gts(140, 138) });
    expect(within.gap).toEqual({
      status: 'WITHIN_REACH', // mean 139 ≥ 134, safe end has no finite target
      gapToSafe: null,
      gapToLikely: 5,
      bounded: { safe: true, likely: false },
    });
    const below = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR', gts: gts(120) });
    expect(below.gap.status).toBe('BELOW_TARGET');
    expect(below.gap.gapToSafe).toBeNull();
    expect(below.gap.bounded.safe).toBe(true);
  });

  it('reserved category adds the UR-only-prior warning (§9)', () => {
    const r = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'ST' });
    expect(r.warnings.map((w) => w.code)).toContain('CROWD_SOURCED_PRIOR');
    expect(r.warnings.map((w) => w.code)).toContain('PRIOR_UR_ONLY');
  });

  it('PwD filter flows through (golden UR-PwD target [659, 47087], below-ladder likely end)', () => {
    const r = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR', pwd: true });
    expect(r.target.targetRankRange).toEqual([659, 47087]);
    // tight end 659 is IN the ladder (→142 corrects); loosest 47087 is beyond
    // the floor 28000 → conservative 110, labelled bounded (D7 bounded-below)
    expect(r.required.perClosing[0]).toMatchObject({ closing: 659, corrects: 142, state: 'in-ladder' });
    expect(r.required.perClosing[1]).toMatchObject({ closing: 47087, corrects: 110, state: 'below-ladder', bounded: true });
    const withGts = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR', pwd: true, gts: gts(115) });
    expect(withGts.gap).toEqual({
      status: 'WITHIN_REACH', // 115 ≥ 110 (conservative floor), < 142 safe-end target
      gapToSafe: -27,
      gapToLikely: 5,
      bounded: { safe: false, likely: true },
    });
  });

  it('NO_DATA_FOR_FILTER: required and gap omitted, target state explicit', () => {
    const r = engine.predictRequired({ exam: 'INI_CET', branchKey: 'dermatology, venerology & leprosy', category: 'ST' });
    expect(r.target.coverage).toBe('NO_DATA_FOR_FILTER');
    expect(r.required).toBeNull();
    expect(r.gap).toBeNull();
    expect(r.current).toBeNull();
  });

  it('forward predict() stays consistent for both exams (regression pin)', () => {
    const fwd = engine.predict({ exam: 'NEET_PG', gts: neetGts(120, 130), category: 'UR' });
    expect(fwd.method.version).toBe('neetpg-branch-720-v1');
    expect(fwd.method.stage).toBe('BRANCHES');
    const ini = engine.predict({ exam: 'INI_CET', gts: gts(130), category: 'UR' });
    expect(ini.method.version).toBe('inicet-branch-p6.v1');
    expect(ini.rank.rankRange).toBeDefined();
  });
});
