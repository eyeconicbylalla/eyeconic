'use strict';

/**
 * P10b — Outcome-capture verification (re-runnable, self-contained).
 *
 * Spec §18 Phase 10 done-when: "A prediction can be joined to its actual
 * outcome in the datastore" — 10a proved it for score/percentile/rank; 10b
 * extends it to the counselling outcome and to the assembled evaluation
 * dataset (§15/§16 readiness gate).
 *
 * Boots the REAL app (server/server.js) against a throwaway in-memory Mongo,
 * mints valid App session cookies (no App API needed for these endpoints),
 * and exercises the capture lifecycle end to end:
 *
 *   1.  POST /predict                        → 201 persisted prediction
 *   2.  GET  /predictions/:id/outcome        → routine empty state (200)
 *   3.  PUT  /predictions/:id/outcome        → exam result + counselling (10b)
 *   4.  GET  …/outcome                       → both echo back, linkage verifies
 *   5.  PUT  flat 10a-era alias keys         → accepted, folded into counselling
 *   6.  PUT  correction without counselling  → replace semantics clear it
 *   7.  PUT  counselling-only outcome        → satisfies the not-empty rule
 *   8.  PUT  invalid counselling (5 cases)   → typed 400s with field paths
 *   9.  exam-aware score bound               → INI-CET score > 200 rejected
 *   10. own-only                             → a second user sees 404s
 *   11. DELETE withdrawal                    → gone; empty state is a 200
 *   12. assembleEvaluationDataset()          → pairs join, comparisons and the
 *                                              §16 readiness gate are correct
 *
 * Usage: node scripts/phase10b/verify_outcome_capture.js
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
  const OutcomeCapture = require(path.join(SERVER, 'models', 'OutcomeCapture'));
  const { encryptSession, SESSION_COOKIE_NAME } = require(path.join(
    SERVER,
    'services',
    'appSession'
  ));
  const { assembleEvaluationDataset, CALIBRATION_GATE_PAIRS } = require(path.join(
    SERVER,
    'services',
    'evaluationDataset'
  ));

  const USER_ID = '507f1f77bcf86cd7994d9099';
  const USER2_ID = '507f1f77bcf86cd7994d9100';
  const cookieFor = (id, name) =>
    `${SESSION_COOKIE_NAME}=` +
    encryptSession({ token: `phase10b-session-${id}`, user: { id, name } });
  const cookie = cookieFor(USER_ID, 'Phase 10b Verification');
  const cookie2 = cookieFor(USER2_ID, 'Second User');

  const manualGt = (corrects) => ({
    provenance: 'self-reported',
    attempts: [{ corrects, status: 'completed' }],
  });

  const failures = [];
  let checksRun = 0;
  const check = (name, ok, detail) => {
    checksRun += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
    if (!ok) failures.push(name);
  };
  const put = (id, body, c = cookie) =>
    request(app).put(`/api/predictor/predictions/${id}/outcome`).set('Cookie', c).send(body);

  console.log('='.repeat(78));
  console.log('PHASE 10b OUTCOME-CAPTURE VERIFICATION (real app + in-memory Mongo)');
  console.log('='.repeat(78));

  // 1 — predict is served persisted
  const made = await request(app)
    .post('/api/predictor/predict')
    .set('Cookie', cookie)
    .send({ exam: 'NEET_PG', gts: [manualGt(120), manualGt(130)], category: 'UR' });
  check(
    '1. POST /predict serves a persisted prediction',
    made.status === 201 && made.body.persisted === true && Boolean(made.body.predictionId),
    `status=${made.status}`
  );
  const id = made.body.predictionId;
  const rankRange = made.body.prediction.rank.rankRange;

  // 2 — routine empty state
  const empty = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
  check(
    '2. GET outcome: nothing recorded is a routine 200',
    empty.status === 200 && empty.body.recorded === false && empty.body.outcomeRecord === null,
    `status=${empty.status} body=${JSON.stringify(empty.body).slice(0, 160)}`
  );

  // 3 — full 10a+10b submission
  const full = await put(id, {
    consent: true,
    score: 480,
    rank: 42000,
    counselling: { status: 'allotted', allottedInstitute: 'AIIMS New Delhi', allottedBranch: 'Radiodiagnosis', round: 'R2' },
  });
  check(
    '3. PUT outcome stores exam result + counselling (created, case-normalized)',
    full.status === 200 &&
      full.body.created === true &&
      full.body.outcome.score === 480 &&
      full.body.counselling.status === 'ALLOTTED' &&
      full.body.counselling.allottedBranch === 'Radiodiagnosis',
    `status=${full.status} body=${JSON.stringify(full.body).slice(0, 200)}`
  );

  // 4 — GET echoes both sides + linkage verifies
  const got = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
  check(
    '4. GET outcome echoes exam result + counselling with a matching linkage check',
    got.status === 200 &&
      got.body.recorded === true &&
      got.body.outcomeRecord.outcome.rank === 42000 &&
      got.body.outcomeRecord.counselling.round === 'R2' &&
      got.body.outcomeRecord.linkageCheck.matches === true &&
      got.body.predictionSummary.rankRange[0] === rankRange[0],
    `status=${got.status} linkage=${JSON.stringify(got.body.outcomeRecord && got.body.outcomeRecord.linkageCheck)}`
  );

  // 5 — flat aliases (the exact keys 10a rejected)
  const made2 = await request(app)
    .post('/api/predictor/predict')
    .set('Cookie', cookie)
    .send({ exam: 'NEET_PG', gts: [manualGt(140)], category: 'OBC' });
  const alias = await put(made2.body.predictionId, {
    consent: true,
    counsellingOutcome: 'allotted',
    allottedBranch: 'Paediatrics',
  });
  check(
    '5. PUT with flat 10a-era alias keys is accepted and folded into counselling',
    alias.status === 200 &&
      alias.body.counselling.status === 'ALLOTTED' &&
      alias.body.counselling.allottedBranch === 'Paediatrics',
    `status=${alias.status} body=${JSON.stringify(alias.body.counselling)}`
  );

  // 6 — correction without counselling clears it (replace semantics)
  const corrected = await put(id, { consent: true, rank: 41000 });
  check(
    '6. Correction without counselling clears it — one record per prediction',
    corrected.status === 200 &&
      corrected.body.created === false &&
      corrected.body.counselling === null &&
      (await OutcomeCapture.countDocuments({ predictionId: id })) === 1,
    `status=${corrected.status} counselling=${JSON.stringify(corrected.body.counselling)}`
  );

  // 7 — counselling-only outcome
  const made3 = await request(app)
    .post('/api/predictor/predict')
    .set('Cookie', cookie)
    .send({ exam: 'NEET_PG', gts: [manualGt(150)], category: 'SC' });
  const counsellingOnly = await put(made3.body.predictionId, {
    consent: true,
    counselling: { status: 'NOT_ALLOTTED' },
  });
  check(
    '7. Counselling-only outcome satisfies the not-empty rule (§15 counselling outcome)',
    counsellingOnly.status === 200 && counsellingOnly.body.counselling.status === 'NOT_ALLOTTED',
    `status=${counsellingOnly.status}`
  );

  // 8 — invalid counselling submissions
  const invalidCases = [
    [{ consent: true, counselling: { status: 'maybe' } }, 'counselling.status'],
    [{ consent: true, counselling: { status: 'NOT_ALLOTTED', allottedBranch: 'Radiology' } }, 'counselling.status'],
    [{ consent: true, counselling: { status: 'ALLOTTED', city: 'Delhi' } }, 'counselling.city'],
    [{ consent: true, counselling: { status: 'ALLOTTED', allottedInstitute: 'A' } }, 'counselling.allottedInstitute'],
    [{ consent: true, counselling: 'allotted' }, 'counselling'],
  ];
  let invalidOk = true;
  let invalidDetail = '';
  for (const [body, field] of invalidCases) {
    const res = await put(id, body);
    if (res.status !== 400 || res.body.field !== field) {
      invalidOk = false;
      invalidDetail = `case ${JSON.stringify(body).slice(0, 60)} → status=${res.status} field=${res.body.field}`;
      break;
    }
  }
  check('8. Invalid counselling submissions get typed 400s with field paths', invalidOk, invalidDetail);

  // 9 — exam-aware score bound (INI-CET pattern max = 200)
  const ini = await request(app)
    .post('/api/predictor/predict')
    .set('Cookie', cookie)
    .send({ exam: 'INI_CET', gts: [manualGt(135)], category: 'UR' });
  const overIni = await put(ini.body.predictionId, { consent: true, score: 250 });
  const withinIni = await put(ini.body.predictionId, { consent: true, score: 150, percentile: 92 });
  check(
    '9. Score bound follows the prediction’s exam pattern (INI-CET ≤ 200)',
    overIni.status === 400 && overIni.body.field === 'score' && withinIni.status === 200,
    `over=${overIni.status} within=${withinIni.status}`
  );

  // 10 — own-only
  const otherPut = await put(id, { consent: true, rank: 1 }, cookie2);
  const otherGet = await request(app)
    .get(`/api/predictor/predictions/${id}/outcome`)
    .set('Cookie', cookie2);
  const otherDelete = await request(app)
    .delete(`/api/predictor/predictions/${id}/outcome`)
    .set('Cookie', cookie2);
  check(
    '10. Own-only: a second user gets 404s and cannot touch the outcome',
    otherPut.status === 404 && otherGet.status === 404 && otherDelete.status === 404,
    `put=${otherPut.status} get=${otherGet.status} delete=${otherDelete.status}`
  );

  // 11 — withdrawal
  const del = await request(app).delete(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
  const afterDel = await request(app)
    .get(`/api/predictor/predictions/${id}/outcome`)
    .set('Cookie', cookie);
  const delAgain = await request(app)
    .delete(`/api/predictor/predictions/${id}/outcome`)
    .set('Cookie', cookie);
  check(
    '11. Withdrawal removes the record; empty state stays a 200, deleting nothing a 404',
    del.status === 200 &&
      del.body.deleted === true &&
      afterDel.status === 200 &&
      afterDel.body.recorded === false &&
      delAgain.status === 404,
    `del=${del.status} after=${afterDel.status}/${afterDel.body.recorded} again=${delAgain.status}`
  );

  // 11b — re-capture after withdrawal (counselling lands months after the
  // result; a withdrawn student must be able to share again)
  const recapture = await put(id, {
    consent: true,
    rank: 41500,
    counselling: { status: 'ALLOTTED', allottedBranch: 'Radiology' },
  });
  check(
    '11b. Re-capture after withdrawal works (created fresh, rank + counselling stored)',
    recapture.status === 200 &&
      recapture.body.created === true &&
      recapture.body.outcome.rank === 41500 &&
      recapture.body.counselling.allottedBranch === 'Radiology',
    `status=${recapture.status} created=${recapture.body.created}`
  );

  // 12 — evaluation-dataset assembly joins everything (§18 10b done-when)
  const { meta, pairs } = await assembleEvaluationDataset();
  const remaining = await OutcomeCapture.countDocuments({});
  const neet = meta.byExam.NEET_PG || { pairs: 0 };
  const pairWithAllotment = pairs.find((p) => p.outcome.counselling && p.outcome.counselling.allottedBranch);
  check(
    '12a. Assembly pairs every capture with its prediction (counts match)',
    meta.totalPairs === remaining && pairs.length === remaining,
    `pairs=${meta.totalPairs} captures=${remaining}`
  );
  check(
    '12b. Pairs carry GT history + method version + predicted ranges + linkage check',
    pairs.length > 0 &&
      pairs.every(
        (p) =>
          Array.isArray(p.prediction.gts) &&
          p.prediction.gts.length >= 1 &&
          typeof p.prediction.methodVersion === 'string' &&
          Array.isArray(p.prediction.predicted.rankRange) &&
          typeof p.linkageCheck.matches === 'boolean'
      ),
    `first=${JSON.stringify((pairs[0] || {}).prediction || {}).slice(0, 160)}`
  );
  check(
    '12c. Counselling outcomes join into pairs (allotment present, NEET_PG counted)',
    Boolean(pairWithAllotment) && neet.withCounselling >= 1 && neet.pairs >= 1,
    `byExam=${JSON.stringify(meta.byExam)}`
  );
  check(
    '12d. Comparison block is a deterministic join (rank and percentile in/out of predicted ranges)',
    pairs.some((p) => typeof p.comparison.actualRankWithinPredicted === 'boolean') &&
      pairs.some((p) => typeof p.comparison.actualPercentileWithinPredicted === 'boolean') &&
      pairs.every((p) => p.comparison === null || typeof p.comparison === 'object'),
    `first=${JSON.stringify((pairs[0] || {}).comparison)}`
  );
  check(
    `12e. §16 readiness gate reported honestly (${CALIBRATION_GATE_PAIRS}+ pairs)`,
    meta.calibrationGate.requiredPairs === CALIBRATION_GATE_PAIRS &&
      meta.calibrationGate.met === (meta.totalPairs >= CALIBRATION_GATE_PAIRS) &&
      meta.totalPairs < CALIBRATION_GATE_PAIRS, // in-memory run has only the seeded pairs
    `gate=${JSON.stringify(meta.calibrationGate)}`
  );

  console.log('-'.repeat(78));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} of ${checksRun} checks failed:`);
    console.log('  ' + failures.join('\n  '));
  } else {
    console.log(`RESULT: PASS — outcomes join to predictions; evaluation dataset assembles`);
    console.log('(spec §18 Phase 10 done-when: a prediction can be joined to its actual outcome).');
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
