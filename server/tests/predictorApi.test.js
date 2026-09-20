/**
 * Phase 7 integration tests — the /api/predictor surface against a mock of
 * the real App API and a live (in-memory) Mongo, mirroring the conventions
 * of tests/appIntegration.test.js.
 *
 * Phase 7/9 done-when covered here:
 *  - endpoints work with auth (App session), validation, full metadata
 *  - NO prediction is served without being stored (persist-before-serve)
 *  - stored predictions are retrievable and integrity-checkable
 *  - branch rows are paginated and re-derivation verifies against storage
 *  - GT auto-fill maps App attempts, tagged auto-captured/self-reported
 */

const http = require('http');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const SERVICE_TOKEN = 's'.repeat(43);
const STUDENT_TOKEN = 'app-user-jwt-for-student';
const STUDENT2_TOKEN = 'app-user-jwt-for-student2';
const STUDENT = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test Student',
  email: 'student@example.com',
  role: 'student',
  isFreeUser: false,
};
const STUDENT2 = { ...STUDENT, _id: '507f1f77bcf86cd799439099', name: 'Second Student', email: 'student2@example.com' };

// Grand Tests on the App side (analytics/me shape; score = correct count).
const GT1 = '507f1f77bcf86cd799439022';
const GT2 = '507f1f77bcf86cd799439033';
const ANALYTICS_ATTEMPTS = [
  {
    _id: '507f1f77bcf86cd7994d0001',
    quiz: { _id: GT1, title: 'Grand Test 01', testType: 'grand', totalMarks: 800 },
    score: 112,
    totalQuestions: 200,
    skipped: 0,
    endTime: '2026-08-01T10:00:00.000Z',
  },
  {
    _id: '507f1f77bcf86cd7994d0002',
    quiz: { _id: GT1, title: 'Grand Test 01', testType: 'grand', totalMarks: 800 },
    score: 128,
    totalQuestions: 200,
    skipped: 2,
    endTime: '2026-08-20T10:00:00.000Z',
  },
  {
    _id: '507f1f77bcf86cd7994d0003',
    quiz: { _id: GT2, title: 'Grand Test 02', testType: 'grand', totalMarks: 800 },
    score: 95,
    totalQuestions: 200,
    skipped: 0,
    endTime: '2026-09-01T10:00:00.000Z',
  },
  {
    _id: '507f1f77bcf86cd7994d0004',
    quiz: { _id: '507f1f77bcf86cd799439044', title: 'Daily 01', testType: 'daily', totalMarks: 20 },
    score: 15,
    totalQuestions: 20,
    skipped: 0,
    endTime: '2026-09-02T10:00:00.000Z',
  },
];

let app;
let mockAppApi;
let mongoServer;

const manualGt = (corrects) => ({ provenance: 'self-reported', attempts: [{ corrects, status: 'completed' }] });

