/**
 * Phase 5 (M2) — INI-CET strategy tests (spec §18 Phase 5 done-when:
 * "Rank ranges produced for INI-CET with the weaker step clearly flagged in
 * output metadata").
 *
 * The product gate stays closed (INI_CET available:false until Phase 6 + UI),
 * exactly like Phases 3/4 tested NEET PG stages before Phase 7 mounted the
 * API — so these tests drive the STRATEGY directly through buildStrategies.
 */
const store = require('../../predictor/store');
const { EXAMS } = require('../../predictor/config');
const { buildStrategies } = require('../../predictor/strategies');
const { buildRankPercentileModel } = require('../../predictor/rankPercentileModel');
const { createPredictorEngine } = require('../../predictor');
const { PredictorError, CODES } = require('../../predictor/errors');

const strategies = buildStrategies({
  loadDistribution: store.loadNeetPgDistribution,
  loadCounselling: store.loadNeetPgCounselling,
  loadIniCetDistribution: store.loadIniCetDistribution,
  loadIniCetPrior: store.loadIniCetPrior,
  loadIniCetCounselling: store.loadIniCetCounselling,
});
const ini = strategies.INI_CET;

const gts = (...corrects) => corrects.map((c) => ({
  gtId: null,
  provenance: 'self-reported',
  attempts: [{ corrects: c, totalQuestions: 200, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 0 }],
}));

/** Build validated + aggregation the way engine.predict would (§3 stages). */
function runEstimate(corrects, category = null) {
  const validated = {
    exam: EXAMS.INI_CET,
    category: category ? { value: category, pwd: false } : null,
    quota: 'INI',
    quotaDefaulted: true,
    gts: gts(...corrects),
  };
  const aggregation = ini.aggregate(validated);
  const estimate = ini.estimatePercentileRange({ validated, aggregation });
  const rank = ini.resolveRankRange({ validated, estimate });
  return { validated, aggregation, estimate, rank };
}

describe('INI-CET Phase 5 — official rank-percentile model', () => {
  const rp = buildRankPercentileModel(store.loadIniCetDistribution('2025-07').data);

  it('exposes the official session with rank 1 at 100.0 percentile', () => {
    expect(rp.snapshotId).toBe('DS-INICET-DISTRIBUTION-202507-v1');
    expect(rp.session).toBe('2025-07');
    expect(rp.percentileForRank(1).lo).toBe(100);
    expect(rp.topPercentile).toBe(100);
    expect(rp.lastRank).toBe(49248);
    expect(rp.rows).toBe(46884);
  });

  it('inverts exactly: a stored percentile resolves to the tie block containing its rank', () => {
    for (const r of [1, 7, 2500, 15340, 46884]) {
      const iv = rp.percentileForRank(r);
      const back = rp.rankForPercentile(iv.lo);
      expect(back.minR).toBeLessThanOrEqual(r);
      expect(back.maxR).toBeGreaterThanOrEqual(r);
    }
  });

  it('fails loudly on structural drift (tampered rows)', () => {
    const data = JSON.parse(JSON.stringify(store.loadIniCetDistribution('2025-07').data));
    data.rows[100] = [data.rows[100][0], data.rows[99][1] + 500]; // percentile increases with rank
    try {
      buildRankPercentileModel(data);
      throw new Error('expected DATA_INTEGRITY');
    } catch (e) {
      expect(e.code).toBe(CODES.DATA_INTEGRITY);
    }
  });
});

describe('INI-CET Phase 5 — crowd prior (the weak step)', () => {
  it('loads hash-verified with the UR-only crowd provenance', () => {
    const { snapshotId, data } = store.loadIniCetPrior();
    expect(snapshotId).toBe('PR-INICET-HAZRA-CORRECTS-AIR-v1');
    expect(data.source.type).toBe('crowd-sourced');
    expect(data.source.ur_only).toBe(true);
    expect(data.runtime_points).toHaveLength(7);
  });
});

