/**
 * Readiness Score — Phase 3 domain tests (docs/READINESS_SCORE.md §26
 * Phase 3, §22.3): the §22.3 matrix in full — state boundaries (G=0, G=B,
 * G=B+1), B=0 exam day, cap saturation, score-mode inverses incl. off-lattice
 * tolerance (R5), corrects=0, INI 200/200 guard, NEET 180/180, anchor
 * below/above ladder, determinism, method-block completeness, and the NEET
 * 180-question pin — plus the R9 crash-fix regression through the exact
 * Phase-0 repro path (engine.predict).
 *
 * Every derived literal below is grounded in the committed, hash-verified
 * store (anchors golden-pinned by Phase 1; required-corrects are the DBP
 * reverse resolvers' outputs on those ranks; budgets are the §9.4 arithmetic
 * on calendar days) — numbers were printed from the real data at phase time,
 * never invented. The calendar is exercised through its real frozen seeds
 * with injected `now`.
 */

const { computeReadiness } = require('../../predictor/readiness');
const { createPredictorEngine } = require('../../predictor');
const { EXAMS, READINESS } = require('../../predictor/config');
const { scoreForCorrects } = require('../../predictor/transfer');
const { CODES } = require('../../predictor/errors');

// Clocks (IST-civil-date anchors from the seeded calendar):
//   2026-09-26 → INI-CET next = 2026-11-01 (36 days), NEET PG next = 2027-08-15 (323 days, cap-saturating)
//   2027-07-10 → NEET PG next = 2027-08-15 (36 days, uncapped)
//   2026-11-01 → INI-CET exam day (daysRemaining 0)
const NOW_0926 = new Date('2026-09-26T04:00:00Z'); // 09:30 IST
const NOW_NEET36 = new Date('2027-07-10T04:00:00Z'); // 09:30 IST
const NOW_INI_EXAM_DAY = new Date('2026-11-01T04:00:00Z'); // 09:30 IST
const NOW_EXHAUSTED = new Date('2028-01-05T06:00:00Z');

// Phase-1 golden anchor ranks → DBP reverse-resolver outputs (printed from
// the committed store at Phase 3; NEET: 800-scale score bridged to 720 by
// fraction parity, then the exact inverse; INI: crowd-ladder ends).
const REQ = {
  NEET_PG: { QUALIFY: 86, ANY_SEAT: 66, STRONG: 160 },
  INI_CET: { ANY_SEAT: 110, STRONG: null }, // STRONG = above-ladder (open-ended)
};

function thrownBy(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
}

const gts = (exam, ...corrects) => ({ exam, gts: corrects.map((c) => ({ corrects: c })) });