function startMockAppApi() {
  return new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());

    const tokenFor = (email) =>
      email === STUDENT2.email ? STUDENT2_TOKEN : STUDENT_TOKEN;
    const userFor = (email) => (email === STUDENT2.email ? STUDENT2 : STUDENT);
    const requireUser = (req, res, next) => {
      const auth = req.header('Authorization');
      if (auth !== `Bearer ${STUDENT_TOKEN}` && auth !== `Bearer ${STUDENT2_TOKEN}`) {
        return res.status(401).json({ message: 'Token is not valid.' });
      }
      next();
    };

    mock.post('/auth/login', (req, res) => {
      const { email, password } = req.body || {};
      const user = userFor(email);
      if ((email === STUDENT.email || email === STUDENT2.email) && password === 'correct-password') {
        return res.json({ token: tokenFor(email), user, linkedAttempts: 0 });
      }
      return res.status(400).json({ message: 'Invalid email or password.' });
    });

    // The route pages with limit=100; the mock deliberately answers in pages
    // of 2 with totalPages so the paging loop is genuinely exercised.
    mock.get('/quizzes/analytics/me', requireUser, (req, res) => {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = 2;
      const start = (page - 1) * pageSize;
      const attempts = ANALYTICS_ATTEMPTS.slice(start, start + pageSize);
      const total = ANALYTICS_ATTEMPTS.length;
      res.json({
        student: { id: STUDENT._id, name: STUDENT.name },
        summary: {},
        trend: [],
        attempts,
        pagination: {
          page,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    });

    const server = mock.listen(0, () => resolve(server));
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
  process.env.SESSION_SECRET = 'y'.repeat(40);
  process.env.APP_INTEGRATION_TOKEN = SERVICE_TOKEN;
  process.env.APP_LOGIN_MAX_PER_IP = '500';

  mongoServer = await MongoMemoryServer.create();
  // The predictor's persistence gate (re)connects via MONGO_URI on demand —
  // set it so dropped-connection tests can self-heal like production.
  process.env.MONGO_URI = mongoServer.getUri();
  await mongoose.connect(process.env.MONGO_URI);

  const server = await startMockAppApi();
  mockAppApi = server;
  process.env.APP_API_BASE_URL = `http://127.0.0.1:${server.address().port}`;

  app = require('../server');
});

afterAll(async () => {
  await new Promise((resolve) => mockAppApi.close(resolve));
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  if (mongoServer) await mongoServer.stop();
});

function extractSessionCookie(loginResponse) {
  const setCookie = loginResponse.headers['set-cookie'];
  if (!setCookie || !setCookie.length) return null;
  const cookie = setCookie.find((c) => c.startsWith('ec_app_session='));
  return cookie ? cookie.split(';')[0] : null;
}

async function login(email = STUDENT.email) {
  const response = await request(app)
    .post('/api/app-auth/login')
    .send({ email, password: 'correct-password' });
  expect(response.status).toBe(200);
  return extractSessionCookie(response);
}

describe('predictor API — auth and metadata', () => {
  it('requires the App session on every route', async () => {
    expect((await request(app).get('/api/predictor/exams')).status).toBe(401);
    expect((await request(app).post('/api/predictor/predict').send({})).status).toBe(401);
    expect((await request(app).get('/api/predictor/predictions')).status).toBe(401);
  });

  it('lists exams with explicit availability (both live since the M2 UI step)', async () => {
    const cookie = await login();
    const res = await request(app).get('/api/predictor/exams').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const neet = res.body.exams.find((e) => e.id === 'NEET_PG');
    const ini = res.body.exams.find((e) => e.id === 'INI_CET');
    expect(neet.available).toBe(true);
    expect(ini.available).toBe(true); // INI-CET live (M2: Phases 1+5+6+UI)
  });
});

describe('predictor API — POST /predict (persist before serve)', () => {
  const body = {
    exam: 'NEET_PG',
    gts: [manualGt(120), manualGt(130)],
    category: 'UR',
  };

  it('serves a persisted prediction with full metadata and NO branch row arrays', async () => {
    const cookie = await login();
    const res = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(body);
    expect(res.status).toBe(201);
    expect(res.body.persisted).toBe(true);
    expect(res.body.predictionId).toBeTruthy();

    const p = res.body.prediction;
    expect(p.method.version).toBe('neetpg-branch-p6.v1');
    expect(p.method.datasetSnapshots.distribution).toBe('DS-NEETPG-DISTRIBUTION-2025-v1');
    expect(p.estimate.transfer.tiers).toEqual({ TIER_1: 2, TIER_2: 0 });
    expect(p.rank.rankRange[0]).toBeLessThan(p.rank.rankRange[1]);
    expect(p.branches.coverage).toBe('MATCHED');
    for (const y of p.branches.years) {
      expect(y.counts.total).toBeGreaterThan(0);
      expect(y.rows).toBeUndefined(); // paginated endpoint serves rows
    }
    // input provenance is recorded on the result (§6A)
    expect(p.input.gts.every((g) => g.provenance === 'self-reported')).toBe(true);
  });

  it('rejects invalid GT values with the field path', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(250)] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(res.body.field).toBe('gts[0].attempts[0].corrects');
  });

  it('rejects wrong-exam quotas with typed errors', async () => {
    const cookie = await login();
    const quota = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(100)], quota: 'DU' });
    expect(quota.status).toBe(400);
    expect(quota.body.field).toBe('quota');
    // INI-CET is a single counselling pool: AIQ is not a valid quota there
    const iniQuota = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'INI_CET', gts: [manualGt(130)], quota: 'AIQ' });
    expect(iniQuota.status).toBe(400);
    expect(iniQuota.body.field).toBe('quota');
  });

  it('accepts the site’s own origins behind rewriting proxies (dev + prod shapes)', async () => {
    const cookie = await login();
    // Dev shape: page on localhost:5173, request arrives at the server with a
    // DIFFERENT Host (Vite proxy changeOrigin) — Origin allowlist decides.
    const dev = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send(body);
    expect(dev.status).toBe(201);

    // Production shape: Origin is the website, Host is the server project
    // (Vercel /api rewrite) — still the site's own origin.
    const prod = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .set('Origin', 'https://www.eyeconicneetpg.com')
      .send(body);
    expect(prod.status).toBe(201);
  });

  it('rejects foreign origins with 403 (CSRF defence-in-depth)', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REJECTED');
  });

  it('does NOT serve a prediction when persistence fails', async () => {
    const Prediction = require('../models/Prediction');
    const spy = jest.spyOn(Prediction, 'create').mockRejectedValueOnce(new Error('db down'));
    const cookie = await login();
    const res = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(body);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('PREDICTION_NOT_STORED');
    expect(res.body.predictionId).toBeUndefined();
  });

  it('rate-limits abuse (429 after the per-user budget)', async () => {
    const Prediction = require('../models/Prediction');
    // Dedicated user so the shared budget other tests rely on is untouched.
    const cookie = await login(STUDENT2.email);
    let saw429 = false;
    const createSpy = jest.spyOn(Prediction, 'create').mockResolvedValue({ _id: 'x' });
    for (let i = 0; i < 70 && !saw429; i += 1) {
      const res = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(body);
      if (res.status === 429) saw429 = true;
    }
    createSpy.mockRestore();
    expect(saw429).toBe(true);
  });
});

