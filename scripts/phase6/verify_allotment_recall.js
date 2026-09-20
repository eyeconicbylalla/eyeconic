'use strict';

/**
 * P6 — Allotment-recall verification (re-runnable, read-only).
 *
 * Spec §18 Phase 6 done-when, per-candidate form: sampled historical
 * ALLOTMENT rows (rank + category + quota) from the imported data must see
 * their actually allotted branch among the predicted possibilities.
 *
 * Runs the ENGINE's matcher over ~100 AIQ allotment rows sampled from the
 * gitignored normalized layer (re-downloadable per PROVENANCE.txt; skips
 * cleanly when absent). Matching is by normalized (institute, course) key —
 * the M1 join key — so MCC string variants cannot cause false misses.
 *
 * Usage: node scripts/phase6/verify_allotment_recall.js
 * Exit 0 = verified (or skipped); exit 1 = recall failures.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PREDICTOR = path.join(ROOT, 'server', 'predictor');
const { buildCounsellingIndex, matchBranches } = require(path.join(PREDICTOR, 'branchMatching.js'));
const store = require(path.join(PREDICTOR, 'store.js'));

const SAMPLE_SIZE = 100;

function normKey(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function main() {
  const corpus = path.join(ROOT, 'data', 'normalized', '2025-final-allotments.jsonl');
  if (!fs.existsSync(corpus)) {
    console.log('SKIP: data/normalized/2025-final-allotments.jsonl not present (gitignored; re-run Phase 2 ingestion to regenerate).');
    return 0;
  }

  // AIQ rows only — the MVP quota scope (§3.6).
  const rows = [];
  for (const line of fs.readFileSync(corpus, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (rec.quarantine_reasons) continue;
    if (rec.quota !== 'AIQ') continue;
    rows.push(rec);
  }
  const stride = Math.max(1, Math.floor(rows.length / SAMPLE_SIZE));
  const sample = [];
  for (let i = 0; i < rows.length && sample.length < SAMPLE_SIZE; i += stride) {
    sample.push(rows[i]);
  }

  const index = buildCounsellingIndex(store.loadNeetPgCounselling(2025).data);
  let recalled = 0;
  const failures = [];
  const byCategory = {};

  for (const rec of sample) {
    byCategory[rec.allotted_category] = (byCategory[rec.allotted_category] || 0) + 1;
    const result = matchBranches({
      indexes: [index],
      rank: { bestRank: rec.rank, worstRank: rec.rank },
      category: rec.allotted_category,
      pwd: !!rec.allotted_pwd,
      quota: 'AIQ',
    });
    const all = Object.values(result.years[0].rows).flat();
    const found = all.some(
      (r) => normKey(r.institute) === rec.institute_key && normKey(r.branch) === rec.course_key
    );
    if (found) {
      recalled += 1;
    } else {
      failures.push({
        rank: rec.rank,
        category: rec.allotted_category,
        pwd: rec.allotted_pwd,
        institute: rec.institute_raw,
        course: rec.course_raw,
        coverage: result.coverage,
        totalRows: result.years[0].counts.total,
      });
    }
  }

  console.log('='.repeat(78));
  console.log('PHASE 6 ALLOTMENT-RECALL VERIFICATION (engine matcher vs 2025 allotments)');
  console.log('='.repeat(78));
  console.log(`sampled AIQ allotment rows: ${sample.length} ${JSON.stringify(byCategory)}`);
  console.log(`recalled (allotted branch among possibilities): ${recalled}/${sample.length} (${((100 * recalled) / sample.length).toFixed(1)}%)`);
  if (failures.length) {
    console.log('failures (first 10):');
    for (const f of failures.slice(0, 10)) console.log(' ', JSON.stringify(f));
    console.log('\nRESULT: FAIL — a miss here is a matching bug (keys, filters, or banding).');
    return 1;
  }
  console.log('\nRESULT: PASS — every sampled allotment’s branch appears among the predicted');
  console.log('possibilities (spec §18 Phase 6 done-when, per-candidate form).');
  return 0;
}

process.exit(main());