describe('INI-CET Phase 5 — estimate + rank range (strategy level)', () => {
  it('produces a percentile range and an official rank range for mid GTs', () => {
    const { estimate, rank } = runEstimate([130, 140]);
    expect(estimate.stage).toBe('PERCENTILE_RANGE');
    expect(estimate.percentile.range[0]).toBeLessThan(estimate.percentile.range[1]);
    expect(estimate.percentile.coverage).toBe('full');
    // weak step flagged everywhere §9 demands
    expect(estimate.transfer.mode).toBe('TIER_3_CROWD_PRIOR_PRIMARY');
    expect(estimate.transfer.tiers).toEqual({ TIER_1: 0, TIER_2: 0, TIER_3: 2 });
    expect(estimate.transfer.urOnly).toBe(true);
    expect(estimate.warnings.map((w) => w.code)).toContain('CROWD_SOURCED_PRIOR');
    expect(estimate.notes.join(' ')).toMatch(/AIIMS publishes no INI-CET marks/);
    // exact pattern arithmetic under no-skip: mean 135c -> 113.3 marks
    expect(estimate.performance.marksRange[0]).toBeLessThan(113.4);
    expect(estimate.performance.marksRange[1]).toBeGreaterThan(113.2);
    // rank stage
    expect(rank.stage).toBe('RANK_RANGE');
    expect(rank.session).toBe('2025-07');
    expect(rank.bestRank).toBeLessThan(rank.worstRank);
    expect(rank.bestRank).toBeGreaterThan(0);
    expect(rank.definition).toMatch(/official AIIMS 2025-07 result distribution/);
    expect(rank.definition).toMatch(/crowd-sourced prior/); // uncertainty inherited, stated
  });

  it('anchors near the ladder ends after official normalization', () => {
    // 1-GT width ±15 corrects: the range [120..150] has its best end at 150c
    // (ladder AIR 100) and worst end at 120c (ladder AIR 10,000) — official
    // normalization must land both ends in those neighbourhoods.
    const { rank } = runEstimate([135]);
    expect(rank.bestRank).toBeGreaterThan(30);
    expect(rank.bestRank).toBeLessThan(400);
    expect(rank.worstRank).toBeGreaterThan(5000);
    expect(rank.worstRank).toBeLessThan(20000);
  });

  it('flags reserved categories with the UR-only-prior warning (§9)', () => {
    const { estimate } = runEstimate([130], 'OBC');
    expect(estimate.warnings.map((w) => w.code)).toContain('PRIOR_UR_ONLY');
    const ur = runEstimate([130], 'UR');
    expect(ur.estimate.warnings.map((w) => w.code)).not.toContain('PRIOR_UR_ONLY');
  });

  it('shows the low-data caution and wide 1-GT range (§11/§14)', () => {
    const { estimate } = runEstimate([125]);
    expect(estimate.warnings.map((w) => w.code)).toContain('LOW_GT_COUNT');
    expect(estimate.performance.halfWidthCorrects).toBe(15); // sqrt-decay single-GT width
  });

  it('handles above-prior GTs honestly: best rank 1, never fabricated above', () => {
    const { estimate, rank } = runEstimate([165]);
    expect(estimate.percentile.coverage).toBe('above-prior');
    expect(rank.bestRank).toBe(1);
    expect(rank.bestBeyondData).toBe(true);
    expect(rank.worstRank).toBeGreaterThan(0); // lower end still inside the ladder
  });

  it('handles below-prior GTs honestly: worst end beyond, never extrapolated', () => {
    const { estimate, rank } = runEstimate([100]);
    expect(estimate.percentile.coverage).toBe('below-prior');
    expect(rank.worstRank).toBeNull();
    expect(rank.worstBeyondData).toBe(true);
    expect(rank.bestRank).toBeGreaterThan(0);
    expect(rank.bestRank).toBeLessThan(50000);
  });

  it('echoes verified snapshot ids for prediction records (§17)', () => {
    const meta = ini.distributionMeta();
    expect(meta.snapshotId).toBe('DS-INICET-DISTRIBUTION-202507-v1');
    expect(meta.priorId).toBe('PR-INICET-HAZRA-CORRECTS-AIR-v1');
  });

  it('carries its own method version, separate from NEET PG (§5.3 traceability)', () => {
    expect(ini.methodVersion).toBe('inicet-branch-p6.v1');
    expect(strategies.NEET_PG.methodVersion).toBe('neetpg-branch-p6.v1');
  });
});