describe('predictor API — history and retrieval (§18 Phase 9)', () => {
  it('lists the student’s predictions with summary fields', async () => {
    const cookie = await login();
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(140)], category: 'OBC' });
    expect(made.status).toBe(201);

    const list = await request(app).get('/api/predictor/predictions').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.predictions.length).toBeGreaterThanOrEqual(1);
    const row = list.body.predictions[0];
    expect(row.methodVersion).toBe('neetpg-branch-p6.v1');
    expect(row.percentileRange[0]).toBeLessThan(row.percentileRange[1]);
    expect(row.rankRange[0]).toBeLessThan(row.rankRange[1]);
    expect(row.branchesCoverage).toBe('MATCHED');
  });

  it('returns the full stored record with a matching integrity hash', async () => {
    const cookie = await login();
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(120), manualGt(126)], category: 'SC' });
    const id = made.body.predictionId;

    const got = await request(app).get(`/api/predictor/predictions/${id}`).set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.integrity.matches).toBe(true);
    expect(got.body.prediction.request.gts).toHaveLength(2); // inputs retrievable
    expect(got.body.prediction.method.datasetSnapshots.counselling).toContain(
      'DS-NEETPG-COUNSELLING-2025-v1'
    );
  });

  it('keeps other students out (own-only)', async () => {
    const cookie = await login();
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(100)] });
    const id = made.body.predictionId;

    const other = await login(STUDENT2.email);
    expect((await request(app).get(`/api/predictor/predictions/${id}`).set('Cookie', other)).status).toBe(404);
    expect(
      (await request(app).get(`/api/predictor/predictions/${id}/branches`).set('Cookie', other)).status
    ).toBe(404);
  });
});

