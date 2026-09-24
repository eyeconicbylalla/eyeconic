/**
 * Integration tests for the Mini CCT proxy routes (/api/app/mini-cct/*)
 * against a mock of the App API's mini-cct contract.
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

const ATTEMPT_ID = '507f1f77bcf86cd799439077';

const latestPayload = {
  quiz: {
    _id: '507f1f77bcf86cd799439088',
    title: 'Mini CCT #1',
    testType: 'mini',
    duration: 30,
    totalMarks: 120,
    questionCount: 30,
    subjectNames: ['PSYCHIATRY', 'DERMATOLOGY', 'ORTHOPAEDICS'],
    attemptStatus: { hasAttempted: true, attemptId: ATTEMPT_ID, status: 'completed' },
  },
};

const analysisPayload = {
  quiz: { _id: '507f1f77bcf86cd799439088', title: 'Mini CCT #1', testType: 'mini' },
  summary: { correct: 15, incorrect: 10, skipped: 5, totalQuestions: 30 },
  subjects: [{ subjectName: 'PSYCHIATRY', accuracy: 70, cohortAvgAccuracy: 60 }],
  cohort: { sufficient: true, percentile: 72.5 },
  access: { level: 'full', gatedSections: [] },
};

let app;
let mockAppApi;
let mongoServer;

let observed = { auth: null, query: null, analysisStatus: 200 };

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

    mock.get('/mini-cct/latest', requireUser, (_req, res) => res.json(latestPayload));

    mock.get('/mini-cct/attempts', requireUser, (req, res) => {
      observed.query = req.query;
      res.json({
        attempts: [{ _id: ATTEMPT_ID, quizTitle: 'Mini CCT #1', marksObtained: 49, totalMarks: 120 }],
        total: 1,
        page: 1,
        pages: 1,
      });
    });

    mock.get('/mini-cct/attempts/:attemptId/analysis', requireUser, (req, res) => {
      if (req.params.attemptId !== ATTEMPT_ID) {
        return res.status(404).json({ message: 'Attempt not found', code: 'ATTEMPT_NOT_FOUND' });
      }
      if (observed.analysisStatus === 500) {
        return res.status(500).json({ message: 'upstream blew up' });
      }
      res.json(analysisPayload);
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
  const cookie = setCookie.find((c) => String(c).slice(0, 'ec_app_session='.length) === 'ec_app_session=');
  return cookie ? cookie.split(';')[0] : null;
}

async function loginStudent() {
  const response = await request(app)
    .post('/api/app-auth/login')
    .send({ email: STUDENT.email, password: 'anything' });
  expect(response.status).toBe(200);
  return extractSessionCookie(response);
}

describe('Mini CCT proxy', () => {
  let cookie;

  beforeAll(async () => {
    cookie = await loginStudent();
  });

  beforeEach(() => {
    observed = { auth: null, query: null, analysisStatus: 200 };
  });

  it('requires an app session for GET /latest', async () => {
    const res = await request(app).get('/api/app/mini-cct/latest');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('APP_SESSION_REQUIRED');
  });

  it('proxies GET /latest with the session token', async () => {
    const res = await request(app).get('/api/app/mini-cct/latest').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.quiz.title).toBe('Mini CCT #1');
    expect(res.body.quiz.questionCount).toBe(30);
    expect(observed.auth).toBe(`Bearer ${STUDENT_TOKEN}`);
  });

  it('whitelists history query params', async () => {
    const res = await request(app)
      .get('/api/app/mini-cct/attempts?page=2&limit=5&evil=1')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(observed.query).toEqual({ page: '2', limit: '5' });
  });

  it('validates attempt ids on the analysis route', async () => {
    const res = await request(app)
      .get('/api/app/mini-cct/attempts/not-an-object-id/analysis')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('proxies the analysis payload untouched', async () => {
    const res = await request(app)
      .get(`/api/app/mini-cct/attempts/${ATTEMPT_ID}/analysis`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.summary.correct).toBe(15);
    expect(res.body.access.level).toBe('full');
    // The proxy must not invent data: upstream nulls stay null.
    expect(res.body).toEqual(analysisPayload);
  });

  it('passes upstream 404 (foreign attempt) through', async () => {
    const res = await request(app)
      .get('/api/app/mini-cct/attempts/507f1f77bcf86cd799439099/analysis')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.appCode).toBe('ATTEMPT_NOT_FOUND');
  });

  it('maps upstream 5xx to 503 APP_UNAVAILABLE', async () => {
    observed.analysisStatus = 500;
    const res = await request(app)
      .get(`/api/app/mini-cct/attempts/${ATTEMPT_ID}/analysis`)
      .set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('APP_UNAVAILABLE');
  });

  it('404s unknown mini-cct paths (no passthrough)', async () => {
    const res = await request(app)
      .get('/api/app/mini-cct/generate')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