describe('INI-CET Phase 6 — branch/college matching over official AIIMS allotments', () => {
  const branchesFor = (rank, category = 'UR', pwd = false) =>
    ini.resolveBranches({
      validated: { exam: EXAMS.INI_CET, category: { value: category, pwd }, quota: 'INI', gts: [] },
      rank: { bestRank: rank[0], worstRank: rank[1] },
    });

  it('requires a category — never defaulted (§3.6)', () => {
    expect(() =>
      ini.resolveBranches({
        validated: { exam: EXAMS.INI_CET, category: null, quota: 'INI', gts: [] },
        rank: { bestRank: 500, worstRank: 900 },
      })
    ).toThrow(PredictorError);
  });

  it('matches mid ranks across all 5 sessions with unique session tags (§12)', () => {
    const result = branchesFor([500, 2000], 'UR');
    expect(result.stage).toBe('BRANCHES');
    expect(result.quota).toBe('INI');
    expect(result.years).toHaveLength(5);
    // session-aware year tags: YYYYMM, unique + sortable (Jan/Jul distinct)
    expect(result.years.map((y) => y.year)).toEqual([202301, 202401, 202407, 202501, 202507]);
    expect(result.years.every((y) => typeof y.session === 'string' && /^\d{4}-\d{2}$/.test(y.session))).toBe(true);
    expect(result.dataCoverage.years).toEqual([202301, 202401, 202407, 202501, 202507]);
    expect(result.dataCoverage.snapshotIds).toHaveLength(5);
    const matched = result.years.filter((y) => y.counts.total > 0);
    expect(matched.length).toBe(5);
    const rows = matched.flatMap((y) => Object.values(y.rows).flat());
    expect(rows.length).toBeGreaterThan(50);
    for (const row of rows) {
      expect(row.quota).toBe('INI');
      expect(row.category).toBe('UR');
      expect(row.pwd).toBeUndefined();
      expect(row.session).toMatch(/^\d{4}-\d{2}$/);
      expect(row.round).toBe('final state (end of counselling)');
    }
  });

  it('filters by PwD (§3.6) and category', () => {
    const ur = branchesFor([500, 2000], 'UR', false);
    const urPwd = branchesFor([500, 2000], 'UR', true);
    const obc = branchesFor([500, 2000], 'OBC', false);
    expect(ur.coverage).toBe('MATCHED');
    expect(urPwd.years.some((y) => y.counts.total > 0)).toBe(true); // PwD seats exist
    expect(urPwd.coverage === 'MATCHED' || urPwd.coverage === 'PARTIAL').toBe(true);
    expect(obc.years.some((y) => y.counts.total > 0)).toBe(true);
    // PWBD seat groups are far fewer than non-PwD ones
    const urTotal = ur.years.reduce((a, y) => a + y.counts.total, 0);
    const pwdTotal = urPwd.years.reduce((a, y) => a + y.counts.total, 0);
    expect(pwdTotal).toBeLessThan(urTotal);
  });

  it('handles the extreme states honestly (§12)', () => {
    // every session's tightest UR close is ≥ 2, so [1,1] beats them all
    const top = branchesFor([1, 1], 'UR');
    expect(top.years.every((y) => y.aboveAllClosings === true)).toBe(true);
    expect(top.coverage === 'MATCHED' || top.coverage === 'PARTIAL').toBe(true);
    // beyond even the aspirational cap: the loosest close (44,418) x 1.75
    // = 77,731 — a range starting at 80,000 matches nothing anywhere
    const beyond = branchesFor([80000, 95000], 'UR');
    expect(beyond.coverage).toBe('BEYOND_LAST_CLOSING');
    expect(beyond.years.every((y) => y.counts.total === 0)).toBe(true);
  });

  it('the closing allottEE of a group sees their group as COMFORTABLE (self-consistency)', () => {
    const snap = store.loadIniCetCounselling('2025-07').data;
    const group = snap.rows.find(
      (r) => snap.courses[r[1]] === 'GENERAL MEDICINE'
        && snap.institutes[r[0]] === 'AIIMS NEW DELHI'
        && snap.category_enum[r[3]] === 'UR' && r[4] === 0
    );
    const result = branchesFor([group[5], group[5]], 'UR'); // closing rank of the group
    const block = result.years.find((y) => y.session === '2025-07');
    const row = Object.values(block.rows)
      .flat()
      .find((x) => x.institute === 'AIIMS NEW DELHI' && x.branch === 'GENERAL MEDICINE');
    expect(row).toBeDefined();
    expect(row.band).toBe('COMFORTABLE'); // best=worst=closing <= closing
  });

  it('full pipeline coherence: estimate → rank → branches (strategy-level)', () => {
    const { estimate, rank } = runEstimate([130, 140], 'OBC');
    const branches = ini.resolveBranches({
      validated: { exam: EXAMS.INI_CET, category: { value: 'OBC', pwd: false }, quota: 'INI', gts: [] },
      rank,
    });
    expect(branches.coverage === 'MATCHED' || branches.coverage === 'PARTIAL').toBe(true);
    expect(branches.category).toEqual({ value: 'OBC', pwd: false });
    // rank range resolved officially, then matched: in every matched session
    // the range's best end must sit at or above that session's last close
    expect(rank.bestRank).toBeLessThan(5000);
    const matched = branches.years.filter((y) => y.counts.total > 0);
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((y) => y.maxClosingRank >= rank.bestRank)).toBe(true);
  });
});