describe('predictor API — INI-CET predictions (M2: live end-to-end)', () => {
  it('serves a persisted INI-CET prediction with full §9 metadata and session-tagged branches', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'INI_CET', gts: [manualGt(130), manualGt(140)], category: 'UR' });
    expect(res.status).toBe(201);
    expect(res.body.persisted).toBe(true);
    expect(res.body.predictionId).toBeTruthy();

    const p = res.body.prediction;
    expect(p.method.version).toBe('inicet-branch-p6.v1');
    expect(p.method.stage).toBe('BRANCHES');
    expect(p.method.datasetSnapshots.distribution).toBe('DS-INICET-DISTRIBUTION-202507-v1');
    expect(p.method.datasetSnapshots.counselling).toContain('DS-INICET-COUNSELLING-202507-v1');
    expect(p.input.quota).toBe('INI');
    expect(p.estimate.transfer.mode).toBe('TIER_3_CROWD_PRIOR_PRIMARY');
    expect(p.estimate.warnings.map((w) => w.code)).toContain('CROWD_SOURCED_PRIOR');
    expect(p.rank.session).toBe('2025-07');
    expect(p.rank.rankRange[0]).toBeLessThan(p.rank.rankRange[1]);
    expect(p.branches.coverage === 'MATCHED' || p.branches.coverage === 'PARTIAL').toBe(true);
    expect(p.branches.dataCoverage.years).toEqual([202301, 202401, 202407, 202501, 202507]);
    for (const y of p.branches.years) {
      expect(y.counts.total).toBeGreaterThanOrEqual(0);
      expect(y.rows).toBeUndefined(); // paginated endpoint serves rows
    }
  });

  it('flags reserved categories with the UR-only-prior caution (§9)', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'INI_CET', gts: [manualGt(135)], category: 'OBC' });
    expect(res.status).toBe(201);
    const codes = res.body.prediction.estimate.warnings.map((w) => w.code);
    expect(codes).toContain('PRIOR_UR_ONLY');
  });

  it('paginates INI-CET branch rows by session year (YYYYMM)', async () => {
    const cookie = await login();
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'INI_CET', gts: [manualGt(125), manualGt(135)], category: 'UR' });
    const id = made.body.predictionId;

    const res = await request(app)
      .get(`/api/predictor/predictions/${id}/branches`)
      .query({ year: 202507, limit: 10 })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.rows.length).toBeLessThanOrEqual(10);
    for (const row of res.body.rows) {
      expect(row.year).toBe(202507);
      expect(row.session).toBe('2025-07');
      expect(row.quota).toBe('INI');
    }
    const bad = await request(app)
      .get(`/api/predictor/predictions/${id}/branches`)
      .query({ year: 2024 })
      .set('Cookie', cookie);
    expect(bad.status).toBe(400); // 2024 is a NEET-PG year, not an INI-CET session tag
  });

  it('stores and retrieves INI-CET predictions with matching integrity', async () => {
    const cookie = await login();
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'INI_CET', gts: [manualGt(130)], category: 'SC' });
    const got = await request(app)
      .get(`/api/predictor/predictions/${made.body.predictionId}`)
      .set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.integrity.matches).toBe(true);
    expect(got.body.prediction.exam).toBe('INI_CET');
    expect(got.body.prediction.methodVersion).toBe('inicet-branch-p6.v1');
  });
});


