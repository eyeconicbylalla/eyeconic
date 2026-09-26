/**
 * Readiness Score — Phase 1 anchor tests (docs/READINESS_SCORE.md §26
 * Phase 1, §22.2): the derived target anchors are golden-pinned against the
 * committed snapshot store, cross-checked against independent Desired Branch
 * Predictor goldens, and their ladder ordering + config contract are pinned.
 *
 * The snapshots are hash-verified by the store, so any golden change must
 * come from a re-verified source (same discipline as the desiredBranch and
 * branchAcceptance suites) — never from editing numbers to make a test pass.
 */

const { deriveReadinessAnchors } = require('../../predictor/readinessAnchors');
const { READINESS } = require('../../predictor/config');
const golden = require('./readinessAnchors.golden.json');

describe('Readiness Score — Phase 1 anchors', () => {
  const derived = deriveReadinessAnchors();

  test('golden pin: full deterministic derivation matches the committed golden', () => {
    expect(derived).toEqual(golden.anchors);
  });

  test('golden pin: anchor ranks and rule id', () => {
    expect(golden.anchorSetRuleId).toBe(READINESS.ANCHOR_SET_RULE_ID);
    expect(derived.NEET_PG.QUALIFY.rank).toBe(115503);
    expect(derived.NEET_PG.ANY_SEAT.rank).toBe(182260);
    expect(derived.NEET_PG.STRONG.rank).toBe(13);
    expect(derived.INI_CET.ANY_SEAT.rank).toBe(44418);
    expect(derived.INI_CET.STRONG.rank).toBe(4);
  });

  test('cross-check vs independent DBP goldens (tight ends of the GenMed UR spans)', () => {
    // DBP Phase 1 goldens: NEET PG GenMed UR 2025 span [13, 9511];
    // INI-CET GenMed UR across sessions span [4, 2910]. The readiness STRONG
    // anchors are exactly those tight ends — an independent derivation path
    // agreeing on the same official data.
    expect(derived.NEET_PG.STRONG.rank).toBe(13);
    expect(derived.INI_CET.STRONG.rank).toBe(4);
    expect(derived.NEET_PG.STRONG.evidence.courseVariantsMatched).toEqual(['M.D. (GENERAL MEDICINE)']);
    expect(derived.INI_CET.STRONG.evidence.holder.institute).toBe('AIIMS NEW DELHI');
  });

  test('QUALIFY: the qualifying-score band straddles the pinned 50th percentile', () => {
    const q = derived.NEET_PG.QUALIFY;
    expect(q.band.minRank).toBeLessThanOrEqual(115048); // 230,096 × (1 − 0.50)
    expect(q.band.maxRank).toBeGreaterThanOrEqual(115048);
    expect(q.crossCheck.bandStraddles50thPercentile).toBe(true);
    expect(q.rank).toBe(q.band.maxRank); // anchor = worst rank still scoring 276
  });

  test('INI-CET ANY_SEAT: trailing-4 window, per-session maxima, deepest session recorded', () => {
    const a = derived.INI_CET.ANY_SEAT;
    expect(a.evidence.sessionsScanned).toEqual(['2024-07', '2025-01', '2025-07', '2026-01']);
    const perSession = Object.fromEntries(a.evidence.perSessionMax.map((p) => [p.session, p.rank]));
    expect(Math.max(...Object.values(perSession))).toBe(a.rank);
    expect(a.evidence.holderSession).toBe('2025-07');
  });

  test('ladder ordering: STRONG is the toughest anchor, ANY_SEAT the loosest', () => {
    expect(derived.NEET_PG.STRONG.rank).toBeLessThan(derived.NEET_PG.QUALIFY.rank);
    expect(derived.NEET_PG.QUALIFY.rank).toBeLessThan(derived.NEET_PG.ANY_SEAT.rank);
    expect(derived.INI_CET.STRONG.rank).toBeLessThan(derived.INI_CET.ANY_SEAT.rank);
  });

  test('config contract (R1/R3): default anchor, roles, provisional time allowance', () => {
    expect(READINESS.DEFAULT_ANCHOR).toBe('ANY_SEAT');
    for (const exam of ['NEET_PG', 'INI_CET']) {
      const roles = READINESS.ANCHORS[exam].map((a) => `${a.id}:${a.role}`);
      expect(roles).toContain(`ANY_SEAT:default`);
      expect(READINESS.ANCHORS[exam].filter((a) => a.role === 'default')).toHaveLength(1);
    }
    // R3 condition: rates are marked provisional and echo-ready, never facts.
    expect(READINESS.TIME_ALLOWANCE.provisional).toBe(true);
    expect(READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH.NEET_PG).toBe(6);
    expect(READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH.INI_CET).toBe(5);
    expect(READINESS.TIME_ALLOWANCE.CAP_MONTHS).toBe(9);
    expect(READINESS.TIME_ALLOWANCE.NOTE).toMatch(/rule of thumb/i);
  });

  test('determinism: repeated derivation is byte-identical', () => {
    expect(deriveReadinessAnchors()).toEqual(derived);
  });

  test('anchor ladder is Phase-3-consumable: every anchor carries a definition + serializable source', () => {
    for (const exam of ['NEET_PG', 'INI_CET']) {
      for (const anchor of Object.values(derived[exam])) {
        expect(typeof anchor.definition).toBe('string');
        expect(anchor.source.kind).toMatch(/^(distribution|counselling)$/);
        expect(Number.isInteger(anchor.rank)).toBe(true);
        expect(anchor.rank).toBeGreaterThan(0);
        expect(() => JSON.stringify(anchor)).not.toThrow();
      }
    }
  });
});