describe('Readiness Score — Phase 3 domain (§10 pipeline)', () => {
  describe('state boundaries — exact ties (§10, §11)', () => {
    test('INI-CET at 36 days (B=5, req=110): G=0 ⇒ READY, G=B ⇒ MODERATELY_READY, G=B+1 ⇒ BARELY_READY', () => {
      const ready = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
      expect(ready.state).toBe('READY');
      expect(ready.gap).toMatchObject({
        requiredCorrects: 110,
        gapCorrects: 0,
        budget: 5,
        rate: 5,
        capped: false,
      });

      const moderate = computeReadiness(gts('INI_CET', 105), { now: NOW_0926 });
      expect(moderate.state).toBe('MODERATELY_READY');
      expect(moderate.gap.gapCorrects).toBe(5);
      expect(moderate.gap.budget).toBe(5);

      const barely = computeReadiness(gts('INI_CET', 104), { now: NOW_0926 });
      expect(barely.state).toBe('BARELY_READY');
      expect(barely.gap.gapCorrects).toBe(6); // B + 1
    });

    test('NEET PG at 36 days (B=7, req=66): same three exact ties', () => {
      const ready = computeReadiness(gts('NEET_PG', 66), { now: NOW_NEET36 });
      expect(ready.state).toBe('READY');
      expect(ready.gap).toMatchObject({ requiredCorrects: 66, gapCorrects: 0, budget: 7, rate: 6 });

      const moderate = computeReadiness(gts('NEET_PG', 59), { now: NOW_NEET36 });
      expect(moderate.state).toBe('MODERATELY_READY');
      expect(moderate.gap.gapCorrects).toBe(7);

      const barely = computeReadiness(gts('NEET_PG', 58), { now: NOW_NEET36 });
      expect(barely.state).toBe('BARELY_READY');
      expect(barely.gap.gapCorrects).toBe(8);
    });

    test('exam day: B=0 ⇒ binary READY/BARELY_READY, MODERATELY_READY unreachable (§10, §18.4)', () => {
      const ready = computeReadiness(gts('INI_CET', 110), { now: NOW_INI_EXAM_DAY });
      expect(ready.gap.budget).toBe(0);
      expect(ready.state).toBe('READY');

      const barely = computeReadiness(gts('INI_CET', 109), { now: NOW_INI_EXAM_DAY });
      expect(barely.gap.budget).toBe(0);
      expect(barely.gap.gapCorrects).toBe(1);
      expect(barely.state).toBe('BARELY_READY');
    });

    test('cap saturation: months > CAP ⇒ B = RATE × CAP exactly (§9.4, §18.4)', () => {
      // NEET at 2026-09-26: 323 days → 10.61 months → capped at 9 → B = 54.
      const r = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
      expect(r.gap).toMatchObject({ budget: 54, capped: true, monthsRemaining: 10.61, cappedMonths: 9 });
      expect(r.gap.budget).toBe(
        READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH.NEET_PG * READINESS.TIME_ALLOWANCE.CAP_MONTHS
      );
      // Exact-at-cap boundary: G = 54 ⇒ MODERATELY_READY, G = 55 ⇒ BARELY_READY.
      expect(computeReadiness(gts('NEET_PG', 12), { now: NOW_0926 }).state).toBe('MODERATELY_READY');
      expect(computeReadiness(gts('NEET_PG', 11), { now: NOW_0926 }).state).toBe('BARELY_READY');
    });

    test('SIGNIFICANT_GAP annotation is strictly G > 2×B (R4) — G = 2B does not annotate', () => {
      const at = computeReadiness(gts('INI_CET', 100), { now: NOW_0926 }); // G=10, 2B=10
      expect(at.gap.significantGap).toBe(false);
      expect(at.notes).not.toContain(READINESS.NOTES.SIGNIFICANT_GAP);
      const over = computeReadiness(gts('INI_CET', 99), { now: NOW_0926 }); // G=11 > 10
      expect(over.gap.significantGap).toBe(true);
      expect(over.notes).toContain(READINESS.NOTES.SIGNIFICANT_GAP);
    });
  });

  describe('score-mode inverses + off-lattice tolerance (R5, §5.3/§6.3)', () => {
    test('on-lattice scores convert exactly; NEET 415 ⇒ 119c, INI 100 ⇒ 125c, no off-lattice note', () => {
      const neet = computeReadiness({ exam: 'NEET_PG', score: { value: 415 } }, { now: NOW_0926 });
      expect(neet.input.scoreRows[0]).toMatchObject({ corrects: 119, onLattice: true, residueMarks: 0 });
      expect(neet.notes).not.toContain(READINESS.NOTES.SCORE_OFF_LATTICE);
      // Score mode and corrects mode produce the SAME standing for the same c̄.
      expect(neet.standing).toEqual(computeReadiness(gts('NEET_PG', 119), { now: NOW_0926 }).standing);

      const ini = computeReadiness({ exam: 'INI_CET', score: { value: 100 } }, { now: NOW_0926 });
      expect(ini.input.scoreRows[0]).toMatchObject({ corrects: 125, onLattice: true });
      expect(ini.notes).not.toContain(READINESS.NOTES.SCORE_OFF_LATTICE);
    });

    test('off-lattice scores are accepted, rounded to nearest corrects, and noted (437 ⇒ 123c)', () => {
      const neet = computeReadiness({ exam: 'NEET_PG', score: { value: 437 } }, { now: NOW_0926 });
      expect(neet.input.scoreRows[0]).toMatchObject({ corrects: 123, onLattice: false, residueMarks: 2 });
      expect(neet.notes).toContain(READINESS.NOTES.SCORE_OFF_LATTICE);

      const ini = computeReadiness({ exam: 'INI_CET', score: { value: 100.5 } }, { now: NOW_0926 });
      expect(ini.input.scoreRows[0]).toMatchObject({ corrects: 125, onLattice: false, residueMarks: 0.5 });
      expect(ini.notes).toContain(READINESS.NOTES.SCORE_OFF_LATTICE);
      // R5 strain note: under nearest-corrects rounding the residue cannot
      // exceed half a step, so the literal "> ±half-a-correct" condition is
      // unreachable through valid input — documented in the Phase 3 report.
      expect(neet.notes).not.toContain(READINESS.NOTES.NO_SKIP_ASSUMPTION_STRAINED);
      expect(ini.notes).not.toContain(READINESS.NOTES.NO_SKIP_ASSUMPTION_STRAINED);
    });

    test('multiple score rows aggregate by mean of converted corrects (§10 step 1)', () => {
      const r = computeReadiness(
        { exam: 'NEET_PG', score: [{ value: 415 }, { value: 445 }] }, // 119c, 125c
        { now: NOW_0926 }
      );
      expect(r.input.meanCorrects).toBe(122);
      expect(r.input.aggregation.n).toBe(2);
      expect(r.input.aggregation.values).toEqual([119, 125]);
    });

    test('score bounds are pattern-derived: NEET [−180, 720], INI [−200/3, 200] (§18.1)', () => {
      for (const value of [-181, 720.5]) {
        const err = thrownBy(() => computeReadiness({ exam: 'NEET_PG', score: { value } }, { now: NOW_0926 }));
        expect(err.code).toBe(CODES.SCORE_OUT_OF_RANGE);
        expect(err.details).toMatchObject({
          min: -(EXAMS.NEET_PG.pattern.negative * EXAMS.NEET_PG.pattern.totalQuestions),
          max: EXAMS.NEET_PG.pattern.maxMarks,
        });
      }
      for (const value of [-67, 200.1]) {
        const err = thrownBy(() => computeReadiness({ exam: 'INI_CET', score: { value } }, { now: NOW_0926 }));
        expect(err.code).toBe(CODES.SCORE_OUT_OF_RANGE);
        expect(err.details.min).toBeCloseTo(-(EXAMS.INI_CET.pattern.negative * EXAMS.INI_CET.pattern.totalQuestions), 10);
        expect(err.details.max).toBe(EXAMS.INI_CET.pattern.maxMarks);
      }
      // The exact bounds themselves stay resolvable.
      expect(computeReadiness({ exam: 'NEET_PG', score: { value: -180 } }, { now: NOW_0926 }).input.meanCorrects).toBe(0);
    });
  });

  describe('boundary/extreme performance inputs (§18.3)', () => {
    test('corrects = 0 is valid on both exams: floor standing, BARELY_READY + SIGNIFICANT_GAP', () => {
      // NEET clock at 36 days (B=7): G = 66 > 2×7 ⇒ significant. At NOW_0926
      // NEET is cap-saturated (B=54) and G=66 < 2×54 — correctly NOT significant.
      const neet = computeReadiness(gts('NEET_PG', 0), { now: NOW_NEET36 });
      expect(neet.state).toBe('BARELY_READY');
      expect(neet.gap.significantGap).toBe(true);
      expect(neet.standing.coverage).toBe('below-distribution');
      expect(computeReadiness(gts('NEET_PG', 0), { now: NOW_0926 }).gap.significantGap).toBe(false);

      const ini = computeReadiness(gts('INI_CET', 0), { now: NOW_0926 });
      expect(ini.state).toBe('BARELY_READY');
      expect(ini.gap.significantGap).toBe(true);
      expect(ini.standing.coverage).toBe('below-prior'); // R9 symmetric guard keeps this path crash-free
    });

    test('NEET 180/180: top band, READY with headroom note (§18.3)', () => {
      const r = computeReadiness(gts('NEET_PG', 180), { now: NOW_0926 });
      expect(r.state).toBe('READY');
      expect(r.gap.gapCorrects).toBe(-114);
      expect(r.standing.coverage).toBe('above-distribution');
      expect(r.standing.rank.bestRank).toBe(1);
      expect(r.notes).toContain(READINESS.NOTES.HEADROOM.replace('{headroom}', '114'));
    });

    test('INI 200/200: above-prior standing surfaces WITHOUT crashing (§18.3, R9)', () => {
      const r = computeReadiness(gts('INI_CET', 200), { now: NOW_0926 });
      expect(r.state).toBe('READY');
      expect(r.gap.gapCorrects).toBe(-90);
      expect(r.standing.coverage).toBe('above-prior');
      expect(r.standing.rank.rankRange[0]).toBe(1); // honest ladder-best-rung bound
      expect(r.standing.rank.rankRange[1]).toBe(10);
      expect(r.notes.some((n) => n.startsWith('You already clear the target bar'))).toBe(true);
    });

    test('fractional c̄ from a multi-GT mean keeps the documented display/decision split (§18.3)', () => {
      const r = computeReadiness(gts('INI_CET', 105, 106), { now: NOW_0926 }); // c̄ = 105.5 ⇒ G = 4.5 ≤ 5
      expect(r.input.meanCorrects).toBe(105.5);
      expect(r.gap.gapCorrects).toBe(4.5);
      expect(r.state).toBe('MODERATELY_READY');
      const s = computeReadiness(gts('INI_CET', 104, 105), { now: NOW_0926 }); // c̄ = 104.5 ⇒ G = 5.5 > 5
      expect(s.gap.gapCorrects).toBe(5.5);
      expect(s.state).toBe('BARELY_READY');
    });
  });

  describe('anchor ladder — golden ranks through the DBP reverse resolvers (§9.3, §18.5)', () => {
    test('NEET PG: QUALIFY 86c / ANY_SEAT 66c / STRONG 160c, all in-distribution, target = ANY_SEAT', () => {
      const r = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
      const byId = Object.fromEntries(r.anchors.map((a) => [a.id, a]));
      expect(byId.QUALIFY).toMatchObject({ rank: 115503, requiredCorrects: REQ.NEET_PG.QUALIFY, requiredState: 'in-distribution', role: 'context' });
      expect(byId.ANY_SEAT).toMatchObject({ rank: 182260, requiredCorrects: REQ.NEET_PG.ANY_SEAT, requiredState: 'in-distribution', role: 'default' });
      expect(byId.STRONG).toMatchObject({ rank: 13, requiredCorrects: REQ.NEET_PG.STRONG, requiredState: 'in-distribution', role: 'context' });
      expect(r.target).toMatchObject({ id: 'ANY_SEAT', rank: 182260, requiredCorrects: 66 });
      expect(typeof r.target.definition).toBe('string');
      expect(r.target.evidence).not.toBeNull();
    });

    test('INI-CET: ANY_SEAT below-ladder ⇒ conservative 110c floor + note; STRONG above-ladder ⇒ open-ended (§18.5)', () => {
      const r = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
      const byId = Object.fromEntries(r.anchors.map((a) => [a.id, a]));
      expect(byId.ANY_SEAT).toMatchObject({
        rank: 44418,
        requiredCorrects: 110,
        requiredState: 'below-ladder',
        bounded: true,
      });
      expect(byId.ANY_SEAT.note).toMatch(/beyond the crowd ladder's floor rung/i);
      expect(byId.STRONG).toMatchObject({
        rank: 4,
        requiredCorrects: null,
        requiredState: 'above-ladder',
        bounded: true,
        ladderEndCorrects: 160,
      });
      expect(byId.STRONG.note).toMatch(/ladder cannot resolve how many/i);
      // The open-ended CONTEXT anchor never breaks the default-target math.
      expect(r.target.id).toBe('ANY_SEAT');
      expect(r.gap.requiredCorrects).toBe(110);
    });

    test('ladder ordering: STRONG is the toughest anchor, ANY_SEAT the loosest (Phase-1 pin)', () => {
      for (const exam of ['NEET_PG', 'INI_CET']) {
        const r = computeReadiness(gts(exam, 1), { now: NOW_0926 });
        const ranks = r.anchors.map((a) => a.rank);
        expect(Math.min(...ranks)).toBeLessThan(Math.max(...ranks));
        expect(r.anchors.find((a) => a.id === 'STRONG').rank).toBeLessThan(
          r.anchors.find((a) => a.id === 'ANY_SEAT').rank
        );
      }
    });
  });

  describe('input validation — typed, field-scoped (§18.1, §19)', () => {
    test('exactly one input mode: both or neither ⇒ INPUT_MODE_CONFLICT', () => {
      const both = thrownBy(() =>
        computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: 100 }], score: { value: 400 } }, { now: NOW_0926 })
      );
      expect(both.code).toBe(CODES.INPUT_MODE_CONFLICT);
      const neither = thrownBy(() => computeReadiness({ exam: 'NEET_PG' }, { now: NOW_0926 }));
      expect(neither.code).toBe(CODES.INPUT_MODE_CONFLICT);
      // An empty-valued score object is "not valued" — gts alone is fine.
      expect(() => computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: 100 }], score: { value: null } }, { now: NOW_0926 })).not.toThrow();
    });

    test('corrects bounds are read from the pattern — never a literal (the 180-question pin)', () => {
      const err = thrownBy(() => computeReadiness(gts('NEET_PG', 181), { now: NOW_0926 }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details.field).toBe('gts[0].corrects');
      expect(err.message).toContain(String(EXAMS.NEET_PG.pattern.totalQuestions));
      expect(err.message).not.toContain('200');
      const ini = thrownBy(() => computeReadiness(gts('INI_CET', 201), { now: NOW_0926 }));
      expect(ini.message).toContain(String(EXAMS.INI_CET.pattern.totalQuestions));
    });

    test('junk corrects are rejected: decimals, negatives, text, NaN-shaped strings', () => {
      for (const bad of [119.5, -1, 'abc', '12x', Infinity, NaN]) {
        const err = thrownBy(() => computeReadiness(gts('NEET_PG', bad), { now: NOW_0926 }));
        expect(err.code).toBe(CODES.INVALID_INPUT);
        expect(err.details.field).toBe('gts[0].corrects');
      }
    });

    test('empty/whitespace rows are skipped; all-empty ⇒ INVALID_INPUT (predictor convention)', () => {
      const r = computeReadiness(
        { exam: 'NEET_PG', gts: [{ corrects: null }, { corrects: '  ' }, { corrects: 100 }] },
        { now: NOW_0926 }
      );
      expect(r.input.aggregation.n).toBe(1);
      const err = thrownBy(() => computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: '' }] }, { now: NOW_0926 }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(thrownBy(() => computeReadiness({ exam: 'NEET_PG', gts: [] }, { now: NOW_0926 })).code).toBe(
        CODES.INVALID_INPUT
      );
    });

    test('provenance, request shape, and exam go through the canonical errors', () => {
      expect(thrownBy(() => computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: 5, provenance: 'guessed' }] }, { now: NOW_0926 })).details.field).toBe('gts[0].provenance');
      expect(thrownBy(() => computeReadiness(null)).code).toBe(CODES.INVALID_INPUT);
      expect(thrownBy(() => computeReadiness('NEET_PG')).code).toBe(CODES.INVALID_INPUT);
      expect(thrownBy(() => computeReadiness(gts('FMGE', 100), { now: NOW_0926 })).code).toBe(CODES.INVALID_INPUT);
      expect(thrownBy(() => computeReadiness(gts('FMGE', 100), { now: NOW_0926 })).details.field).toBe('exam');
    });

    test('an explicit unknown/past session surfaces the calendar’s typed INVALID_INPUT (§18.1)', () => {
      const unknown = thrownBy(() =>
        computeReadiness(
          { exam: 'INI_CET', gts: [{ corrects: 110 }], session: '2020-01' },
          { now: NOW_0926 }
        )
      );
      expect(unknown.code).toBe(CODES.INVALID_INPUT);
      expect(unknown.details).toMatchObject({ field: 'session' });
    });
  });

  describe('calendar interaction (§7, §18.2, §18.4)', () => {
    test('explicit session (planning mode) drives the budget through the same rules (§7.2 rule 6)', () => {
      const r = computeReadiness({ exam: 'INI_CET', gts: [{ corrects: 110 }], session: '2027-07' }, { now: NOW_0926 });
      expect(r.calendar).toMatchObject({ session: '2027-07', examDate: '2027-05-16', daysRemaining: 232 });
      // 232 days = 7.62 months (< cap) ⇒ B = floor(5 × 7.62) = 38.
      expect(r.gap).toMatchObject({ budget: 38, capped: false });
    });

    test('horizon exhaustion passes the calendar’s NO_UPCOMING_EXAM through, typed (§18.2)', () => {
      const err = thrownBy(() => computeReadiness(gts('INI_CET', 110), { now: NOW_EXHAUSTED }));
      expect(err.code).toBe(CODES.NO_UPCOMING_EXAM);
    });

    test('daysRemaining is computed once, server-side, and stored in the record (§18.4)', () => {
      const r = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
      expect(r.calendar.daysRemaining).toBe(36);
      expect(r.gap.monthsRemaining).toBe(Math.round((36 / 30.44) * 100) / 100);
      expect(r.calendar.asOfIstDate).toBe('2026-09-26');
    });

    test('expected exam dates carry DATE_EXPECTED into the merged warnings (deduped) (§7.2 rule 3)', () => {
      const r = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 }); // NEET seed is 'expected'
      const codes = r.warnings.map((w) => w.code);
      expect(codes).toContain('DATE_EXPECTED');
      expect(codes).toContain('LOW_GT_COUNT'); // inherited, n = 1
      expect(codes).toContain('PROVISIONAL_WIDTHS'); // inherited
      expect(new Set(codes).size).toBe(codes.length); // dedup by code
      const ini = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 }); // announced seed
      expect(ini.warnings.map((w) => w.code)).not.toContain('DATE_EXPECTED');
      expect(ini.warnings.map((w) => w.code)).toContain('CROWD_SOURCED_PRIOR'); // always displayed for INI (§6.4)
    });
  });

  describe('method block completeness + determinism (FR-5, FR-10, §22.3)', () => {
    test('every version, rule id, and constant is echoed — hand-reconstructible', () => {
      for (const exam of ['NEET_PG', 'INI_CET']) {
        const r = computeReadiness(gts(exam, exam === 'NEET_PG' ? 66 : 110), { now: NOW_0926 });
        const expectedVersion = exam === 'NEET_PG' ? READINESS.METHOD_VERSION_NEET_PG : READINESS.METHOD_VERSION_INI_CET;
        expect(r.methodVersion).toBe(expectedVersion);
        expect(r.method).toMatchObject({
          version: expectedVersion,
          anchorSetRuleId: READINESS.ANCHOR_SET_RULE_ID,
          timeAllowanceRuleId: READINESS.TIME_ALLOWANCE_RULE_ID,
          defaultAnchor: READINESS.DEFAULT_ANCHOR,
          significantGapFactor: READINESS.SIGNIFICANT_GAP_FACTOR,
          daysPerMonth: 30.44,
          calendarVersion: r.calendar.calendarVersion,
          patternVersion: EXAMS[exam].patternVersion,
        });
        expect(r.method.timeAllowance).toEqual({
          provisional: true,
          rateCorrectsPerMonth: READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH[exam],
          capMonths: READINESS.TIME_ALLOWANCE.CAP_MONTHS,
          note: READINESS.TIME_ALLOWANCE.NOTE,
        });
        expect(r.method.pattern).toEqual({ ...EXAMS[exam].pattern });
        expect(r.method.aggregation.method).toBe('mean');
        expect(typeof r.method.inheritedForwardMethodVersion).toBe('string');
        expect(r.method.distribution.snapshotId).toMatch(/^DS-/);
      }
    });

    test('NEET 180-question pin: no readiness path reads any other question count (§5.3)', () => {
      const r = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
      expect(r.method.pattern.totalQuestions).toBe(EXAMS.NEET_PG.pattern.totalQuestions);
      expect(r.method.pattern.totalQuestions).toBe(180);
      expect(r.input.aggregation.values).toEqual([66]);
      // Exact pattern arithmetic on the 180/±4/1/720 pattern: score = 5c − 180.
      expect(r.standing.projectedScore).toBe(scoreForCorrects(66, EXAMS.NEET_PG.pattern));
      expect(r.standing.projectedScore).toBe(150);
      // Reverse-resolver targets live on the same pattern (anchor ranks → 720-scale corrects).
      expect(r.target.requiredCorrects).toBe(66);
    });

    test('determinism: identical (request, now) ⇒ byte-identical records', () => {
      const a = computeReadiness(gts('NEET_PG', 80, 82), { now: NOW_0926 });
      const b = computeReadiness(gts('NEET_PG', 80, 82), { now: NOW_0926 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a))).toEqual(a); // stored-record round-trip
    });

    test('inherited notes: NEET carries the pattern-bridge note; INI carries the UR caveat (§5.5, §6.5)', () => {
      const neet = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
      expect(neet.notes.some((n) => n.includes('pattern bridge fraction-parity-v1'))).toBe(true);
      expect(neet.notes).not.toContain(READINESS.NOTES.INI_UR_CAVEAT);
      const ini = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
      expect(ini.notes).toContain(READINESS.NOTES.INI_UR_CAVEAT);
      expect(ini.notes.some((n) => n.includes('fraction-parity'))).toBe(false);
      for (const r of [neet, ini]) {
        expect(r.notes).toContain(READINESS.TIME_ALLOWANCE.NOTE); // §9.4 sensitivity honesty, always
        expect(new Set(r.notes).size).toBe(r.notes.length); // dedup by exact string
      }
    });

    test('explanation strings follow §11 copy and the §8 display convention', () => {
      const neet = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
      expect(neet.explanation.stateLine).toBe(READINESS.NOTES.STATE_READY);
      expect(neet.explanation.timeRemainingText).toBe('10.6 months (323 days)');
      expect(neet.explanation.budgetArithmetic).toBe('9 months × 6 = 54 → 54 corrects (months capped)');
      const ini = computeReadiness(gts('INI_CET', 104), { now: NOW_0926 });
      expect(ini.explanation.stateLine).toBe(READINESS.NOTES.STATE_BARELY_READY);
      expect(ini.explanation.timeRemainingText).toBe('1.2 months (36 days)');
      expect(ini.explanation.budgetArithmetic).toBe('1.2 months × 5 = 5.9 → 5 corrects');
    });
  });
});