describe('predictor API — outcome capture (§18 Phases 10a+10b)', () => {
  const OutcomeCapture = require('../models/OutcomeCapture');

  async function predictFor(cookie, gts = [manualGt(120), manualGt(130)]) {
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts, category: 'UR' });
    expect(made.status).toBe(201);
    return made.body.predictionId;
  }

  it('creates a consented outcome linked to the prediction (linkage copied at capture time)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);

    const put = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, score: 480, rank: 42000 });
    expect(put.status).toBe(200);
    expect(put.body.created).toBe(true);
    expect(put.body.outcome).toEqual({ score: 480, percentile: null, rank: 42000 });
    expect(put.body.consentGivenAt).toBeTruthy();
    expect(put.body.linkage.methodVersion).toBe('neetpg-branch-p6.v1');
    expect(put.body.linkage.datasetSnapshots.distribution).toBe('DS-NEETPG-DISTRIBUTION-2025-v1');
    expect(put.body.linkage.gtsUsed).toBe(2);
    expect(put.body.linkage.predictionCreatedAt).toBeTruthy();
    expect(await OutcomeCapture.countDocuments({ predictionId: id })).toBe(1);
  });

  it('GET returns the outcome with a matching linkage check and prediction summary', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, percentile: 81.2 });

    const got = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.recorded).toBe(true);
    expect(got.body.outcomeRecord.linkageCheck.matches).toBe(true);
    expect(got.body.outcomeRecord.outcome.percentile).toBe(81.2);
    expect(got.body.outcomeRecord.source).toBe('self-reported');
    expect(got.body.predictionSummary.methodVersion).toBe('neetpg-branch-p6.v1');
    expect(got.body.predictionSummary.rankRange[0]).toBeLessThan(got.body.predictionSummary.rankRange[1]);
    expect(got.body.predictionSummary.gtsUsed).toBe(2);
  });

  it('corrections overwrite in place — one outcome per prediction (§18 10a)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, score: 480, rank: 42000 });

    const corrected = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, rank: 41000 });
    expect(corrected.status).toBe(200);
    expect(corrected.body.created).toBe(false);
    expect(await OutcomeCapture.countDocuments({ predictionId: id })).toBe(1);

    const got = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(got.body.recorded).toBe(true);
    expect(got.body.outcomeRecord.outcome).toEqual({ score: null, percentile: null, rank: 41000 });
  });

  it('rejects submission without consent (consent-based, §15)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const res = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ rank: 42000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(res.body.field).toBe('consent');
  });

  it('rejects an outcome with no values at all', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const res = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTCOME_EMPTY');
  });

  it('rejects out-of-bounds and non-numeric values with field paths', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const cases = [
      [{ consent: true, score: 801 }, 'score'], // above the 800-scale pattern max
      [{ consent: true, score: 480.5 }, 'score'], // scores are whole numbers
      [{ consent: true, percentile: 100.5 }, 'percentile'],
      [{ consent: true, rank: 0 }, 'rank'],
      [{ consent: true, rank: 'forty-two' }, 'rank'],
    ];
    for (const [body, field] of cases) {
      const res = await request(app)
        .put(`/api/predictor/predictions/${id}/outcome`)
        .set('Cookie', cookie)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OUTCOME_INVALID');
      expect(res.body.field).toBe(field);
    }
  });

  it('accepts the Phase 10b counselling outcome alongside the exam result (§15)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);

    const put = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({
        consent: true,
        rank: 42000,
        counselling: {
          status: 'allotted',
          allottedInstitute: 'AIIMS New Delhi',
          allottedBranch: 'Radiodiagnosis',
          round: 'R2',
        },
      });
    expect(put.status).toBe(200);
    expect(put.body.counselling).toEqual({
      status: 'ALLOTTED', // case-normalized
      allottedInstitute: 'AIIMS New Delhi',
      allottedBranch: 'Radiodiagnosis',
      round: 'R2',
    });
    expect(put.body.outcome).toEqual({ score: null, percentile: null, rank: 42000 });

    const got = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.recorded).toBe(true);
    expect(got.body.outcomeRecord.counselling.status).toBe('ALLOTTED');
    expect(got.body.outcomeRecord.counselling.allottedBranch).toBe('Radiodiagnosis');
  });

  it('accepts the flat 10a-era alias keys the old API rejected (§20: rejection becomes acceptance)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const res = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, counsellingOutcome: 'allotted', allottedBranch: 'Radiology' });
    expect(res.status).toBe(200);
    expect(res.body.counselling).toEqual({
      status: 'ALLOTTED',
      allottedInstitute: null,
      allottedBranch: 'Radiology',
      round: null,
    });
  });

  it('accepts a counselling-only outcome (10b values alone satisfy the not-empty rule)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const res = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, counselling: { status: 'NOT_ALLOTTED' } });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toEqual({ score: null, percentile: null, rank: null });
    expect(res.body.counselling).toEqual({
      status: 'NOT_ALLOTTED',
      allottedInstitute: null,
      allottedBranch: null,
      round: null,
    });
  });

  it('a correction without counselling clears it (replace semantics, one record)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, rank: 42000, counselling: { status: 'ALLOTTED', allottedBranch: 'Radiology' } });

    const corrected = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, rank: 41000 });
    expect(corrected.status).toBe(200);
    expect(corrected.body.counselling).toBeNull();

    const got = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(got.body.outcomeRecord.counselling).toBeNull();
    expect(await OutcomeCapture.countDocuments({ predictionId: id })).toBe(1);
  });

  it('validates the counselling block with field paths', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const cases = [
      // unknown status value
      [{ consent: true, counselling: { status: 'maybe' } }, 'counselling.status'],
      // allotment strings without a status
      [{ consent: true, counselling: { allottedBranch: 'Radiology' } }, 'counselling.status'],
      // "not allotted" contradicted by an allotted branch
      [{ consent: true, counselling: { status: 'NOT_ALLOTTED', allottedBranch: 'Radiology' } }, 'counselling.status'],
      // too-short allotment string
      [{ consent: true, counselling: { status: 'ALLOTTED', allottedInstitute: 'A' } }, 'counselling.allottedInstitute'],
      // non-string institute
      [{ consent: true, counselling: { status: 'ALLOTTED', allottedInstitute: 42 } }, 'counselling.allottedInstitute'],
      // unknown key inside the counselling object
      [{ consent: true, counselling: { status: 'ALLOTTED', city: 'Delhi' } }, 'counselling.city'],
      // nested object not an object
      [{ consent: true, counselling: 'allotted' }, 'counselling'],
      // same target offered twice with different values (alias + nested)
      [
        { consent: true, counselling: { status: 'ALLOTTED' }, counsellingOutcome: 'NOT_ALLOTTED' },
        'counsellingOutcome',
      ],
    ];
    for (const [body, field] of cases) {
      const res = await request(app)
        .put(`/api/predictor/predictions/${id}/outcome`)
        .set('Cookie', cookie)
        .send(body);
      expect(res.status).toBe(400);
      expect(['OUTCOME_INVALID', 'OUTCOME_UNKNOWN_FIELD']).toContain(res.body.code);
      expect(res.body.field).toBe(field);
    }
  });

  it('rejects unknown fields (minimum-required storage, §15)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const res = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, rank: 1, mood: 'great' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTCOME_UNKNOWN_FIELD');
    expect(res.body.field).toBe('mood');
  });

  it('keeps other students out (own-only on prediction AND outcome)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const other = await login(STUDENT2.email);

    const put = await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', other)
      .send({ consent: true, rank: 1 });
    expect(put.status).toBe(404);
    expect((await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', other)).status).toBe(404);
    expect(
      (await request(app).delete(`/api/predictor/predictions/${id}/outcome`).set('Cookie', other)).status
    ).toBe(404);
    expect(await OutcomeCapture.countDocuments({ predictionId: id })).toBe(0);
  });

  it('404s for unknown or malformed prediction ids', async () => {
    const cookie = await login();
    const put = await request(app)
      .put('/api/predictor/predictions/does-not-exist/outcome')
      .set('Cookie', cookie)
      .send({ consent: true, rank: 1 });
    expect(put.status).toBe(404);
    expect(put.body.code).toBe('NOT_FOUND');
  });

  it('empty state is a routine 200, not an error (no console noise on result pages)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    const res = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(false);
    expect(res.body.outcomeRecord).toBeNull();
    // Context is still served so the UI can show predicted-vs-actual anywhere.
    expect(res.body.predictionSummary.rankRange[0]).toBeLessThan(res.body.predictionSummary.rankRange[1]);
  });

  it('withdrawal deletes the outcome entirely (consent-based = withdrawable)', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, rank: 42000 });

    const del = await request(app).delete(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
    // Back to the routine empty state — a 200, not an error.
    const after = await request(app)
      .get(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.recorded).toBe(false);
    // Deleting nothing IS an error.
    expect(
      (await request(app).delete(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie)).status
    ).toBe(404);
    expect(await OutcomeCapture.countDocuments({ predictionId: id })).toBe(0);
  });

  it('linkage check flags drift if the prediction no longer matches the capture-time copy', async () => {
    const cookie = await login();
    const id = await predictFor(cookie);
    await request(app)
      .put(`/api/predictor/predictions/${id}/outcome`)
      .set('Cookie', cookie)
      .send({ consent: true, rank: 42000 });

    // Tamper with the stored prediction's method version (simulates drift).
    const Prediction = require('../models/Prediction');
    await Prediction.updateOne({ _id: id }, { $set: { methodVersion: 'neetpg-future.v9' } });

    const got = await request(app).get(`/api/predictor/predictions/${id}/outcome`).set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.recorded).toBe(true);
    expect(got.body.outcomeRecord.linkageCheck.matches).toBe(false);
  });
});

