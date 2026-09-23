/**
 * Desired Branch Predictor — Phase 2 composition tests
 * (docs/DESIRED_BRANCH_PREDICTOR.md §6.3–§6.4): closing ranks → required
 * score/marks → required GT corrects (ceil, D5), on the committed snapshots.
 *
 * The structural invariants asserted here are the Phase 2 done-when:
 *  - NEET PG: scoring the REQUIRED CORRECTS (integer, forward-mapped through
 *    the pattern) lands at a worst rank that clears the historical closing —
 *    the strict tie-band guarantee, end to end.
 *  - INI-CET: the inverse ladder round-trips and its bounded states fire
 *    exactly outside the ladder span — never extrapolated numbers.
 */

const {
  requiredCorrectsNeetPg,
  requiredCorrectsIniCet,
} = require('../../predictor/desiredBranch');
const { buildDistributionModel } = require('../../predictor/distributionModel');
const { buildPriorModel } = require('../../predictor/inicetTransfer');
const { buildCounsellingIndex } = require('../../predictor/branchMatching');
const { scoreForCorrects } = require('../../predictor/transfer');
const { buildPatternBridge } = require('../../predictor/patternBridge');
const { EXAMS, DESIRED_BRANCH } = require('../../predictor/config');
const store = require('../../predictor/store');

const distModel = buildDistributionModel(store.loadNeetPgDistribution().data);
const priorModel = buildPriorModel(store.loadIniCetPrior().data, EXAMS.INI_CET.pattern);
const neetIdx = [2024, 2025].map((y) => buildCounsellingIndex(store.loadNeetPgCounselling(y).data));
const iniIdx = ['2023-01', '2024-01', '2024-07', '2025-01', '2025-07', '2026-01'].map((s) =>
  buildCounsellingIndex(store.loadIniCetCounselling(s).data)
);

/**
 * NEET PG corrects targets live on the 180-question pattern; the official
 * distribution is 800-scale — every reverse resolution goes through the
 * fraction-parity bridge (never a raw cross-scale score comparison).
 */
const neetBridge = buildPatternBridge({
  pattern: EXAMS.NEET_PG.pattern,
  anchorPattern: EXAMS.NEET_PG.distribution.anchorPattern,
});
const neetResolve = (closingRanks, extra = {}) =>
  requiredCorrectsNeetPg({
    closingRanks,
    distModel,
    pattern: EXAMS.NEET_PG.pattern,
    bridge: neetBridge,
    ...extra,
  });

