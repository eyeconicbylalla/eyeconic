/**
 * Phase 6 unit tests — branch matching semantics (spec §12) on synthetic
 * cutoff fixtures (test inputs only — never stored as data, §4), plus edge
 * states and cross-year merging.
 */

const {
  buildCounsellingIndex,
  matchBranches,
  matchIndex,
  bandOf,
} = require('../../predictor/branchMatching');
const { BRANCH_BANDS } = require('../../predictor/config');

const MARGINS = { borderline: 0.35, aspirational: 0.75 };

/** Synthetic one-year index: 3 institutes × branches across closing ranks. */
function fixtureIndex(year = 2025) {
  return buildCounsellingIndex({
    snapshot_id: `DS-TEST-${year}`,
    exam_year: year,
    quota_enum: ['AIQ'],
    category_enum: ['UR'],
    institutes: ['Inst A', 'Inst B', 'Inst C', 'Inst D'],
    courses: ['MD Radiology', 'MS Surgery', 'MD Paediatrics'],
    rows: [
      // [inst, course, quota, cat, pwd, closing, opening, count]
      [0, 0, 0, 0, 0, 1000, 500, 3],   // CR 1000
      [1, 0, 0, 0, 0, 5000, 2000, 4],  // CR 5000
      [2, 0, 0, 0, 0, 20000, 8000, 5], // CR 20000
      [0, 1, 0, 0, 0, 100000, 40000, 6], // CR 100000
      [3, 2, 0, 0, 0, 150000, 60000, 2], // CR 150000
    ],
  });
}

describe('bandOf — §12 banding semantics (margins 0.35 / 0.75)', () => {
  it('COMFORTABLE: even the pessimistic end clears the closing rank', () => {
    expect(bandOf(4000, 4800, 5000, MARGINS)).toBe('COMFORTABLE');
    expect(bandOf(5000, 5000, 5000, MARGINS)).toBe('COMFORTABLE');
  });

  it('WITHIN_RANGE: closing sits inside the predicted range', () => {
    expect(bandOf(4000, 6000, 5000, MARGINS)).toBe('WITHIN_RANGE');
  });

  it('BORDERLINE: best is beyond the closing but within the drift margin', () => {
    expect(bandOf(6000, 7000, 5000, MARGINS)).toBe('BORDERLINE'); // 6000 ≤ 6750
    expect(bandOf(5000 * 1.35, 7000, 5000, MARGINS)).toBe('BORDERLINE'); // boundary inclusive
  });

  it('ASPIRATIONAL: beyond the drift margin, inside the extreme-tail cap', () => {
    expect(bandOf(7000, 8000, 5000, MARGINS)).toBe('ASPIRATIONAL'); // ≤ 8750
    expect(bandOf(5000 * 1.75, 9000, 5000, MARGINS)).toBe('ASPIRATIONAL');
  });

  it('excluded beyond the cap', () => {
    expect(bandOf(9000, 9500, 5000, MARGINS)).toBeNull(); // > 8750
  });

  it('Infinity ends (Phase 4 beyond-data) band conservatively', () => {
    expect(bandOf(Infinity, Infinity, 5000, MARGINS)).toBeNull();
    expect(bandOf(4000, Infinity, 5000, MARGINS)).toBe('WITHIN_RANGE'); // unbounded worst
  });
});

