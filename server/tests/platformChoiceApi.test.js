/**
 * Platform Choice Recommender (Feature 06) — /api/platform-choice integration
 * tests against a mock of the real App API and a live (in-memory) Mongo,
 * mirroring the conventions of tests/predictorApi.test.js.
 *
 * Covered:
 *  - App-session auth on every route; CSRF origin guard on POST
 *  - GET /context: config echo + prefills from Mini CCT / onboarding profile /
 *    predictor collections, and the latest saved recommendation
 *  - POST /recommend: server-side validation, tiered result shape, outbound
 *    URL resolution, free-user concept gating note, App-API degradation
 *  - persist-before-serve (nothing served when the write fails)
 *  - per-user rate limiting
 */

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
  isFreeUser: true, // free user: the App strips Mini CCT concept tags upstream
  freeUserProfile: { year: 'Intern', issues: 'Revision', resources: ['Marrow'], isReadyToTransform: true },
};
const STUDENT2 = { ...STUDENT, _id: '507f1f77bcf86cd799099', name: 'Second Student', email: 'student2@example.com' };

const MINI_ATTEMPT_ID = '507f1f77bcf86cd7994d0010';

// The App API's Mini CCT analysis shape (free-user variant: topics/tags are
// stripped server-side upstream — verify the recommender degrades to a note
// instead of fabricating concept signals).
const MINI_CCT_ANALYSIS = {
  quiz: { _id: '507f1f77bcf86cd7994d0020', title: 'Mini CCT #2', testType: 'mini', totalMarks: 120 },
  attempt: { _id: MINI_ATTEMPT_ID, status: 'completed', startTime: '2026-09-20T09:00:00.000Z', endTime: '2026-09-20T10:00:00.000Z', timeTakenSeconds: 3600 },
  summary: { correct: 12, incorrect: 14, skipped: 4, attempted: 26, totalQuestions: 30, marksObtained: 34, totalMarks: 120, scorePercentage: 28.33, accuracy: 46.15, timeTakenSeconds: 3600 },
  subjects: [
    { subjectName: 'Psychiatry', questionCount: 10, correct: 3, incorrect: 6, skipped: 1, attempted: 9, accuracy: 33.33, marks: 6, cohortAvgMarks: null, cohortAvgAccuracy: null, cohortAttempts: 0 },
    { subjectName: 'Dermatology', questionCount: 10, correct: 4, incorrect: 5, skipped: 1, attempted: 9, accuracy: 44.44, marks: 11, cohortAvgMarks: null, cohortAvgAccuracy: null, cohortAttempts: 0 },
    { subjectName: 'Orthopaedics', questionCount: 10, correct: 5, incorrect: 3, skipped: 2, attempted: 8, accuracy: 62.5, marks: 17, cohortAvgMarks: null, cohortAvgAccuracy: null, cohortAttempts: 0 },
  ],
  overall: { scorePercentage: 28.33, accuracy: 46.15, cohortAvgScorePercentage: null, cohortAvgAccuracy: null },
  cohort: { totalStudents: 1, minCohortSize: 5, sufficient: false, percentile: null, topPercent: null, averageMarks: null, averageScorePercentage: null, highestMarks: null },
  insight: { tier: { key: 'needs_work', label: 'Needs Work' }, strongestSubject: { subjectName: 'Orthopaedics', accuracy: 62.5 }, weakestSubject: { subjectName: 'Psychiatry', accuracy: 33.33 }, message: '' },
  access: { level: 'limited', gatedSections: ['heatmap', 'topics', 'tags'] },
  generatedAt: '2026-09-20T10:00:05.000Z',
};

const RECOMMEND_BODY = {
  exam: 'NEET_PG',
  targetSession: 'NEET_PG_2027',
  studyHoursPerDay: 6,
  previousResource: 'marrow',
  likelyToSwitch: 'no',
  weakestSubjects: ['Psychiatry', 'Dermatology', 'Orthopaedics'],
};

