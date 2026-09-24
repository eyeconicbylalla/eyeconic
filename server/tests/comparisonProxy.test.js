/**
 * Integration tests for the cohort-comparison proxy route
 * (/api/app/analytics/me/comparison) against a mock of the App API's
 * student comparison contract.
 */

const http = require('http');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const STUDENT_TOKEN = 'app-user-jwt-for-student';
const STUDENT = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test Student',
  email: 'student@example.com',
  role: 'student',
  isFreeUser: false,
};

const comparisonPayload = {
  hasEligibleAttempt: true,
  quiz: {
    _id: '507f1f77bcf86cd799439077',
    title: 'NEET PG Grand Test 01',
    testType: 'grand',
    totalMarks: 200,
  },
  attempt: {
    _id: '507f1f77bcf86cd799439088',
    status: 'completed',
    endTime: '2026-09-20T10:00:00.000Z',
    marksObtained: 72,
    totalMarks: 200,
    scorePercentage: 36,
    accuracy: 45,
    correct: 42,
    incorrect: 48,
    skipped: 10,
    attempted: 90,
    totalQuestions: 100,
  },
  cohort: {
    totalStudents: 18,
    minCohortSize: 5,
    sufficient: true,
    averageMarks: 61.4,
    averageScorePercentage: 30.7,
    highestMarks: 168,
    percentile: 76.67,
    topPercent: 23.33,
    scoreDistribution: [
      { label: '0–20%', min: 0, max: 20, count: 3 },
      { label: '21–40%', min: 21, max: 40, count: 6 },
      { label: '41–60%', min: 41, max: 60, count: 5 },
      { label: '61–80%', min: 61, max: 80, count: 3 },
      { label: '81–100%', min: 81, max: 100, count: 1 },
    ],
    subjectWise: [
      { subjectName: 'Anatomy', questionCount: 20, myMarks: 14, myCorrect: 4, myIncorrect: 5, mySkipped: 11, avgMarks: 12.2, cohortAttempts: 18 },
    ],
  },
  generatedAt: '2026-09-24T10:00:00.000Z',
};

let app;
let mockAppApi;
let mongoServer;

let observed = { auth: null, query: null, upstreamStatus: 200 };

function startMockAppApi() {
  return new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());

    const requireUser = (req, res, next) => {
      observed.auth = req.header('Authorization');
      if (req.header('Authorization') !== `Bearer ${STUDENT_TOKEN}`) {
        return res.status(401).json({ message: 'Token is not valid.' });
      }
      next();
    };

    mock.post('/auth/login', (_req, res) =>
      res.json({ token: STUDENT_TOKEN, user: STUDENT, linkedAttempts: 0 })
    );

    mock.get('/auth/me', requireUser, (_req, res) => res.json(STUDENT));

    mock.get('/quizzes/analytics/me/comparison', requireUser, (req, res) => {
      observed.query = req.query;
      if (observed.upstreamStatus === 500) {
        return res.status(500).json({ message: 'upstream blew up' });
      }
      res.json(comparisonPayload);
    });

    const server = mock.listen(0, () => resolve(server));
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
  process.env.SESSION_SECRET = 'y'.repeat(40);
  process.env.APP_LOGIN_MAX_PER_IP = '500';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

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

function extractSessionCookie(loginResponse) {
  const setCookie = loginResponse.headers['set-cookie'];
  if (!setCookie || !setCookie.length) return null;
  const cookie = setCookie.find((c) => c.slice(0, 'ec_app_session='.length) === 'ec_app_session=');
  return cookie ? cookie.split(';')[0] : null;
}

async function loginStudent() {
  const response = await request(app)
    .post('/api/app-auth/login')
    .send({ email: STUDENT.email, password: 'anything' });
  expect(response.status).toBe(200);
  return extractSessionCookie(response);
}

describe('Cohort comparison proxy', () => {
  let cookie;

  beforeAll(async () => {
    cookie = await loginStudent();
  });

  beforeEach(() => {
    observed = { auth: null, query: null, upstreamStatus: 200 };
  });

  it('requires an app session', async () => {
    const res = await request(app).get('/api/app/analytics/me/comparison');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('APP_SESSION_REQUIRED');
  });

  it('proxies the comparison with the session token and no query params', async () => {
    const res = await request(app)
      .get('/api/app/analytics/me/comparison?limit=99&studentId=other')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.quiz.title).toBe(comparisonPayload.quiz.title);
    expect(res.body.cohort.percentile).toBe(comparisonPayload.cohort.percentile);
    expect(observed.auth).toBe(`Bearer ${STUDENT_TOKEN}`);
    expect(observed.query).toEqual({});
  });

  it('maps upstream 5xx to 503 APP_UNAVAILABLE', async () => {
    observed.upstreamStatus = 500;
    const res = await request(app)
      .get('/api/app/analytics/me/comparison')
      .set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('APP_UNAVAILABLE');
  });

  it('still 404s unknown analytics paths (no passthrough)', async () => {
    const res = await request(app)
      .get('/api/app/analytics/me/comparison/extra')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