describe('matchIndex — filtering, rows, sorting', () => {
  it('bands rows for a mid range and sorts by closing rank within bands', () => {
    const result = matchIndex({
      index: fixtureIndex(),
      bestRank: 4500,
      worstRank: 5500,
      category: 'UR',
      pwd: false,
      quota: 'AIQ',
      margins: MARGINS,
    });
    expect(result.state).toBe('MATCHED');
    // CR 1000: best 4500 > 1750 cap → excluded.
    // CR 5000: closing sits inside [4500, 5500] → WITHIN_RANGE.
    // CR 20000/100000/150000: worst 5500 clears them → COMFORTABLE.
    expect(result.counts.WITHIN_RANGE).toBe(1);
    expect(result.counts.COMFORTABLE).toBe(3);
    expect(result.counts.ASPIRATIONAL).toBe(0);
    expect(result.counts.total).toBe(4);
    const closings = result.rows.WITHIN_RANGE.map((r) => r.closingRank);
    expect(closings).toEqual([5000]);
    expect(result.rows.COMFORTABLE.map((r) => r.closingRank)).toEqual([20000, 100000, 150000]);
    expect(result.rows.COMFORTABLE[0]).toMatchObject({
      institute: 'Inst C',
      branch: 'MD Radiology',
      closingRank: 20000,
      openingRank: 8000,
      year: 2025,
      round: 'final state (end of counselling)',
      category: 'UR',
      quota: 'AIQ',
      band: 'COMFORTABLE',
    });
  });

  it('respects category / quota / pwd filters and reports NO_DATA_FOR_FILTER', () => {
    const pwdOnly = buildCounsellingIndex({
      snapshot_id: 'DS-TEST-PWD',
      exam_year: 2025,
      quota_enum: ['AIQ'],
      category_enum: ['UR'],
      institutes: ['Inst A'],
      courses: ['MD Radiology'],
      rows: [[0, 0, 0, 0, 1, 900, 800, 1]],
    });
    const miss = matchIndex({
      index: pwdOnly, bestRank: 1, worstRank: 10, category: 'UR', pwd: false, quota: 'AIQ', margins: MARGINS,
    });
    expect(miss.state).toBe('NO_DATA_FOR_FILTER');
    const hit = matchIndex({
      index: pwdOnly, bestRank: 1, worstRank: 10, category: 'UR', pwd: true, quota: 'AIQ', margins: MARGINS,
    });
    expect(hit.state).toBe('MATCHED');
    expect(hit.counts.COMFORTABLE).toBe(1);
  });

  it('§12 states: above-all-closings and beyond-all-closings flags', () => {
    const top = matchIndex({
      index: fixtureIndex(), bestRank: 100, worstRank: 900,
      category: 'UR', pwd: false, quota: 'AIQ', margins: MARGINS,
    });
    expect(top.aboveAllClosings).toBe(true); // worst 900 < tightest CR 1000
    expect(top.beyondAllClosings).toBe(false);
    expect(top.counts.COMFORTABLE).toBe(5);

    const bottom = matchIndex({
      // 300k sits beyond every cap over the tightest closings (150k × 1.75 = 262.5k)
      index: fixtureIndex(), bestRank: 300000, worstRank: 320000,
      category: 'UR', pwd: false, quota: 'AIQ', margins: MARGINS,
    });
    expect(bottom.state).toBe('BEYOND_LAST_CLOSING');
    expect(bottom.counts.total).toBe(0);
    expect(bottom.beyondAllClosings).toBe(true);
    expect(bottom.maxClosingRank).toBe(150000);
  });
});

describe('matchBranches — cross-year merge and coverage states', () => {
  const rank = (bestRank, worstRank) => ({ bestRank, worstRank });

  it('merges both years with per-year rows and data coverage echo', () => {
    const result = matchBranches({
      indexes: [fixtureIndex(2024), fixtureIndex(2025)],
      rank: rank(4500, 5500),
      category: 'UR',
      pwd: false,
      quota: 'AIQ',
      margins: MARGINS,
    });
    expect(result.stage).toBe('BRANCHES');
    expect(result.coverage).toBe('MATCHED');
    expect(result.years).toHaveLength(2);
    expect(result.dataCoverage.years).toEqual([2024, 2025]);
    expect(result.dataCoverage.snapshotIds).toEqual(['DS-TEST-2024', 'DS-TEST-2025']);
    expect(result.dataCoverage.roundConvention).toMatch(/final state/);
    expect(result.dataCoverage.margins).toMatchObject({ borderline: 0.35, aspirational: 0.75 });
    for (const y of result.years) {
      for (const row of [...y.rows.COMFORTABLE, ...y.rows.WITHIN_RANGE]) {
        expect(row.year).toBe(y.year);
      }
    }
    expect(result.notes[0]).toMatch(/not a guarantee/i);
  });

  it('null rank ends (beyond distribution) mark PARTIAL when some rows still match', () => {
    const result = matchBranches({
      indexes: [fixtureIndex()],
      rank: rank(4500, null),
      category: 'UR',
      pwd: false,
      quota: 'AIQ',
      margins: MARGINS,
    });
    expect(result.coverage).toBe('PARTIAL');
    expect(result.counts ?? result.years[0].counts.COMFORTABLE).toBeDefined();
  });

  it('fully-below range yields BEYOND_LAST_CLOSING with explicit coverage', () => {
    const result = matchBranches({
      indexes: [fixtureIndex()],
      rank: rank(null, null),
      category: 'UR',
      pwd: false,
      quota: 'AIQ',
      margins: MARGINS,
    });
    expect(result.coverage).toBe('BEYOND_LAST_CLOSING');
  });

  it('no data for the filter at all yields NO_DATA_FOR_FILTER', () => {
    const empty = buildCounsellingIndex({
      snapshot_id: 'DS-TEST-EMPTY', exam_year: 2025,
      quota_enum: ['AIQ'], category_enum: ['UR'],
      institutes: [], courses: [], rows: [],
    });
    const result = matchBranches({
      indexes: [empty], rank: rank(100, 200),
      category: 'UR', pwd: false, quota: 'AIQ', margins: MARGINS,
    });
    expect(result.coverage).toBe('NO_DATA_FOR_FILTER');
  });

  it('defaults margins to the config-pinned, drift-grounded values', () => {
    const result = matchBranches({
      indexes: [fixtureIndex()], rank: rank(4500, 5500),
      category: 'UR', pwd: false, quota: 'AIQ',
    });
    expect(result.dataCoverage.margins.borderline).toBe(BRANCH_BANDS.BORDERLINE_MARGIN);
    expect(result.dataCoverage.margins.provisional).toBe(true);
    expect(result.dataCoverage.margins.evidence).toMatch(/compute_band_margins/);
  });
});
