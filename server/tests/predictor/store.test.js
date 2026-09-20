/**
 * Phase 3 unit tests — snapshot store: every committed file must SHA-256
 * verify against MANIFEST.json (runtime integrity, complementing the Phase 2
 * golden validator), and tampered/unlisted paths must fail loudly with the
 * DATA_INTEGRITY code instead of silently feeding predictions.
 */

const fs = require('fs');
const path = require('path');
const store = require('../../predictor/store');
const { PredictorError, CODES } = require('../../predictor/errors');

const manifest = JSON.parse(
  fs.readFileSync(path.join(store.STORE_ROOT, 'MANIFEST.json'), 'utf8')
);

describe('predictor snapshot store', () => {
  beforeAll(() => store.resetCache());
  afterAll(() => store.resetCache());

  it('lists exactly the Phase 2 + M2 files (7 NEET PG + 11 INI-CET + 1 prior)', () => {
    // alphabetical — mirrors Object.keys().sort()
    expect(Object.keys(manifest.file_hashes).sort()).toEqual([
      'counselling/ini-cet-2023-01/v1/closing-ranks.json',
      'counselling/ini-cet-2024-01/v1/closing-ranks.json',
      'counselling/ini-cet-2024-07/v1/closing-ranks.json',
      'counselling/ini-cet-2025-01/v1/closing-ranks.json',
      'counselling/ini-cet-2025-07/v1/closing-ranks.json',
      'counselling/neet-pg-2024/v1/closing-ranks.json',
      'counselling/neet-pg-2025/v1/closing-ranks.json',
      'dictionaries/v1/category.json',
      'dictionaries/v1/name-normalization.json',
      'dictionaries/v1/quota.json',
      'distribution/ini-cet-2021-07/v1/rank-percentile.json',
      'distribution/ini-cet-2022-01/v1/rank-percentile.json',
      'distribution/ini-cet-2023-07/v1/rank-percentile.json',
      'distribution/ini-cet-2024-01/v1/rank-percentile.json',
      'distribution/ini-cet-2025-01/v1/rank-percentile.json',
      'distribution/ini-cet-2025-07/v1/rank-percentile.json',
      'distribution/neet-pg-2025/v1/score-rank-bands.json',
      'golden/v1/goldens.json',
      'priors/inicet/v1/hazra-corrects-air.json',
    ]);
  });

  it('loads and hash-verifies every committed snapshot', () => {
    for (const relPath of Object.keys(manifest.file_hashes)) {
      const { snapshotId, data } = store.loadSnapshot(relPath);
      expect(data).toBeTruthy();
      if (relPath.startsWith('distribution/') || relPath.startsWith('counselling/') || relPath.startsWith('priors/')) {
        expect(typeof snapshotId).toBe('string');
      } else {
        // goldens and dictionaries carry version info, not snapshot ids
        expect(snapshotId).toBeNull();
      }
    }
  });

  it('exposes the NEET PG distribution with Phase 2 golden counts', () => {
    const { snapshotId, data } = store.loadNeetPgDistribution();
    expect(snapshotId).toBe('DS-NEETPG-DISTRIBUTION-2025-v1');
    expect(data.validation.total_rows).toBe(242493);
  });

  it('exposes both counselling snapshots with their golden group counts', () => {
    const c25 = store.loadNeetPgCounselling(2025);
    const c24 = store.loadNeetPgCounselling(2024);
    expect(c25.snapshotId).toBe('DS-NEETPG-COUNSELLING-2025-v1');
    expect(c25.data.rows).toHaveLength(23886);
    expect(c24.snapshotId).toBe('DS-NEETPG-COUNSELLING-2024-v1');
    expect(c24.data.rows).toHaveLength(21341);
  });

  it('fails with DATA_INTEGRITY when a hash does not match (tamper detection)', () => {
    store.resetCache(); // first load wins per process — verify from cold
    const relPath = 'dictionaries/v1/quota.json';
    const tampered = {
      file_hashes: { [relPath]: '0'.repeat(64) },
    };
    let err = null;
    try {
      store.loadSnapshot(relPath, tampered);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PredictorError);
    expect(err.code).toBe(CODES.DATA_INTEGRITY);
    expect(err.details.relPath).toBe(relPath);
  });

  it('fails with DATA_INTEGRITY for a path missing from the manifest', () => {
    let err = null;
    try {
      store.loadSnapshot('distribution/neet-pg-2026/v1/score-rank-bands.json');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PredictorError);
    expect(err.code).toBe(CODES.DATA_INTEGRITY);
  });
});
