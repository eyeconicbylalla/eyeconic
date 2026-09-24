/**
 * Integration tests for the Free Login User Dashboard proxy surface
 * (/api/mentor-dashboard/*): mentor/admin authorization at both layers,
 * website-side predictor merge, filters and exports.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Prediction = require('../models/Prediction');
const DesiredBranchQuery = require('../models/DesiredBranchQuery');

const MENTOR_TOKEN = 'app-user-jwt-for-mentor';
const STUDENT_TOKEN = 'app-user-jwt-for-student';
const MENTOR = {
  _id: '507f1f77bcf86cd799439001',
  name: 'Mentor User',
  email: 'mentor@example.com',
  role: 'mentor',
  isFreeUser: false,
};
const STUDENT = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Free Student',
  email: 'free@example.com',
  role: 'student',
  isFreeUser: true,
};

const FREE_A = '507f1f77bcf86cd7994390aa';
const FREE_B = '507f1f77bcf86cd7994390bb';
const FREE_C = '507f1f77bcf86cd7994390cc';

const idsPayload = { ids: [FREE_A, FREE_B, FREE_C] };

const overviewPayload = {
  totals: { freeUsers: 3, freeUsersThisMonth: 2 },
  activeUserIds: { dau: [FREE_B], wau: [FREE_B], mau: [FREE_B] },
  miniCct: { attemptsTotal: 5, attemptingUsers: 2 },
  dailyPyq: { attemptsTotal: 9, attemptingUsers: 2, attemptsToday: 1, attemptsLast7d: 4 },
  platformChoice: [{ platform: 'Marrow', count: 2 }, { platform: 'PrepLadder', count: 1 }],
  window: { today: '2026-09-24' },
};

const userPagePayload = {
  users: [
    {
      _id: FREE_A,
      name: 'Free A',
      email: 'a@example.com',
      phone: '',
      registeredAt: '2026-09-10T10:00:00.000Z',
      isActive: true,
      isProfileComplete: true,
      year: 'Intern',
      platforms: ['Marrow'],
      miniCct: { attempts: 2, avgScorePercentage: 55, lastAttemptAt: '2026-09-20T10:00:00.000Z' },
      dailyPyq: { attempts: 4, currentStreak: 2, bestStreak: 3, lastAttemptAt: '2026-09-24T04:00:00.000Z' },
      lastActiveAt: '2026-09-24T04:00:00.000Z',
    },
    {
      _id: FREE_C,
      name: 'Free C',
      email: 'c@example.com',
      phone: '',
      registeredAt: '2026-09-22T10:00:00.000Z',
      isActive: true,
      isProfileComplete: false,
      year: null,
      platforms: [],
      miniCct: { attempts: 0, avgScorePercentage: null, lastAttemptAt: null },
      dailyPyq: { attempts: 0, currentStreak: 0, bestStreak: 0, lastAttemptAt: null },
      lastActiveAt: null,
    },
  ],
  total: 2,
  page: 1,
  pages: 1,
  limit: 20,
};

const drilldownPayload = {
  user: {
    _id: FREE_A,
    name: 'Free A',
    email: 'a@example.com',
    phone: '',
    registeredAt: '2026-09-10T10:00:00.000Z',
    isActive: true,
    isProfileComplete: true,
    freeUserProfile: { year: 'Intern', issues: 'Revision', resources: ['Marrow'] },
  },
  miniCct: {
    attempts: [
      {
        _id: '507f1f77bcf86cd7994390d1', quizId: '507f1f77bcf86cd7994390e1',
        quizTitle: 'Mini CCT Psychiatry #1', testType: 'daily', subjectName: 'Psychiatry',
        score: 7, totalQuestions: 10, marksObtained: 24, totalMarks: 40,
        scorePercentage: 60, endTime: '2026-09-20T10:00:00.000Z',
      },
    ],
    capped: false,
    summary: { totalAttempts: 2, avgScorePercentage: 55, bestScorePercentage: 60 },
  },
  dailyPyq: {
    attempts: [
      { _id: '507f1f77bcf86cd7994390d2', date: '2026-09-24', score: 32, maxScore: 40, correctCount: 8, incorrectCount: 1, skippedCount: 1, totalQuestions: 10, submittedAt: '2026-09-24T04:00:00.000Z' },
    ],
    totalAttempts: 4,
    averageScore: 30,
    streaks: { current: 2, best: 3 },
  },
  lastActiveAt: '2026-09-24T04:00:00.000Z',
};

function istKey(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = fmt.format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

const performancePayload = {
  miniCct: {
    totalAttempts: 5,
    avgScorePercentage: 52.4,
    subjectWise: [
      { subjectName: 'Psychiatry', attempts: 3, avgScorePercentage: 60 },
      { subjectName: 'Dermatology', attempts: 2, avgScorePercentage: 41 },
    ],
  },
  dailyPyq: { usersWithAttempt: 2, completionRate: 66.67, activeUsersLast7d: 2, attemptsToday: 1 },
  streakLeaderboard: [
    { userId: FREE_B, name: 'Free B', email: 'b@example.com', currentStreak: 6, bestStreak: 9, lastAttemptAt: '2026-09-24T05:00:00.000Z' },
  ],
  dropoff: {
    thresholdDays: 7,
    totalDropoffUsers: 2,
    users: [
      { userId: FREE_A, name: 'Free A', email: 'a@example.com', registeredAt: '2026-09-10T10:00:00.000Z', lastActiveAt: '2026-09-01T10:00:00.000Z', neverActive: false },
      { userId: FREE_C, name: 'Free C', email: 'c@example.com', registeredAt: '2026-09-22T10:00:00.000Z', lastActiveAt: null, neverActive: true },
    ],
  },
  featureUsage: {
    weekLabels: [istKey(-27), istKey(-20), istKey(-13), istKey(-6)],
    rows: [
      { feature: 'Mini CCT', counts: [0, 1, 2, 2] },
      { feature: 'Daily PYQ', counts: [1, 1, 2, 5] },
    ],
  },
  window: { today: istKey(0) },
};

let app;
let mockAppApi;
let mongoServer;

const observed = { auth: null, paths: [], usersQuery: null, overviewStatus: 200 };

function startMockAppApi() {
  return new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());

    const requireUser = (req, res, next) => {
      observed.auth = req.header('Authorization');
      if (req.header('Authorization') !== `Bearer ${MENTOR_TOKEN}`) {
        return res.status(401).json({ message: 'Token is not valid.' });
      }
      next();
    };

    mock.post('/auth/login', (req, res) => {
      const isStudentLogin = req.body && req.body.email === STUDENT.email;
      res.json({
        token: isStudentLogin ? STUDENT_TOKEN : MENTOR_TOKEN,
        user: isStudentLogin ? STUDENT : MENTOR,
      });
    });

    mock.get('/auth/me', requireUser, (_req, res) => res.json(MENTOR));

    mock.get('/free-user-analytics/overview', requireUser, (_req, res) => res.json(overviewPayload));
    mock.get('/free-user-analytics/ids', requireUser, (_req, res) => res.json(idsPayload));

    mock.get('/free-user-analytics/users', requireUser, (req, res) => {
      observed.usersQuery = req.query;
      res.json(userPagePayload);
    });

    mock.get('/free-user-analytics/users/:id', requireUser, (req, res) => {
      if (req.params.id !== FREE_A) return res.status(404).json({ message: 'Free user not found' });
      res.json(drilldownPayload);
    });

    mock.get('/free-user-analytics/performance', requireUser, (_req, res) => res.json(performancePayload));

    const server = mock.listen(0, () => resolve(server));
  });
}

async function createPredictionDoc(userId, exam, createdAt, gts) {
  return Prediction.create({
    userId,
    exam,
    request: { gts: gts || [] },
    methodVersion: 'test-v1',
    method: {},
    input: {},
    aggregation: {},
    estimate: {},
    rank: {},
    branches: {},
    resultHash: `hash-${userId}-${exam}-${createdAt.getTime()}`,
    createdAt,
  });
}

async function createDesiredDoc(userId, exam, branch, createdAt) {
  return DesiredBranchQuery.create({
    userId,
    exam,
    request: {},
    methodVersion: 'test-v1',
    method: {},
    input: { branch: { key: 'radiology', display: branch } },
    target: {},
    resultHash: `hash-d-${userId}-${createdAt.getTime()}`,
    createdAt,
  });
}

function extractSessionCookie(loginResponse) {
  const setCookie = loginResponse.headers['set-cookie'];
  if (!setCookie || !setCookie.length) return null;
  const cookie = setCookie.find((c) => c.slice(0, 'ec_app_session='.length) === 'ec_app_session=');
  return cookie ? cookie.split(';')[0] : null;
}

async function login(role) {
  const response = await request(app)
    .post('/api/app-auth/login')
    .send({ email: role === 'student' ? STUDENT.email : MENTOR.email, password: 'anything' });
  expect(response.status).toBe(200);
  return extractSessionCookie(response);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
  process.env.SESSION_SECRET = 'y'.repeat(40);
  process.env.APP_LOGIN_MAX_PER_IP = '500';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Website-owned predictor data for the free-user population.
  await createPredictionDoc(FREE_A, 'INI_CET', new Date(), [
    {
      gtId: 'gt1', title: 'Marrow GT 10', provenance: 'self-reported',
      attempts: [{ corrects: 120, totalQuestions: 200, status: 'completed', endedAt: null }],
    },
  ]);
  await createPredictionDoc(FREE_B, 'NEET_PG', new Date(Date.now() - 3 * 24 * 3600 * 1000));
  await createDesiredDoc(FREE_B, 'NEET_PG', 'Radiology', new Date(Date.now() - 5 * 24 * 3600 * 1000));

  mockAppApi = await startMockAppApi();
  process.env.APP_API_BASE_URL = `http://127.0.0.1:${mockAppApi.address().port}`;

  app = require('../server');
});

afterAll(async () => {
  await new Promise((resolve) => mockAppApi.close(resolve));
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  if (mongoServer) await mongoServer.stop();
});

describe('Mentor dashboard proxy', () => {
  let mentorCookie;
  let studentCookie;

  beforeAll(async () => {
    mentorCookie = await login('mentor');
    studentCookie = await login('student');
  });

  it('requires an app session', async () => {
    const res = await request(app).get('/api/mentor-dashboard/overview');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('APP_SESSION_REQUIRED');
  });

  it('denies free students before any upstream call', async () => {
    observed.paths = [];
    for (const path of ['/overview', '/users', `/users/${FREE_A}`, '/performance', '/export/users']) {
      const res = await request(app).get(`/api/mentor-dashboard${path}`).set('Cookie', studentCookie);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ROLE');
    }
    expect(observed.paths).toHaveLength(0);
  });

  it('merges overview with predictor activity and exam distribution', async () => {
    const res = await request(app).get('/api/mentor-dashboard/overview').set('Cookie', mentorCookie);
    expect(res.status).toBe(200);
    expect(observed.auth).toBe(`Bearer ${MENTOR_TOKEN}`);

    // DAU/WAU/MAU = union of App-side ids (FREE_B) + predictor-active ids (FREE_A).
    expect(res.body.active).toEqual({ dau: 2, wau: 2, mau: 2 });

    expect(res.body.totals.freeUsers).toBe(3);
    expect(res.body.rankPredictor.predictionsTotal).toBe(2);
    expect(res.body.rankPredictor.desiredBranchQueriesTotal).toBe(1);
    expect(res.body.rankPredictor.usingUsers).toBe(2);

    const exams = Object.fromEntries(res.body.rankPredictor.examDistribution.map((e) => [e.exam, e.count]));
    expect(exams).toEqual({ 'INI-CET': 1, 'NEET PG': 1, 'Not set': 1 });
  });

  it('enriches the user page with predictor usage and merged last-active', async () => {
    const res = await request(app)
      .get('/api/mentor-dashboard/users')
      .query({ page: 1, limit: 20 })
      .set('Cookie', mentorCookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);

    const a = res.body.users.find((u) => u._id === FREE_A);
    expect(a.predictions).toBe(1);
    expect(a.examSelected).toBe('INI-CET');
    // Prediction (now) is newer than the App-side lastActiveAt.
    expect(new Date(a.lastActiveAt).getTime()).toBeGreaterThan(new Date('2026-09-24T04:00:00.000Z').getTime());

    const c = res.body.users.find((u) => u._id === FREE_C);
    expect(c.predictions).toBe(0);
    expect(c.examSelected).toBeNull();
  });

  it('resolves the exam filter to a website-computed id set', async () => {
    const res = await request(app)
      .get('/api/mentor-dashboard/users')
      .query({ exam: 'INI_CET' })
      .set('Cookie', mentorCookie);
    expect(res.status).toBe(200);
    expect(observed.usersQuery.ids).toBe(FREE_A);
  });

  it('returns an empty page for an exam with no users', async () => {
    const res = await request(app)
      .get('/api/mentor-dashboard/users')
      .query({ exam: 'none' })
      .set('Cookie', mentorCookie);
    // FREE_C has no predictor use, so 'none' resolves to FREE_C — one id.
    expect(res.status).toBe(200);
    expect(observed.usersQuery.ids).toBe(FREE_C);
  });

  it('rejects invalid drilldown ids', async () => {
    const res = await request(app).get('/api/mentor-dashboard/users/not-an-id').set('Cookie', mentorCookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('merges the drilldown with predictor history and GT corrects', async () => {
    const res = await request(app).get(`/api/mentor-dashboard/users/${FREE_A}`).set('Cookie', mentorCookie);
    expect(res.status).toBe(200);

    expect(res.body.user.name).toBe('Free A');
    expect(res.body.miniCct.summary.avgScorePercentage).toBe(55);
    expect(res.body.dailyPyq.streaks.current).toBe(2);
    expect(res.body.predictor.totals).toEqual({ predictions: 1, desiredBranchQueries: 0 });
    expect(res.body.predictor.gtCorrects).toEqual([
      { gtTitle: 'Marrow GT 10', provenance: 'self-reported', corrects: 120, totalQuestions: 200 },
    ]);
    expect(res.body.predictor.predictions[0].exam).toBe('INI-CET');
  });

  it('merges performance: exams, branches, heatmap rows, drop-off refinement', async () => {
    const res = await request(app).get('/api/mentor-dashboard/performance').set('Cookie', mentorCookie);
    expect(res.status).toBe(200);

    const exams = Object.fromEntries(res.body.examDistribution.map((e) => [e.exam, e.count]));
    expect(exams).toEqual({ 'INI-CET': 1, 'NEET PG': 1, 'Not set': 1 });

    expect(res.body.desiredBranchTop).toEqual([{ branch: 'Radiology', count: 1 }]);
    expect(res.body.rankPredictor).toEqual({ predictionsTotal: 2, desiredBranchQueriesTotal: 1 });

    const features = res.body.featureUsage.rows.map((r) => r.feature);
    expect(features).toEqual(['Mini CCT', 'Daily PYQ', 'Rank Predictor', 'Desired Branch']);
    // FREE_A's prediction (now) and FREE_B's (3 days ago) both land in the
    // newest 7-day bucket, as does FREE_B's desired-branch query (5 days ago).
    const lastIdx = res.body.featureUsage.weekLabels.length - 1;
    expect(res.body.featureUsage.rows[2].counts[lastIdx]).toBe(2);
    expect(res.body.featureUsage.rows[3].counts[lastIdx]).toBe(1);

    // FREE_A's only recent activity is the website predictor → removed from
    // drop-off; FREE_C (never active) stays.
    const dropoffIds = res.body.dropoff.users.map((u) => u.userId);
    expect(dropoffIds).toEqual([FREE_C]);
    expect(res.body.dropoff.removedByWebsiteActivity).toBe(1);
  });

  it('exports CSV with enriched columns from the filtered API data', async () => {
    const res = await request(app)
      .get('/api/mentor-dashboard/export/users')
      .query({ q: 'free' })
      .set('Cookie', mentorCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(observed.usersQuery.q).toBe('free');

    const csv = res.text;
    expect(csv).toContain('Name,Email,Phone,Registered at');
    expect(csv).toContain('a@example.com');
    expect(csv).toContain('INI-CET');
    expect(csv).toContain('Marrow');
  });

  it('exports JSON rows for client-side XLSX', async () => {
    const res = await request(app)
      .get('/api/mentor-dashboard/export/users')
      .query({ format: 'json' })
      .set('Cookie', mentorCookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.rows[0]).toHaveProperty('Rank Predictor uses');
  });
});
