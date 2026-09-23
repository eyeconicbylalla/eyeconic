'use strict';

/**
 * P9 — Prediction-persistence verification (re-runnable, self-contained).
 *
 * Spec §18 Phase 9 done-when: "Predictions are persisted and reproducible
 * (method version + dataset snapshot + inputs retrievable)" — and the phase's
 * core guarantee: no prediction is served without being stored.
 *
 * Boots the REAL app (server/server.js) against a throwaway in-memory Mongo,
 * mints a valid App session cookie (no App API needed for these endpoints),
 * and exercises the served-prediction lifecycle end to end:
 *
 *   1. POST /predict            → 201 + persisted + predictionId
 *   2. stored document          → complete §18 Phase 9 field set (direct read)
 *   3. GET /predictions         → the student's history lists it
 *   4. GET /predictions/:id     → integrity hash matches; request + method
 *                                  version + dataset snapshots retrievable
 *   5. GET /predictions/:id/branches → rows re-derive and VERIFY vs storage
 *   6. rank-only prediction     → persisted too (CATEGORY_REQUIRED state)
 *
 * The write-failure path (no serve without store) is pinned by
 * server/tests/predictorApi.test.js, where Prediction.create can be faulted
 * cleanly; this script verifies the same invariant from its observable side.
 *
 * Usage: node scripts/phase9/verify_prediction_persistence.js
 * Exit 0 = verified; exit 1 = any check failed.
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server');

// The repo has no root package.json — resolve the server's dev dependencies
// (supertest, mongodb-memory-server) by absolute path from server/node_modules.
const dep = (name) => require(path.join(SERVER, 'node_modules', name));

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'p'.repeat(40);
  process.env.SESSION_SECRET = 'q'.repeat(40);
  process.env.APP_INTEGRATION_TOKEN = 't'.repeat(43);
  process.env.APP_API_BASE_URL = 'http://127.0.0.1:9'; // unused by these routes

  const { MongoMemoryServer } = dep('mongodb-memory-server');
  const mongoose = dep('mongoose');
  const request = dep('supertest');

  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri(); // before app require: dotenv never overrides

  const app = require(path.join(SERVER, 'server.js'));
  const Prediction = require(path.join(SERVER, 'models', 'Prediction'));
  const { encryptSession, SESSION_COOKIE_NAME } = require(path.join(
    SERVER,
    'services',
    'appSession'
  ));

  const USER_ID = '507f1f77bcf86cd7994d9099';
  const cookie =
    `${SESSION_COOKIE_NAME}=` +
    encryptSession({
      token: 'phase9-verification-session-token',
      user: { id: USER_ID, name: 'Phase 9 Verification' },
    });

  // Mixed provenance, exactly as the UI sends it: one auto-captured GT (two
  // attempts — the engine dedups to the latest) + one self-reported GT.
  const mixedBody = {
    exam: 'NEET_PG',
    gts: [
      {
        gtId: '507f1f77bcf86cd7994d90a1',
        provenance: 'auto-captured',
        attempts: [
          { corrects: 112, totalQuestions: 180, status: 'completed', endedAt: '2026-08-01T10:00:00.000Z' },
          { corrects: 128, totalQuestions: 180, status: 'completed', endedAt: '2026-08-20T10:00:00.000Z' },
        ],
      },
      { provenance: 'self-reported', attempts: [{ corrects: 130, status: 'completed' }] },
    ],
    category: 'UR',
  };

  const failures = [];
  let checksRun = 0;
  const check = (name, ok, detail) => {
    checksRun += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
    if (!ok) failures.push(name);
  };

  console.log('='.repeat(78));
  console.log('PHASE 9 PREDICTION-PERSISTENCE VERIFICATION (real app + in-memory Mongo)');
  console.log('='.repeat(78));

  // 1 — predict is served persisted
  const made = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(mixedBody);
  check(
    '1. POST /predict serves only a persisted prediction (201 + persisted + id)',
    made.status === 201 && made.body.persisted === true && Boolean(made.body.predictionId),
    `status=${made.status} body=${JSON.stringify(made.body).slice(0, 200)}`
  );
  const predictionId = made.body.predictionId;
  const served = made.body.prediction || {};

  // 2 — stored document carries the complete §18 Phase 9 field set
  const doc = predictionId ? await Prediction.findById(predictionId).lean() : null;
  check('2a. document exists in storage', Boolean(doc), 'no Prediction document for the served id');
  if (doc) {
    const prov = (doc.input.gts || []).map((g) => g.provenance).sort();
    const storedReq = doc.request || {};
    check(
      '2b. user + exam + timestamp stored',
      doc.userId === USER_ID && doc.exam === 'NEET_PG' && doc.createdAt instanceof Date,
      `userId=${doc.userId} exam=${doc.exam}`
    );
    check(
      '2c. exact request body stored (byte-faithful re-derivation input)',
      JSON.stringify(storedReq) === JSON.stringify(mixedBody),
      'stored request differs from the served request'
    );
    check(
      '2d. method version + dataset snapshot versions stored',
      doc.methodVersion === served.method?.version &&
        typeof doc.method.datasetSnapshots.distribution === 'string' &&
        Array.isArray(doc.method.datasetSnapshots.counselling) &&
        doc.method.datasetSnapshots.counselling.length > 0,
      `methodVersion=${doc.methodVersion} snapshots=${JSON.stringify(doc.method.datasetSnapshots)}`
    );
    check(
      '2e. inputs stored with per-GT provenance tags (auto-captured + self-reported)',
      prov[0] === 'auto-captured' && prov[1] === 'self-reported',
      `provenances=${JSON.stringify(prov)}`
    );
    check(
      '2f. aggregation + transfer tier stored',
      doc.aggregation.n === 2 && Boolean(doc.estimate.transfer) && Boolean(doc.estimate.transfer.tiers),
      `aggregation=${JSON.stringify(doc.aggregation).slice(0, 120)}`
    );
    check(
      '2g. outputs stored as ranges + branch summary WITHOUT row arrays',
      doc.estimate.percentile.range[0] < doc.estimate.percentile.range[1] &&
        doc.rank.rankRange[0] < doc.rank.rankRange[1] &&
        doc.branches.years.every((y) => y.rows === undefined),
      `percentile=${JSON.stringify(doc.estimate.percentile.range)} rank=${JSON.stringify(doc.rank.rankRange)}`
    );
    check(
      '2h. data-coverage references + integrity hash stored',
      Boolean(doc.branches.dataCoverage) && /^[0-9a-f]{64}$/.test(doc.resultHash || ''),
      `dataCoverage=${JSON.stringify(doc.branches.dataCoverage).slice(0, 120)} hash=${doc.resultHash}`
    );
  }

  // 3 — history lists it
  const list = await request(app).get('/api/predictor/predictions').set('Cookie', cookie);
  const listed = (list.body.predictions || []).some((p) => String(p.id) === String(predictionId));
  check(
    '3. GET /predictions lists the stored prediction',
    list.status === 200 && listed,
    `status=${list.status} total=${list.body.pagination && list.body.pagination.total}`
  );

  // 4 — full record retrievable + integrity verifies
  const got = await request(app).get(`/api/predictor/predictions/${predictionId}`).set('Cookie', cookie);
  const rec = got.body.prediction || {};
  check(
    '4. GET /predictions/:id returns inputs + method + snapshots with a matching integrity hash',
    got.status === 200 &&
      got.body.integrity.matches === true &&
      Array.isArray(rec.request && rec.request.gts) &&
      rec.request.gts.length === 2 &&
      rec.methodVersion === doc.methodVersion &&
      rec.method.datasetSnapshots.distribution === doc.method.datasetSnapshots.distribution,
    `status=${got.status} integrity=${JSON.stringify(got.body.integrity)}`
  );

  // 5 — branch rows re-derive and verify against stored counts
  const br = await request(app)
    .get(`/api/predictor/predictions/${predictionId}/branches`)
    .query({ limit: 5 })
    .set('Cookie', cookie);
  const row = br.body.rows && br.body.rows[0];
  check(
    '5. GET /predictions/:id/branches re-derives rows that VERIFY against storage',
    br.status === 200 &&
      br.body.verified === true &&
      br.body.rows.length > 0 &&
      row.institute && row.branch && Number.isFinite(row.closingRank) && row.year && row.band,
    `status=${br.status} verified=${br.body.verified} rows=${br.body.rows && br.body.rows.length}`
  );

  // 6 — rank-only predictions (no category) are persisted too
  const rankOnly = await request(app)
    .post('/api/predictor/predict')
    .set('Cookie', cookie)
    .send({ exam: 'NEET_PG', gts: [{ provenance: 'self-reported', attempts: [{ corrects: 140, status: 'completed' }] }] });
  const rankOnlyDoc = rankOnly.body.predictionId
    ? await Prediction.findById(rankOnly.body.predictionId).lean()
    : null;
  check(
    '6. rank-only prediction (no category) is persisted with the CATEGORY_REQUIRED state',
    rankOnly.status === 201 &&
      Boolean(rankOnlyDoc) &&
      rankOnlyDoc.branches.coverage === 'CATEGORY_REQUIRED' &&
      rankOnlyDoc.rank.rankRange[0] < rankOnlyDoc.rank.rankRange[1],
    `status=${rankOnly.status} coverage=${rankOnlyDoc && rankOnlyDoc.branches.coverage}`
  );

  console.log('-'.repeat(78));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} of ${checksRun} checks failed:`);
    console.log('  ' + failures.join('\n  '));
  } else {
    console.log(`RESULT: PASS — predictions are persisted and reproducible`);
    console.log('(spec §18 Phase 9 done-when: method version + dataset snapshot + inputs retrievable).');
  }

  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  await mongoServer.stop().catch(() => {});
  return failures.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('RESULT: FAIL — script error:', error && error.message);
    process.exit(1);
  });
