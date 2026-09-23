/**
 * Pattern bridge unit tests (2026-09-24 NEET PG 180Q/720 migration).
 *
 * The bridge is the ONLY sanctioned way to compare a 720-scale score with the
 * 2025 800-scale official distribution: fraction-of-max-marks parity, which
 * under identical +4/−1 marking is exactly fraction-of-corrects parity (the
 * Tier-1 transfer assumption expressed pattern-independently).
 */

const { buildPatternBridge, BRIDGE_ID } = require('../../predictor/patternBridge');
const { EXAMS } = require('../../predictor/config');

const P720 = { totalQuestions: 180, positive: 4, negative: 1, maxMarks: 720, version: '720-scale (+4/-1)' };
const P800 = { totalQuestions: 200, positive: 4, negative: 1, maxMarks: 800, version: '800-scale (+4/-1)' };

describe('buildPatternBridge', () => {
  it('returns null for the same scale (identity — no provenance noise)', () => {
    expect(buildPatternBridge({ pattern: P800, anchorPattern: P800 })).toBeNull();
    expect(
      buildPatternBridge({ pattern: EXAMS.INI_CET.pattern, anchorPattern: { ...EXAMS.INI_CET.pattern } })
    ).toBeNull();
  });

  it('720 ↔ 800: linear with exact endpoints and exact round-trip', () => {
    const b = buildPatternBridge({ pattern: P720, anchorPattern: P800 });
    expect(b.id).toBe(BRIDGE_ID);
    expect(b.patternVersion).toBe('720-scale (+4/-1)');
    expect(b.anchorPatternVersion).toBe('800-scale (+4/-1)');
    expect(b.toAnchorScore(720)).toBe(800);
    expect(b.toAnchorScore(0)).toBe(0);
    expect(b.toAnchorScore(-180)).toBe(-200); // pattern floor ↔ anchor floor
    expect(b.toPatternScore(800)).toBe(720);
    // corrects-parity identity: 162/180 = 0.9 fraction ⇔ anchor 700
    expect(b.toAnchorScore(630)).toBe(700);
    expect(b.toPatternScore(700)).toBe(630);
    // representative values round-trip exactly (integer multiply-then-divide)
    for (const s of [0, 90, 180, 360, 630, 720]) {
      expect(b.toPatternScore(b.toAnchorScore(s))).toBe(s);
    }
  });

  it('fraction parity ≡ corrects parity under identical marking', () => {
    const b = buildPatternBridge({ pattern: P720, anchorPattern: P800 });
    // same corrects fraction on both patterns ⇒ bridged score has the same
    // marks fraction: score/maxMarks = (5f − 1)/4 independent of question count
    for (const f of [1, 0.9, 0.75, 0.5, 0]) {
      const s720 = 720 * (5 * f - 1) / 4;
      const s800 = 800 * (5 * f - 1) / 4;
      expect(b.toAnchorScore(s720)).toBeCloseTo(s800, 9);
    }
  });

  it('refuses to bridge across DIFFERENT marking schemes (parity would be invalid)', () => {
    const p200oneThird = { totalQuestions: 200, positive: 1, negative: 1 / 3, maxMarks: 200, version: '200 marks (+1/-1/3)' };
    expect(() => buildPatternBridge({ pattern: P720, anchorPattern: p200oneThird })).toThrow(
      /differ in marking scheme/
    );
  });
});