describe('requiredCorrectsNeetPg — composed reverse resolver (real distribution)', () => {
  it('goldens: closing → guaranteed anchor score → bridged 720-scale score → ceiled corrects', () => {
    const r = neetResolve([6, 13, 3000, 9511]);
    expect(r.stage).toBe('REQUIRED_CORRECTS');
    expect(r.rule).toBe(DESIRED_BRANCH.RULES.NEET_PG_REQUIRED);
    // Bridged targets: the 200-question-era score shrinks ×720/800 (fraction
    // parity) and the corrects inverse runs on the 180-question pattern —
    // corrects are NOT reused unchanged across question counts.
    expect(r.perClosing).toEqual([
      { closing: 6, score: 625.5, anchorScore: 695, corrects: 162, state: 'in-distribution', bounded: false },
      { closing: 13, score: 618.3, anchorScore: 687, corrects: 160, state: 'in-distribution', bounded: false },
      { closing: 3000, score: 540.9, anchorScore: 601, corrects: 145, state: 'in-distribution', bounded: false },
      { closing: 9511, score: 503.1, anchorScore: 559, corrects: 137, state: 'in-distribution', bounded: false },
    ]);
    expect(r.distribution.snapshotId).toBe('DS-NEETPG-DISTRIBUTION-2025-v1');
    expect(r.distribution.patternVersion).toBe('800-scale (+4/-1)');
    expect(r.distribution.bridge).toEqual({ id: 'fraction-parity-v1', patternVersion: '720-scale (+4/-1)' });
  });

  it('refuses to resolve across patterns without an explicit bridge (never silent mixing)', () => {
    expect(() =>
      requiredCorrectsNeetPg({ closingRanks: [100], distModel, pattern: EXAMS.NEET_PG.pattern })
    ).toThrow(/explicit pattern bridge is required/);
  });

  it('corrects are integers in pattern bounds and rise as the target tightens', () => {
    const closings = [50000, 9511, 3000, 100, 13, 6];
    const r = neetResolve(closings);
    for (const e of r.perClosing) {
      expect(Number.isInteger(e.corrects)).toBe(true);
      expect(e.corrects).toBeGreaterThanOrEqual(0);
      expect(e.corrects).toBeLessThanOrEqual(EXAMS.NEET_PG.pattern.totalQuestions);
    }
    const corrects = r.perClosing.map((e) => e.corrects);
    for (let i = 1; i < corrects.length; i += 1) {
      expect(corrects[i]).toBeGreaterThanOrEqual(corrects[i - 1]); // tighter closing ⇒ weakly more corrects
    }
  });

  it('above-distribution: a closing inside a multi-rank top band states no finite target', () => {
    // Unreachable on the committed 2025 snapshot (its top band is exactly
    // rank [1,1]) — exercised here with a synthetic top band spanning ranks
    // 1–5, where a closing of 3 cannot be guaranteed by ANY observed score.
    const synthetic = buildDistributionModel({
      snapshot_id: 'DS-TEST-TOPBAND',
      validation: { numeric_pairs: 6 },
      bands: { 10: [1, 5, 5], 9: [6, 6, 1] },
    });
    const r = requiredCorrectsNeetPg({ closingRanks: [3], distModel: synthetic, pattern: EXAMS.NEET_PG.pattern });
    const e = r.perClosing[0];
    expect(e).toMatchObject({ closing: 3, score: null, corrects: null, state: 'above-distribution', bounded: true });
    expect(e.note).toContain('10'); // best recorded score of the synthetic model
    // the band's own last rank still resolves on the synthetic model
    const r2 = requiredCorrectsNeetPg({ closingRanks: [5], distModel: synthetic, pattern: EXAMS.NEET_PG.pattern });
    expect(r2.perClosing[0]).toMatchObject({ closing: 5, score: 10, state: 'in-distribution' });
  });

  it('beyond the recorded field: bounded answer at the lowest observed score', () => {
    const r = neetResolve([999999]);
    const e = r.perClosing[0];
    // minScore −40 (800-scale) → bridged −36 (720-scale) → (−36+180)/5 → ceil = 29 corrects
    expect(e).toMatchObject({ score: -36, anchorScore: distModel.minScore, corrects: 29, state: 'in-distribution', bounded: true });
    expect(e.note).toContain('last recorded rank');
  });

  it('notes carry the cross-year mapping, bridge, and pattern assumptions', () => {
    const r = neetResolve([1000]);
    const all = r.notes.join(' ');
    expect(all).toContain('assumes comparable score↔rank mappings');
    expect(all).toContain('fraction-parity-v1');
    expect(all).toContain('all questions attempted');
    expect(all).toContain('Estimate based on historical data');
  });

  it('validates its inputs', () => {
    expect(() => requiredCorrectsNeetPg({ closingRanks: [], distModel, pattern: EXAMS.NEET_PG.pattern })).toThrow(TypeError);
    expect(() => requiredCorrectsNeetPg({ closingRanks: [0], distModel, pattern: EXAMS.NEET_PG.pattern })).toThrow(TypeError);
    expect(() => requiredCorrectsNeetPg({ closingRanks: [100], pattern: EXAMS.NEET_PG.pattern })).toThrow(TypeError);
  });

  it('END-TO-END guarantee over every AIQ-UR closing of both years: integer corrects clear the closing', () => {
    let checked = 0;
    for (const idx of neetIdx) {
      for (const row of idx.rows) {
        if (row.quota !== 'AIQ' || row.category !== 'UR' || row.pwd) continue;
        const e = neetResolve([row.closing]).perClosing[0];
        if (e.state === 'above-distribution') continue; // none in current data
        expect(e.state).toBe('in-distribution');
        // the guarantee proper: the integer 180-question corrects target,
        // forward-mapped through the pattern and bridged onto the 800-scale
        // distribution, lands at a worst rank that clears the historical closing
        const fwd = distModel.rankIntervalForScore(
          neetBridge.toAnchorScore(scoreForCorrects(e.corrects, EXAMS.NEET_PG.pattern))
        );
        expect(fwd.maxR).toBeLessThanOrEqual(row.closing);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(8000); // 8,637 today (both years' AIQ-UR groups)
  });
});

describe('requiredCorrectsIniCet — composed reverse resolver (crowd ladder)', () => {
  it('goldens inside the ladder: closing → marks → ceiled corrects', () => {
    const r = requiredCorrectsIniCet({
      closingRanks: [100, 224, 2910],
      priorModel,
      pattern: EXAMS.INI_CET.pattern,
    });
    expect(r.stage).toBe('REQUIRED_CORRECTS');
    expect(r.rule).toBe(DESIRED_BRANCH.RULES.INI_CET_REQUIRED);
    expect(r.perClosing).toEqual([
      { closing: 100, marks: 133.33, corrects: 150, state: 'in-ladder', bounded: false },
      { closing: 224, marks: 128.66, corrects: 147, state: 'in-ladder', bounded: false },
      { closing: 2910, marks: 111.18, corrects: 134, state: 'in-ladder', bounded: false },
    ]);
  });

  it('above-ladder: corrects null, best-rung context echoed (D7 bounded-above)', () => {
    const r = requiredCorrectsIniCet({ closingRanks: [4], priorModel, pattern: EXAMS.INI_CET.pattern });
    const e = r.perClosing[0];
    expect(e).toMatchObject({
      closing: 4, marks: null, corrects: null, state: 'above-ladder', bounded: true, ladderEndCorrects: 160,
    });
    expect(e.note).toContain('More than 160 corrects');
  });

  it('below-ladder: the floor rung’s corrects as a conservative target (D7 bounded-below)', () => {
    const r = requiredCorrectsIniCet({ closingRanks: [40000], priorModel, pattern: EXAMS.INI_CET.pattern });
    const e = r.perClosing[0];
    expect(e).toMatchObject({
      closing: 40000, marks: null, corrects: 110, state: 'below-ladder', bounded: true, ladderEndCorrects: 110,
    });
    expect(e.note).toContain('already cleared it');
  });

  it('echoes the crowd-sourced provenance and the UR-only caveat (§9 labelling)', () => {
    const r = requiredCorrectsIniCet({ closingRanks: [100], priorModel, pattern: EXAMS.INI_CET.pattern });
    expect(r.prior).toMatchObject({
      priorId: 'PR-INICET-HAZRA-CORRECTS-AIR-v1',
      urOnly: true,
      points: 7,
      correctsSpan: [110, 160],
    });
    expect(r.prior.provenance).toContain('load-bearing');
    const all = r.notes.join(' ');
    expect(all).toContain('never published INI-CET marks');
    expect(all).toContain('never extrapolated');
  });

  it('validates its inputs', () => {
    expect(() => requiredCorrectsIniCet({ closingRanks: [], priorModel, pattern: EXAMS.INI_CET.pattern })).toThrow(TypeError);
    expect(() => requiredCorrectsIniCet({ closingRanks: [-5], priorModel, pattern: EXAMS.INI_CET.pattern })).toThrow(TypeError);
    expect(() => requiredCorrectsIniCet({ closingRanks: [100], pattern: EXAMS.INI_CET.pattern })).toThrow(TypeError);
  });

  it('over every UR-nonPwD closing of all six sessions: states fire exactly at the ladder span', () => {
    let inLadder = 0;
    let above = 0;
    let below = 0;
    for (const idx of iniIdx) {
      for (const row of idx.rows) {
        if (row.category !== 'UR' || row.pwd) continue;
        const e = requiredCorrectsIniCet({
          closingRanks: [row.closing], priorModel, pattern: EXAMS.INI_CET.pattern,
        }).perClosing[0];
        if (e.state === 'in-ladder') {
          inLadder += 1;
          expect(e.corrects).toBeGreaterThanOrEqual(110);
          expect(e.corrects).toBeLessThanOrEqual(160);
          // display-rounded marks stay within the ladder span (± the 2dp
          // rounding step — e.g. the AIR-10 rung rounds 146.666… → 146.67)
          expect(e.marks).toBeGreaterThanOrEqual(priorModel.marksSpan[0] - 0.01);
          expect(e.marks).toBeLessThanOrEqual(priorModel.marksSpan[1] + 0.01);
        } else if (e.state === 'above-ladder') {
          above += 1;
          expect(row.closing).toBeLessThan(priorModel.airSpan[1]); // better than the best rung
          expect(e.corrects).toBeNull();
        } else {
          below += 1;
          expect(row.closing).toBeGreaterThan(priorModel.airSpan[0]); // beyond the floor rung
          expect(e.corrects).toBe(110);
        }
      }
    }
    expect(inLadder).toBeGreaterThan(1500); // the bulk of closings resolve numerically
    expect(above + below).toBeGreaterThan(0); // and the bounded states are exercised on real data
  });
});
