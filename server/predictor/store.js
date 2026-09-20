'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { dataIntegrity } = require('./errors');

/**
 * Read-only loader for the committed Phase 2 snapshot store
 * (server/predictor-data, MANIFEST.json-versioned — approved decision D1).
 *
 * Every file is SHA-256-verified against MANIFEST.json before it is parsed,
 * and the parsed object plus its snapshot id are returned together. Loads are
 * cached per process. This is the engine's only contact with the filesystem:
 * strategies receive injected data, which keeps them unit-testable and keeps
 * the prediction path free of silent data drift (a re-ingested or hand-edited
 * snapshot whose hash no longer matches the manifest fails loudly instead of
 * quietly changing predictions).
 */

const STORE_ROOT = path.join(__dirname, '..', 'predictor-data');

/** @type {Map<string, {snapshotId: string, data: object}>} keyed by manifest-relative path */
const cache = new Map();

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readManifest() {
  const file = path.join(STORE_ROOT, 'MANIFEST.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Verify one file against the manifest hash and return its parsed JSON.
 * @param {string} relPath manifest-relative path, forward slashes
 * @param {object} [manifest] pre-read manifest (tests); read from disk otherwise
 */
function loadSnapshot(relPath, manifest) {
  if (cache.has(relPath)) {
    return cache.get(relPath);
  }
  const man = manifest || readManifest();
  const expected = man.file_hashes && man.file_hashes[relPath];
  if (!expected) {
    throw dataIntegrity(`Snapshot '${relPath}' is not listed in MANIFEST.json.`, { relPath });
  }
  const abs = path.join(STORE_ROOT, ...relPath.split('/'));
  let buffer;
  try {
    buffer = fs.readFileSync(abs);
  } catch (err) {
    throw dataIntegrity(`Snapshot '${relPath}' could not be read: ${err.message}`, { relPath });
  }
  const actual = sha256(buffer);
  if (actual !== expected) {
    throw dataIntegrity(
      `Snapshot '${relPath}' failed its MANIFEST hash check (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…). Re-run scripts/phase2/validate_snapshots.py and re-ingest before predicting.`,
      { relPath, expected, actual }
    );
  }
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw dataIntegrity(`Snapshot '${relPath}' is not valid JSON: ${err.message}`, { relPath });
  }
  const entry = { snapshotId: data.snapshot_id || null, data };
  cache.set(relPath, entry);
  return entry;
}

/** NEET PG 2025 score↔rank distribution (the M1 anchor; config.EXAMS.NEET_PG.distribution). */
function loadNeetPgDistribution() {
  return loadSnapshot('distribution/neet-pg-2025/v1/score-rank-bands.json');
}

/**
 * Counselling closing-rank snapshot (consumed by Phase 6 branch matching;
 * exposed now so Phase 6 builds on the same verified loader).
 * @param {number} examYear 2024 | 2025
 */
function loadNeetPgCounselling(examYear) {
  return loadSnapshot(`counselling/neet-pg-${examYear}/v1/closing-ranks.json`);
}

/**
 * INI-CET snapshots (M2 Phase 1 data foundation — official AIIMS sources;
 * sessions are 'YYYY-MM'). Consumed by the Phase 5 INI-CET strategy; exposed
 * on the same hash-verified loader so no later code invents its own path.
 * @param {string} session e.g. '2025-07' ('YYYY-MM')
 */
function loadIniCetDistribution(session) {
  return loadSnapshot(`distribution/ini-cet-${session}/v1/rank-percentile.json`);
}

function loadIniCetCounselling(session) {
  return loadSnapshot(`counselling/ini-cet-${session}/v1/closing-ranks.json`);
}

/**
 * INI-CET crowd prior (corrects→AIR ladder, UR-only — the §9 weak-step
 * bridge; hash-verified like every other store file).
 */
function loadIniCetPrior() {
  return loadSnapshot('priors/inicet/v1/hazra-corrects-air.json');
}

/** Test hook: drop cached parses (hash failures stay rare-path only). */
function resetCache() {
  cache.clear();
}

module.exports = {
  STORE_ROOT,
  loadSnapshot,
  loadNeetPgDistribution,
  loadNeetPgCounselling,
  loadIniCetDistribution,
  loadIniCetCounselling,
  loadIniCetPrior,
  resetCache,
};
