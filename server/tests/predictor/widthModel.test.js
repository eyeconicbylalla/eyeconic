/**
 * Phase 3 unit tests — range-width model (spec §11):
 * 1 GT widest; more GTs → narrower toward a floor; dispersion widens;
 * bounded by MAX. Constants themselves are provisional (config.WIDTH_MODEL)
 * — these tests pin the SHAPE, not the numbers.
 */

const { halfWidthCorrects } = require('../../predictor/widthModel');
const { WIDTH_MODEL } = require('../../predictor/config');
const { mean } = require('../../predictor/aggregation');

const P = WIDTH_MODEL.params;

describe('width model — §11 required properties', () => {
  it('a single GT produces the widest base width', () => {
    expect(halfWidthCorrects({ n: 1, sd: 0 })).toBe(P.singleGtHalfWidthCorrects);
  });

  it('width strictly decreases as GTs are added (tight GTs), toward the floor', () => {
    let prev = Infinity;
    for (const n of [1, 2, 3, 5, 8, 16, 64, 1024]) {
      const w = halfWidthCorrects({ n, sd: 0 });
      expect(w).toBeLessThan(prev);
      expect(w).toBeGreaterThanOrEqual(P.floorHalfWidthCorrects);
      prev = w;
    }
    // deep n approaches the floor without reaching it
    expect(halfWidthCorrects({ n: 10 ** 8, sd: 0 })).toBeCloseTo(P.floorHalfWidthCorrects, 2);
  });

  it('a scattered GT set yields a wider range than a tight set with the same mean (§11 example)', () => {
    // §11's illustrative pair is (120/122/121) vs (90/140/115) — those two
    // sets do NOT share a mean (121 vs 115); equalizing the mean here keeps
    // the comparison about dispersion only, as §11 intends.
    const tight = [120, 122, 121];
    const scattered = [90, 151, 122];
    expect(mean(tight)).toBe(mean(scattered)); // both 121
    const wTight = halfWidthCorrects({ n: 3, sd: sdOf(tight) });
    const wScattered = halfWidthCorrects({ n: 3, sd: sdOf(scattered) });
    expect(wScattered).toBeGreaterThan(wTight);
  });

  it('never exceeds the guard cap, even with pathological dispersion', () => {
    expect(halfWidthCorrects({ n: 1, sd: 500 })).toBe(P.maxHalfWidthCorrects);
  });

  it('rejects invalid inputs', () => {
    expect(() => halfWidthCorrects({ n: 0, sd: 0 })).toThrow(TypeError);
    expect(() => halfWidthCorrects({ n: 2, sd: -1 })).toThrow(TypeError);
  });
});

/** sample sd, mirrored from aggregation for readability here */
function sdOf(values) {
  const m = mean(values);
  return Math.sqrt(
    values.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (values.length - 1)
  );
}