describe('predictor API — branch rows (paginated, re-derived + verified)', () => {
  let cookie;
  let predictionId;

  beforeAll(async () => {
    cookie = await login();
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(120), manualGt(130)], category: 'UR' });
    predictionId = made.body.predictionId;
  });

  it('serves verified paginated rows with §12 context', async () => {
    const res = await request(app)
      .get(`/api/predictor/predictions/${predictionId}/branches`)
      .query({ limit: 10, page: 1 })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(1);
    expect(res.body.rows.length).toBeLessThanOrEqual(10);
    const row = res.body.rows[0];
    expect(row).toHaveProperty('institute');
    expect(row).toHaveProperty('branch');
    expect(row).toHaveProperty('closingRank');
    expect(row).toHaveProperty('year');
    expect(row).toHaveProperty('band');
    expect(res.body.notes[0]).toMatch(/not a guarantee/i);
  });

  it('filters by band and year', async () => {
    const res = await request(app)
      .get(`/api/predictor/predictions/${predictionId}/branches`)
      .query({ band: 'WITHIN_RANGE', year: 2025, limit: 100 })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.rows.every((r) => r.band === 'WITHIN_RANGE' && r.year === 2025)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.rows.length); // paginated
  });

  it('rejects unknown bands with 400', async () => {
    const res = await request(app)
      .get(`/api/predictor/predictions/${predictionId}/branches`)
      .query({ band: 'GUARANTEED' })
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('409s for predictions stored without a category', async () => {
    const made = await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(100)] });
    const res = await request(app)
      .get(`/api/predictor/predictions/${made.body.predictionId}/branches`)
      .set('Cookie', cookie);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CATEGORY_REQUIRED');
  });
});

