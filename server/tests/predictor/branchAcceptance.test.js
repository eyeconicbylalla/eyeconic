/**
 * Phase 6 done-when acceptance (spec §18 Phase 6): "For ~50 sampled
 * historical allotments (rank + category + quota rows drawn from the imported
 * data), the actually allotted branch appears among the predicted
 * possibilities for that rank — and results carry year/round/category
 * context."
 *
 * In-repo version: the committed snapshots' groups ARE derived from actual
 * allotments (closing rank = the LAST rank actually allotted to that group in
 * the final state), so sampling groups and resolving at their closing rank
 * reproduces the acceptance without the gitignored normalized layer. The
 * stronger row-level check runs over that layer in
 * scripts/phase6/verify_allotment_recall.py (per-candidate rows).
 *
 * Point ranges [CR, CR] are test constructs used to probe the matcher
 * deterministically; served predictions always carry Phase 3–4 ranges.
 */

const { buildCounsellingIndex, matchBranches } = require('../../predictor/branchMatching');
const store = require('../../predictor/store');

const SAMPLE_SIZE = 50;

/** Deterministic sample of AIQ groups spread across the snapshot. */
function sampleGroups(snapshot, quota) {
  const index = buildCounsellingIndex(snapshot);
  const aiq = index.rows.filter((r) => r.quota === quota && !r.pwd);
  const stride = Math.max(1, Math.floor(aiq.length / SAMPLE_SIZE));
  const sample = [];
  for (let i = 0; i < aiq.length && sample.length < SAMPLE_SIZE; i += stride) {
    sample.push({ row: aiq[i], index });
  }
  return sample;
}

describe('Phase 6 done-when — sampled historical groups are recalled', () => {
  for (const year of [2024, 2025]) {
    it(`${year}: ${SAMPLE_SIZE} sampled AIQ groups appear as possibilities at their own closing rank`, () => {
      const snapshot = store.loadNeetPgCounselling(year).data;
      const sample = sampleGroups(snapshot, 'AIQ');
      expect(sample.length).toBeGreaterThanOrEqual(40); // ~50 per the done-when

      let recalled = 0;
      for (const { row, index } of sample) {
        // A student whose rank equals the group's closing rank — the last
        // candidate actually allotted there.
        const result = matchBranches({
          indexes: [index],
          rank: { bestRank: row.closing, worstRank: row.closing },
          category: row.category,
          pwd: false,
          quota: 'AIQ',
        });
        expect(result.coverage).toBe('MATCHED');
        const found = [...result.years[0].rows.COMFORTABLE, ...result.years[0].rows.WITHIN_RANGE].some(
          (r) =>
            r.institute === index.institutes[row.instituteIdx] &&
            r.branch === index.courses[row.courseIdx] &&
            r.closingRank === row.closing
        );
        if (found) recalled += 1;
        // Context on every row (year/round/category/quota) per §12:
        for (const bandRows of Object.values(result.years[0].rows)) {
          for (const r of bandRows) {
            expect(r.year).toBe(year);
            expect(r.round).toMatch(/final state/);
            expect(r.category).toBe(row.category);
            expect(r.quota).toBe('AIQ');
          }
        }
      }
      expect(recalled).toBe(sample.length); // 100% recall
    });

    it(`${year}: a rank 20% beyond the closing still shows the group as BORDERLINE (drift margin)`, () => {
      const snapshot = store.loadNeetPgCounselling(year).data;
      // CR ≥ 10 so the ×1.2 probe cannot round back onto the closing itself
      const sample = sampleGroups(snapshot, 'AIQ').filter((s) => s.row.closing >= 10).slice(0, 20);
      expect(sample.length).toBeGreaterThanOrEqual(15);
      for (const { row, index } of sample) {
        const probe = Math.round(row.closing * 1.2); // within the 0.35 margin
        const result = matchBranches({
          indexes: [index],
          rank: { bestRank: probe, worstRank: probe },
          category: row.category,
          pwd: false,
          quota: 'AIQ',
        });
        const found = result.years[0].rows.BORDERLINE.some(
          (r) =>
            r.institute === index.institutes[row.instituteIdx] &&
            r.branch === index.courses[row.courseIdx] &&
            r.closingRank === row.closing
        );
        expect(found).toBe(true);
      }
    });
  }

  it('pwd groups are matched for pwd students (small but real slice of the data)', () => {
    const snapshot = store.loadNeetPgCounselling(2025).data;
    const index = buildCounsellingIndex(snapshot);
    const pwdRows = index.rows.filter((r) => r.quota === 'AIQ' && r.pwd);
    expect(pwdRows.length).toBeGreaterThan(0);
    const row = pwdRows[0];
    const result = matchBranches({
      indexes: [index],
      rank: { bestRank: row.closing, worstRank: row.closing },
      category: row.category,
      pwd: true,
      quota: 'AIQ',
    });
    const found = Object.values(result.years[0].rows)
      .flat()
      .some((r) => r.institute === index.institutes[row.instituteIdx] && r.branch === index.courses[row.courseIdx]);
    expect(found).toBe(true);
  });
});