let app;
let mockAppApi;
let mongoServer;
let analysisFails = false;

function startMockAppApi() {
  return new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());

    const tokenFor = (email) => (email === STUDENT2.email ? STUDENT2_TOKEN : STUDENT_TOKEN);
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

    mock.get('/auth/me', requireUser, (req, res) => res.json(userFor(null)));

    mock.get('/mini-cct/attempts', requireUser, (_req, res) => {
      res.json({
        attempts: [
          { _id: MINI_ATTEMPT_ID, quizId: MINI_CCT_ANALYSIS.quiz._id, quizTitle: 'Mini CCT #2', status: 'completed', score: 12, totalQuestions: 30, marksObtained: 34, totalMarks: 120, endTime: '2026-09-20T10:00:00.000Z' },
        ],
        total: 1, page: 1, pages: 1,
      });
    });

    mock.get(`/mini-cct/attempts/${MINI_ATTEMPT_ID}/analysis`, requireUser, (_req, res) => {
      if (analysisFails) return res.status(500).json({ message: 'server error' });
      return res.json(MINI_CCT_ANALYSIS);
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

describe('platform choice API — auth', () => {
  it('requires the App session on every route', async () => {
    expect((await request(app).get('/api/platform-choice/context')).status).toBe(401);
    expect((await request(app).post('/api/platform-choice/recommend').send(RECOMMEND_BODY)).status).toBe(401);
  });
});

describe('platform choice API — GET /context', () => {
  it('echoes the config and prefills from existing student data', async () => {
    const cookie = await login();
    const res = await request(app).get('/api/platform-choice/context').set('Cookie', cookie);
    expect(res.status).toBe(200);

    // Config echo — the UI never hardcodes the matrix.
    expect(res.body.config.exams.map((e) => e.id)).toEqual(['NEET_PG', 'INI_CET', 'FMGE', 'UPSC_CMS']);
    expect(res.body.config.exams.find((e) => e.id === 'INI_CET').sessions.map((s) => s.label))
      .toEqual(['INI-CET Nov 2026', 'INI-CET May 2027']);
    expect(res.body.config.subjects.length).toBeGreaterThanOrEqual(19);
    expect(res.body.config.resourceOptions.map((o) => o.id)).toContain('cerebellum');
    expect(res.body.config.weights.switching).toBeGreaterThan(0);

    // Prefills: previous resource from the onboarding profile…
    expect(res.body.autofill.previousResource).toBe('marrow');
    // …weakest subjects from the latest Mini CCT (labels, not keys)…
    expect(res.body.autofill.weakestSubjects).toEqual(['Psychiatry', 'Dermatology', 'Orthopaedics']);
    // …no predictor usage yet → exam not derivable + honest note.
    expect(res.body.autofill.exam).toBeNull();
    expect(res.body.notes.some((n) => n.includes('FMGE'))).toBe(true);

    expect(res.body.miniCct.quizTitle).toBe('Mini CCT #2');
    expect(res.body.miniCct.subjectRanking[0]).toEqual({ subjectName: 'Psychiatry', accuracy: 33.33 });
    expect(res.body.latest).toBeNull();
  });

  it('prefills the exam + desired branch from the newest predictor usage', async () => {
    const DesiredBranchQuery = require('../models/DesiredBranchQuery');
    const Prediction = require('../models/Prediction');
    const userId = STUDENT._id;
    await Prediction.create({
      userId,
      exam: 'NEET_PG',
      request: {},
      methodVersion: 'neetpg-branch-720-v1',
      method: {},
      input: {},
      aggregation: {},
      estimate: {},
      rank: {},
      branches: {},
      resultHash: 'a'.repeat(64),
      createdAt: new Date('2026-09-10T00:00:00Z'),
    });
    await DesiredBranchQuery.create({
      userId,
      exam: 'INI_CET',
      request: { branchKey: 'md-radiodiagnosis' },
      methodVersion: 'desired-inicet-v1',
      method: {},
      input: { branch: { key: 'md radiodiagnosis', display: 'MD Radiodiagnosis' } },
      target: {},
      resultHash: 'b'.repeat(64),
      createdAt: new Date('2026-09-20T00:00:00Z'), // NEWER → its exam wins
    });

    const cookie = await login();
    const res = await request(app).get('/api/platform-choice/context').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.autofill.exam).toBe('INI_CET');
    expect(res.body.autofill.targetSession).toBe('INI_CET_NOV_2026');
    expect(res.body.autofill.desiredBranch).toBe('MD Radiodiagnosis');
  });
});

describe('platform choice API — POST /recommend', () => {
  it('serves a persisted, tiered recommendation with resolved outbound links', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/platform-choice/recommend')
      .set('Cookie', cookie)
      .send(RECOMMEND_BODY);
    expect(res.status).toBe(201);
    expect(res.body.persisted).toBe(true);
    expect(res.body.recommendationId).toBeTruthy();

    const recommendation = res.body.recommendation;
    expect(recommendation.method.version).toBe('platform-choice-v1');
    expect(recommendation.tiers.map((t) => t.tier)).toEqual([
      'highly_recommended', 'good_alternative', 'also_consider',
    ]);
    expect(recommendation.tiers[0].platform.key).toBe('marrow'); // staying is honoured
    expect(recommendation.tiers[0].reason).toContain('already study with Marrow');
    for (const tier of recommendation.tiers) {
      expect(tier.reason).toBeTruthy();
      expect(tier.matchScore).toBeGreaterThanOrEqual(0);
      expect(tier.platform.visitUrl).toMatch(/^https:\/\//); // server-resolved, never client-built
      expect(tier.factors.length).toBe(6);
    }
    // Free-user Mini CCT: concept tags never arrived (stripped upstream) — the
    // recommender says so instead of inventing a signal.
    expect(recommendation.notes.some((n) => n.includes('concept'))).toBe(true);

    // Persisted with integrity hash + the exact request (Phase 9 discipline).
    const PlatformChoiceQuery = require('../models/PlatformChoiceQuery');
    const doc = await PlatformChoiceQuery.findById(res.body.recommendationId).lean();
    expect(doc.userId).toBe(STUDENT._id);
    expect(doc.exam).toBe('NEET_PG');
    expect(doc.request).toEqual(RECOMMEND_BODY);
    expect(doc.input.miniCct.attemptId).toBe(MINI_ATTEMPT_ID);
    expect(doc.input.desiredBranch).toBe('MD Radiodiagnosis');
    expect(doc.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.result.tiers.length).toBe(3);
  });

  it('validates every input server-side with typed field errors', async () => {
    const cookie = await login();
    const cases = [
      { body: { ...RECOMMEND_BODY, exam: 'AIIMS' }, field: 'exam' },
      { body: { ...RECOMMEND_BODY, targetSession: 'INI_CET_MAY_2027' }, field: 'targetSession' },
      { body: { ...RECOMMEND_BODY, studyHoursPerDay: 0 }, field: 'studyHoursPerDay' },
      { body: { ...RECOMMEND_BODY, previousResource: 'random-app' }, field: 'previousResource' },
      { body: { ...RECOMMEND_BODY, likelyToSwitch: 'maybe' }, field: 'likelyToSwitch' },
      { body: { ...RECOMMEND_BODY, weakestSubjects: [] }, field: 'weakestSubjects' },
      { body: { ...RECOMMEND_BODY, weakestSubjects: ['Astrology'] }, field: 'weakestSubjects' },
      { body: { ...RECOMMEND_BODY, surprise: true }, field: 'surprise' },
    ];
    for (const { body, field } of cases) {
      const res = await request(app)
        .post('/api/platform-choice/recommend')
        .set('Cookie', cookie)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
      expect(res.body.field).toBe(field);
    }
    // Unknown subjects carry near-miss suggestions for the picker.
    const suggestions = await request(app)
      .post('/api/platform-choice/recommend')
      .set('Cookie', cookie)
      .send({ ...RECOMMEND_BODY, weakestSubjects: ['Astrology'] });
    expect(suggestions.body.suggestions.length).toBeGreaterThan(0);
  });

  it('accepts the site’s own origins and rejects foreign ones (CSRF)', async () => {
    const cookie = await login();
    const dev = await request(app)
      .post('/api/platform-choice/recommend')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send(RECOMMEND_BODY);
    expect(dev.status).toBe(201);

    const foreign = await request(app)
      .post('/api/platform-choice/recommend')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .send(RECOMMEND_BODY);
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('CSRF_REJECTED');
  });

  it('degrades (does not fail) when the Mini CCT analysis is unavailable', async () => {
    analysisFails = true;
    try {
      const cookie = await login();
      const res = await request(app)
        .post('/api/platform-choice/recommend')
        .set('Cookie', cookie)
        .send({ ...RECOMMEND_BODY, likelyToSwitch: 'yes' });
      expect(res.status).toBe(201);
      expect(res.body.recommendation.notes.some((n) => n.includes('Mini CCT'))).toBe(true);
    } finally {
      analysisFails = false;
    }
  });

  it('resolves affiliate URL overrides over the plain website', async () => {
    const previous = process.env.PLATFORM_CHOICE_AFFILIATE_URL_MARROW;
    process.env.PLATFORM_CHOICE_AFFILIATE_URL_MARROW = 'https://partner.example.com/marrow?ref=eyeconic';
    try {
      const cookie = await login();
      const res = await request(app)
        .post('/api/platform-choice/recommend')
        .set('Cookie', cookie)
        .send(RECOMMEND_BODY);
      expect(res.status).toBe(201);
      const marrow = res.body.recommendation.tiers.find((t) => t.platform.key === 'marrow');
      expect(marrow.platform.visitUrl).toBe('https://partner.example.com/marrow?ref=eyeconic');
    } finally {
      if (previous === undefined) delete process.env.PLATFORM_CHOICE_AFFILIATE_URL_MARROW;
      else process.env.PLATFORM_CHOICE_AFFILIATE_URL_MARROW = previous;
    }
  });

  it('does NOT serve a recommendation when persistence fails', async () => {
    const PlatformChoiceQuery = require('../models/PlatformChoiceQuery');
    const spy = jest.spyOn(PlatformChoiceQuery, 'create').mockRejectedValueOnce(new Error('db down'));
    const cookie = await login();
    const res = await request(app)
      .post('/api/platform-choice/recommend')
      .set('Cookie', cookie)
      .send(RECOMMEND_BODY);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('RECOMMENDATION_NOT_STORED');
    expect(res.body.recommendationId).toBeUndefined();
  });

  it('surfaces the latest saved recommendation on GET /context', async () => {
    const cookie = await login();
    const res = await request(app).get('/api/platform-choice/context').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.latest).not.toBeNull();
    expect(res.body.latest.tiers.length).toBe(3);
    expect(typeof res.body.latest.tiers[0].platformName).toBe('string');
  });

  it('rate-limits abuse (429 after the per-user budget)', async () => {
    const PlatformChoiceQuery = require('../models/PlatformChoiceQuery');
    // Dedicated user so the shared budget other tests rely on is untouched.
    const cookie = await login(STUDENT2.email);
    let saw429 = false;
    const createSpy = jest.spyOn(PlatformChoiceQuery, 'create').mockResolvedValue({ _id: 'x' });
    for (let i = 0; i < 70 && !saw429; i += 1) {
      const res = await request(app)
        .post('/api/platform-choice/recommend')
        .set('Cookie', cookie)
        .send(RECOMMEND_BODY);
      if (res.status === 429) saw429 = true;
    }
    createSpy.mockRestore();
    expect(saw429).toBe(true);
  });
});