describe('Readiness Score — R9 crash-fix regression (§18.3, decision R9)', () => {
  const engine = createPredictorEngine();

  const iniPredict = (corrects) =>
    engine.predict({
      exam: 'INI_CET',
      gts: [
        {
          gtId: 'gt-fix',
          provenance: 'self-reported',
          attempts: [{ corrects, totalQuestions: EXAMS.INI_CET.pattern.totalQuestions, status: 'completed' }],
        },
      ],
    });

  test('the Phase-0 repro no longer crashes: single 200/200 GT ⇒ above-prior, honest ladder bound', () => {
    // At HEAD before R9 this threw PredictorError 'percentileForRank: invalid rank 0'.
    const p = iniPredict(200);
    expect(p.estimate.percentile.coverage).toBe('above-prior');
    expect(p.rank.rankRange[0]).toBe(1);
    expect(p.rank.rankRange[1]).toBe(10); // ladder best rung — worst plausible rank bound
    expect(p.rank.worstBeyondData).toBe(false);
  });

  test('symmetric case stays crash-free: very low corrects ⇒ below-prior, bounded by the ladder floor rung', () => {
    const p = iniPredict(20);
    expect(p.estimate.percentile.coverage).toBe('below-prior');
    expect(p.rank.bestRank).toBeGreaterThan(0);
    expect(p.rank.bestRank).toBeLessThanOrEqual(28000); // ladder floor rung bound
    expect(p.rank.worstRank).toBeNull();
  });

  test('control (previously working path) is unchanged: 150/200 ⇒ above-prior with a resolved worst rank', () => {
    const p = iniPredict(150);
    expect(p.estimate.percentile.coverage).toBe('above-prior');
    expect(p.rank.bestRank).toBe(1);
    expect(p.rank.worstRank).not.toBeNull();
    expect(p.rank.worstRank).toBeLessThan(28000);
  });
});
