'use strict';

/**
 * P4 — Full-corpus rank-reproduction verification (re-runnable, read-only).
 *
 * Spec §18 Phase 4 done-when: "100% of a spot-check sample of official
 * score→rank pairs reproduce exactly". This script goes further: it runs
 * EVERY final-state mirror (score, rank) pair — the crockzo-derived,
 * Phase-2-verified corpus in data/normalized/2025-final-allotments.jsonl
 * (41,695 rows; crockzo was itself verified 66,348/66,349 against the
 * official NBEMS PDF in Phase 2) — through the ENGINE's distribution lookup.
 *
 * A pair reproduces exactly when the official rank falls inside the engine's
 * rank interval for that score. Expected exceptions: the documented crockzo
 * rank-143757 nearest-rank substitution (golden-pinned in Phase 2).
 *
 * The normalized layer is gitignored (re-downloadable per PROVENANCE.txt);
 * when absent the script reports a clean skip.
 *
 * Usage: node scripts/phase4/verify_rank_reproduction.js
 * Exit 0 = verified (or skipped); exit 1 = reproduction failures.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CORPUS = path.join(ROOT, 'data', 'normalized', '2025-final-allotments.jsonl');
const PREDICTOR = path.join(ROOT, 'server', 'predictor');

const { buildDistributionModel } = require(path.join(PREDICTOR, 'distributionModel.js'));
const store = require(path.join(PREDICTOR, 'store.js'));

const KNOWN_EXCEPTIONS = new Set([143757]); // crockzo README: nearest-rank substitution

function main() {
  if (!fs.existsSync(CORPUS)) {
    console.log('SKIP: data/normalized/2025-final-allotments.jsonl not present (gitignored; re-run Phase 2 ingestion to regenerate).');
    return 0;
  }
  const dist = buildDistributionModel(store.loadNeetPgDistribution().data);

  let total = 0;
  let exact = 0;
  const failures = [];
  const knownExceptionsHit = [];

  const lines = fs.readFileSync(CORPUS, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    const score = rec.score;
    const rank = rec.rank;
    if (!Number.isFinite(score) || !Number.isFinite(rank)) continue;
    total += 1;
    const iv = dist.rankIntervalForScore(score);
    if (iv.state) {
      failures.push({ score, rank, reason: `lookup returned state ${iv.state}` });
      continue;
    }
    if (rank >= iv.minR && rank <= iv.maxR) {
      exact += 1;
    } else if (KNOWN_EXCEPTIONS.has(rank)) {
      knownExceptionsHit.push({ score, rank, engine: [iv.minR, iv.maxR] });
    } else {
      failures.push({ score, rank, engine: [iv.minR, iv.maxR] });
    }
  }

  console.log('='.repeat(78));
  console.log('PHASE 4 RANK-REPRODUCTION VERIFICATION (engine lookup vs mirror corpus)');
  console.log('='.repeat(78));
  console.log(`pairs checked:      ${total}`);
  console.log(`reproduced exactly: ${exact}  (${((100 * exact) / total).toFixed(4)}%)`);
  console.log(`known exceptions:   ${knownExceptionsHit.length} ${knownExceptionsHit.map((e) => `(rank ${e.rank}: mirror score ${e.score} vs engine band ${e.engine})`).join(' ')}`);
  console.log(`failures:           ${failures.length}`);
  if (failures.length) {
    console.log('first failures:');
    for (const f of failures.slice(0, 10)) console.log(' ', JSON.stringify(f));
    console.log('\nRESULT: FAIL — a mismatch here is an ingestion bug, not a tolerance question.');
    return 1;
  }
  console.log('\nRESULT: PASS — every corpus pair reproduces exactly (spec §18 Phase 4 standard).');
  return 0;
}

process.exit(main());
