/**
 * M2 Phase 1 — INI-CET snapshot store tests (official AIIMS data).
 *
 * Pins the hash-verified loaders + the structural contract Phase 5 (INI-CET
 * strategy) will consume: rank↔percentile rows per session, final-state
 * closing ranks per institute × specialty × seat-category × pwd, single
 * counselling pool, no separate-pool seats inside rows.
 */
const store = require('../../predictor/store');

const DIST_SESSIONS = ['2021-07', '2022-01', '2023-07', '2024-01', '2025-01', '2025-07'];
const COUNS_SESSIONS = ['2023-01', '2024-01', '2024-07', '2025-01', '2025-07'];

describe('INI-CET snapshot store (M2 Phase 1)', () => {
  it('loads every distribution session hash-verified with monotone percentiles', () => {
    for (const session of DIST_SESSIONS) {
      const { snapshotId, data } = store.loadIniCetDistribution(session);
      expect(snapshotId).toBe(`DS-INICET-DISTRIBUTION-${session.replace('-', '')}-v1`);
      expect(data.rows.length).toBeGreaterThan(25000);
      expect(data.rows[0]).toEqual([1, 100000000]); // rank 1 = 100.0 percentile
      // strictly increasing ranks; percentiles non-increasing (published rounded)
      for (let i = 1; i < data.rows.length; i += 1) {
        expect(data.rows[i][0]).toBeGreaterThan(data.rows[i - 1][0]);
        expect(data.rows[i][1]).toBeLessThanOrEqual(data.rows[i - 1][1]);
      }
      expect(data.provenance.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('resolves a mid-distribution percentile to the correct rank window (Phase 5 contract)', () => {
    const { data } = store.loadIniCetDistribution('2025-07');
    const rows = data.rows;
    // binary-search shape the strategy will use: first rank whose percentile
    // drops to or below a target sits in a deterministic position
    const target = 90000000; // 90.0 percentile
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid][1] >= target) lo = mid + 1;
      else hi = mid;
    }
    expect(rows[lo][1]).toBeLessThan(target);
    expect(rows[lo - 1][1]).toBeGreaterThanOrEqual(target);
    expect(lo).toBeGreaterThan(1000); // 90th percentile is well inside the list
  });

  it('loads every counselling session with FINAL-STATE groups and canonical enums', () => {
    for (const session of COUNS_SESSIONS) {
      const { snapshotId, data } = store.loadIniCetCounselling(session);
      expect(snapshotId).toBe(`DS-INICET-COUNSELLING-${session.replace('-', '')}-v1`);
      expect(data.quota_enum).toEqual(['INI']); // spec §3.6: single counselling pool
      expect(data.category_enum).toEqual(['UR', 'EWS', 'OBC', 'SC', 'ST']);
      expect(data.rows.length).toBeGreaterThan(700);
      for (const r of data.rows) {
        expect(r).toHaveLength(8);
        expect(r[0]).toBeGreaterThanOrEqual(0);
        expect(r[0]).toBeLessThan(data.institutes.length);
        expect(r[1]).toBeGreaterThanOrEqual(0);
        expect(r[1]).toBeLessThan(data.courses.length);
        expect(r[5]).toBeGreaterThanOrEqual(r[6]); // closing >= opening
        expect(r[7]).toBeGreaterThanOrEqual(1);
      }
      expect(data.load_stats.seats_by_pool.GENERAL).toBeGreaterThan(1500);
    }
  });

  it('keeps the 2025-07 official anchors (AIIMS ND GenMed UR closes at 4)', () => {
    const { data } = store.loadIniCetCounselling('2025-07');
    const row = data.rows.find(
      (r) => data.institutes[r[0]] === 'AIIMS NEW DELHI'
        && data.courses[r[1]] === 'GENERAL MEDICINE'
        && data.category_enum[r[3]] === 'UR'
        && r[4] === 0
    );
    expect(row).toBeDefined();
    expect(row[5]).toBe(4); // overall ranks 2-4 took AIIMS ND Medicine UR seats
    expect(row[6]).toBe(2);
    expect(row[7]).toBe(3);
  });

  it('is a hard failure to load a session the store does not carry', () => {
    expect(() => store.loadIniCetDistribution('2026-01')).toThrow(/not listed in MANIFEST/);
  });
});