describe('predictor API — database connection resilience (Phase 8 fix)', () => {
  // Regression suite for the reported bug: the whole app kept working with a
  // dead mongoose connection (login limiter fails open, quizzes are proxied)
  // while POST /predict — the only route that hard-requires a write — failed
  // with PREDICTION_NOT_STORED. The persistence gate must self-heal.
  const body = { exam: 'NEET_PG', gts: [manualGt(121)], category: 'UR' };

  it('serves a prediction after the connection drops mid-session (self-healing)', async () => {
    const cookie = await login();
    const first = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(body);
    expect(first.status).toBe(201);

    // Simulate the drop (machine sleep killing Atlas sockets, etc.).
    await mongoose.connection.close();
    expect(mongoose.connection.readyState).toBe(0);

    const second = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(body);
    expect(second.status).toBe(201);
    expect(second.body.persisted).toBe(true);
    expect(second.body.predictionId).toBeTruthy();

    const list = await request(app).get('/api/predictor/predictions').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('fails with a clear 503 when storage is truly unreachable (no silent 500)', async () => {
    // Login FIRST — the auth surface's own Mongo-backed limiter cannot run
    // without a connection, and this test is about the predictor's gate.
    const cookie = await login();
    await mongoose.connection.close();
    const savedUri = process.env.MONGO_URI;
    process.env.MONGO_URI = 'mongodb://127.0.0.1:1/nowhere'; // unreachable
    process.env.MONGO_CONNECT_TIMEOUT_MS = '800';
    try {
      const res = await request(app).post('/api/predictor/predict').set('Cookie', cookie).send(body);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('PREDICTOR_DB_UNAVAILABLE');

      // Auto-fill still works while storage is down (echo skipped, no block).
      const gts = await request(app).get('/api/predictor/gts').set('Cookie', cookie);
      expect(gts.status).toBe(200);
      expect(gts.body.gts).toHaveLength(2);
      expect(gts.body.selfReported).toEqual([]);
    } finally {
      process.env.MONGO_URI = savedUri;
      delete process.env.MONGO_CONNECT_TIMEOUT_MS;
      // Self-heal for any later suites in this file.
      await mongoose.connect(process.env.MONGO_URI).catch(() => {});
    }
  });
});

describe('predictor API — GT auto-fill (auto-captured vs self-reported)', () => {
  it('maps App analytics attempts to engine GT inputs, paging through pages', async () => {
    const cookie = await login();
    const res = await request(app).get('/api/predictor/gts').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.exam).toBe('NEET_PG');

    const gts = res.body.gts;
    expect(gts).toHaveLength(2); // daily quiz filtered out
    const gt1 = gts.find((g) => g.gtId === GT1);
    expect(gt1.provenance).toBe('auto-captured');
    expect(gt1.attempts).toHaveLength(2); // both attempts listed; the ENGINE dedups
    expect(gt1.attempts.map((a) => a.corrects).sort()).toEqual([112, 128]);
    expect(gt1.attempts[0].totalQuestions).toBe(200);
    expect(gt1.attempts.every((a) => a.status === 'completed')).toBe(true);
  });

  it('echoes self-reported GTs from the latest prediction, clearly tagged', async () => {
    const cookie = await login();
    await request(app)
      .post('/api/predictor/predict')
      .set('Cookie', cookie)
      .send({ exam: 'NEET_PG', gts: [manualGt(135)] });

    const res = await request(app).get('/api/predictor/gts').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.selfReported.length).toBeGreaterThanOrEqual(1);
    expect(res.body.selfReported[0].attempts[0].corrects).toBe(135);
  });

  it('passes App API auth failures through as session-expiry 401s', async () => {
    // Forge a structurally valid session wrapping a token the App rejects.
    const { encryptSession, SESSION_COOKIE_NAME } = require('../services/appSession');
    const forged = `${SESSION_COOKIE_NAME}=${encryptSession({
      token: 'stale-token',
      user: { id: STUDENT._id, name: STUDENT.name },
    })}`;
    const res = await request(app).get('/api/predictor/gts').set('Cookie', forged);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('APP_SESSION_REQUIRED');
  });
});
