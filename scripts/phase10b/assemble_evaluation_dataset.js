'use strict';

/**
 * P10b — Evaluation-dataset assembly CLI (spec §15/§18 Phase 10b, §16 gate).
 *
 * Joins every captured outcome to its stored prediction (GT history, method +
 * dataset snapshot versions, predicted ranges) and writes the paired dataset
 * Phase 11's calibration will consume, plus a readiness report against the
 * §16 gate (~100+ pairs before any fitting is worth discussing).
 *
 * Read-only against the database. The output contains consented self-reported
 * data and user ids, so it is written under data/ — which is gitignored — and
 * must never be committed or served.
 *
 * Usage:
 *   node scripts/phase10b/assemble_evaluation_dataset.js
 *     [--out <path>]   default data/evaluation/v1/pairs.json
 *     [--mongo-uri <uri>] override MONGO_URI (defaults to the server .env)
 *   (dry run) --no-write prints the readiness report only.
 *
 * Exit 0 = assembly ran (the gate may or may not be met — that is data
 * status, not an error); exit 1 = assembly itself failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server');

const argv = process.argv.slice(2);
const argValue = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const NO_WRITE = argv.includes('--no-write');
const OUT_PATH = path.resolve(ROOT, argValue('--out') || path.join('data', 'evaluation', 'v1', 'pairs.json'));

async function main() {
  // Load the server's .env (MONGO_URI) unless an explicit uri was passed.
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  const overrideUri = argValue('--mongo-uri');
  if (!overrideUri) require(path.join(SERVER, 'node_modules', 'dotenv')).config({ path: path.join(SERVER, '.env') });
  const uri = overrideUri || process.env.MONGO_URI;
  if (!uri) {
    console.error('FATAL: MONGO_URI is not set (server/.env or --mongo-uri).');
    return 1;
  }

  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  // Models + service resolve against the server tree (its own node_modules).
  require(path.join(SERVER, 'models', 'OutcomeCapture'));
  require(path.join(SERVER, 'models', 'Prediction'));
  const { assembleEvaluationDataset, CALIBRATION_GATE_PAIRS } = require(path.join(
    SERVER,
    'services',
    'evaluationDataset'
  ));

  const { meta, pairs } = await assembleEvaluationDataset();

  console.log('='.repeat(78));
  console.log('PHASE 10b EVALUATION-DATASET ASSEMBLY');
  console.log('='.repeat(78));
  console.log(`Assembled at   : ${meta.assembledAt.toISOString()}`);
  console.log(`Schema         : ${meta.schema}`);
  console.log(`Total pairs    : ${meta.totalPairs}`);
  console.log(
    `§16 gate       : ${meta.totalPairs}/${CALIBRATION_GATE_PAIRS} pairs — ${meta.calibrationGate.met ? 'MET' : 'NOT MET (keep capturing; no fitting yet)'}`
  );
  for (const [exam, c] of Object.entries(meta.byExam)) {
    console.log(`  ${exam.padEnd(8)} pairs=${c.pairs} rank=${c.withRank} pct=${c.withPercentile} score=${c.withScore} counselling=${c.withCounselling} linkageOk=${c.linkageMatches}`);
  }
  if (meta.orphans.length) {
    console.log(`Orphan outcomes (prediction no longer retrievable): ${meta.orphans.length}`);
    for (const o of meta.orphans.slice(0, 10)) console.log(`  outcome=${o.outcomeId} prediction=${o.predictionId}`);
  }
  for (const note of meta.notes) console.log(`· ${note}`);

  if (!NO_WRITE) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({ meta, pairs }, null, 2), 'utf8');
    console.log('-'.repeat(78));
    console.log(`Written: ${path.relative(ROOT, OUT_PATH)} (${pairs.length} pairs)`);
  } else {
    console.log('-'.repeat(78));
    console.log('Dry run (--no-write) — nothing written.');
  }

  await mongoose.connection.close().catch(() => {});
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('RESULT: FAIL — assembly error:', error && error.message);
    process.exit(1);
  });
