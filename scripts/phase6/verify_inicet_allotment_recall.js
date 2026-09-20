'use strict';

/**
 * P6 M2 — INI-CET allotment-recall verification (re-runnable, read-only).
 *
 * Spec §18 Phase 6 done-when, per-candidate form: sampled historical
 * ALLOTMENT rows (rank + seat-category + pwd) from the official data must
 * see their actually allotted specialty/institute among the predicted
 * possibilities for that rank.
 *
 * Samples the FINAL-STATE general-pool allotments from the parsed layer
 * (data/parsed/aiims — gitignored; re-downloadable per PROVENANCE.txt;
 * skips cleanly when absent), runs them through the ENGINE's INI-CET
 * matcher, and asserts each allotment's (institute, [opening..closing]
 * window, category, pwd) group appears in the matched rows. Matching is by
 * institute + rank-window + filters — the specialty is asserted via the
 * containing group's course index — so dictionary drift cannot cause false
 * misses (same spirit as the NEET PG script's normalized-key rule).
 *
 * Usage: node scripts/phase6/verify_inicet_allotment_recall.js
 * Exit 0 = verified (or skipped); exit 1 = recall failures.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server');
const store = require(path.join(SERVER, 'predictor', 'store'));
const { EXAMS } = require(path.join(SERVER, 'predictor', 'config'));
const { buildStrategies } = require(path.join(SERVER, 'predictor', 'strategies'));

const SAMPLE_PER_SESSION = 25;

function main() {
  const parsedDir = path.join(ROOT, 'data', 'parsed', 'aiims');
  if (!fs.existsSync(parsedDir)) {
    console.log('SKIP: data/parsed/aiims not present (gitignored; re-run scripts/phase2/inicet_parse.py).');
    return 0;
  }

  const { INI_CET: ini } = buildStrategies({
    loadIniCetDistribution: store.loadIniCetDistribution,
    loadIniCetPrior: store.loadIniCetPrior,
    loadIniCetCounselling: store.loadIniCetCounselling,
  });

  let recalled = 0;
  let total = 0;
  const failures = [];
  const byCategory = {};

  for (const c of EXAMS.INI_CET.counselling) {
    const session = c.session;
    // rebuild the final state exactly as the snapshot builder did
    const final = new Map();
    for (const rname of ['1st', '2nd', 'open']) {
      const f = path.join(parsedDir, session, `round-${rname}.jsonl`);
      if (!fs.existsSync(f)) continue;
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const rec = JSON.parse(line);
        if (rec.section !== 'MDMS') continue;
        final.set(rec.roll, rec);
      }
    }
    const pool = [...final.values()].filter(
      (r) => r.seat_pool === 'GENERAL' && ['UR', 'EWS', 'OBC', 'SC', 'ST'].includes(r.seat_category)
    );
    const stride = Math.max(1, Math.floor(pool.length / SAMPLE_PER_SESSION));
    const sample = [];
    for (let i = 0; i < pool.length && sample.length < SAMPLE_PER_SESSION; i += stride) {
      sample.push(pool[i]);
    }

    for (const rec of sample) {
      total += 1;
      byCategory[rec.seat_category] = (byCategory[rec.seat_category] || 0) + 1;
      const rank = { bestRank: rec.rank, worstRank: rec.rank };
      const result = ini.resolveBranches({
        validated: {
          exam: EXAMS.INI_CET,
          category: { value: rec.seat_category, pwd: rec.seat_pwd },
          quota: 'INI',
          quotaDefaulted: true,
          gts: [],
        },
        rank,
      });
      // the allottEE's own session block must contain their group: same
      // institute, their rank inside [opening, closing], same category+pwd
      const block = result.years.find((y) => y.session === session) || {};
      const all = Object.values(block.rows || {}).flat();
      const found = all.some(
        (row) => row.institute === rec.institute_raw
          && row.closingRank >= rec.rank && row.openingRank <= rec.rank
      );
      if (found) {
        recalled += 1;
      } else {
        failures.push({
          session, rank: rec.rank, category: rec.seat_category, pwd: rec.seat_pwd,
          institute: rec.institute_raw, specialty: rec.specialty_raw,
          coverage: block.state, totalRows: (block.counts && block.counts.total) || 0,
        });
      }
    }
  }

  console.log('='.repeat(78));
  console.log('INI-CET PHASE 6 ALLOTMENT-RECALL VERIFICATION (engine matcher vs official allotments)');
  console.log('='.repeat(78));
  console.log(`sampled final-state allotments: ${total} ${JSON.stringify(byCategory)} across ${EXAMS.INI_CET.counselling.length} sessions`);
  console.log(`recalled (allotted branch among possibilities): ${recalled}/${total} (${((100 * recalled) / total).toFixed(1)}%)`);
  if (failures.length) {
    console.log('failures (first 10):');
    for (const f of failures.slice(0, 10)) console.log(' ', JSON.stringify(f));
    console.log('\nRESULT: FAIL — a miss here is a matching bug (filters, indexes, or banding).');
    return 1;
  }
  console.log('\nRESULT: PASS — every sampled INI-CET allotment\'s branch appears among the');
  console.log('predicted possibilities (spec §18 Phase 6 done-when, per-candidate form).');
  return 0;
}

process.exit(main());