describe('INI-CET — product gate OPEN (M2 UI step)', () => {
  it('engine.predict produces the full INI-CET result end-to-end', () => {
    const engine = createPredictorEngine();
    const r = engine.predict({ exam: 'INI_CET', gts: gts(130, 140), category: 'UR' });
    expect(r.exam).toBe('INI_CET');
    expect(r.method.version).toBe('inicet-branch-p6.v1');
    expect(r.method.stage).toBe('BRANCHES');
    expect(r.method.datasetSnapshots.distribution).toBe('DS-INICET-DISTRIBUTION-202507-v1');
    expect(r.method.datasetSnapshots.counselling).toHaveLength(5);
    expect(r.input.quota).toBe('INI');
    expect(r.input.quotaLabel).toBe('Single INI counselling pool');
    expect(r.estimate.transfer.mode).toBe('TIER_3_CROWD_PRIOR_PRIMARY');
    expect(r.rank.session).toBe('2025-07');
    expect(r.branches.coverage === 'MATCHED' || r.branches.coverage === 'PARTIAL').toBe(true);
    expect(r.branches.dataCoverage.years).toEqual([202301, 202401, 202407, 202501, 202507]);
  });

  it('reserved categories get the UR-only-prior caution in the engine result (§9)', () => {
    const engine = createPredictorEngine();
    const r = engine.predict({ exam: 'INI_CET', gts: gts(135), category: 'OBC' });
    const codes = r.estimate.warnings.map((w) => w.code);
    expect(codes).toContain('CROWD_SOURCED_PRIOR');
    expect(codes).toContain('PRIOR_UR_ONLY');
  });

  it('rank-only INI-CET prediction (no category) surfaces CATEGORY_REQUIRED', () => {
    const engine = createPredictorEngine();
    const r = engine.predict({ exam: 'INI_CET', gts: gts(130) });
    expect(r.method.stage).toBe('RANK_RANGE');
    expect(r.branches.coverage).toBe('CATEGORY_REQUIRED');
  });

  it('NEET PG engine output is unchanged (method version, stages, branches)', () => {
    const engine = createPredictorEngine();
    const r = engine.predict({ exam: 'NEET_PG', gts: gts(120, 130), category: 'UR' });
    expect(r.method.version).toBe('neetpg-branch-p6.v1');
    expect(r.estimate.transfer.tiers).toEqual({ TIER_1: 2, TIER_2: 0 });
    expect(r.branches.coverage).toBe('MATCHED');
    // NEET PG counselling blocks carry NO session key (byte-identical contract)
    expect(r.branches.years.every((y) => y.session === undefined)).toBe(true);
    expect(r.branches.dataCoverage.years).toEqual([2024, 2025]);
  });
});
