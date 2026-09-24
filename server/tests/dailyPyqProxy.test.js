/**
 * Integration tests for the Daily PYQ proxy routes (/api/app/daily-pyq/*)
 * against a mock of the App API's daily-pyq contract.
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

const ATTEMPT_ID = '507f1f77bcf86cd799439044';

const todayPayload = {
  date: '2026-09-24',
  serverTime: '2026-09-24T10:00:00.000Z',
  totalQuestions: 10,
  status: 'pending',
  streak: { current: 3, best: 5 },
  questions: [
    {
      _id: '507f1f77bcf86cd799439055',
      question: 'Mock daily question',
      questionType: 'mcq_single',
      options: ['A', 'B', 'C', 'D'],
    },
  ],
  attempt: null,
};

const attemptPayload = {
  _id: ATTEMPT_ID,
  date: '2026-09-24',
  score: 31,
  maxScore: 40,
  correctCount: 8,
  incorrectCount: 1,
  skippedCount: 1,
  totalQuestions: 10,
  timeTakenSeconds: 300,
  answers: [],
};

let app;
let mockAppApi;
let mongoServer;

let observed = { auth: null, body: null, query: null, submitStatus: 200 };

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

    mock.get('/daily-pyq/today', requireUser, (_req, res) => {
      if (observed.submitStatus === 503) {
        return res.status(500).json({ message: 'upstream blew up' });
      }
      res.json(todayPayload);
    });

    mock.post('/daily-pyq/submit', requireUser, (req, res) => {
      observed.body = req.body;
      if (observed.submitStatus === 409) {
        return res
          .status(409)
          .json({ message: 'expired', code: 'DAILY_PYQ_DATE_MISMATCH', currentDate: '2026-09-25' });
      }
      res.status(201).json({ attempt: attemptPayload, duplicate: false, streak: { current: 4, best: 5 } });
    });

    mock.get('/daily-pyq/history', requireUser, (req, res) => {
      observed.query = req.query;
      res.json({ attempts: [attemptPayload], total: 1, page: 1, pages: 1 });
    });

    mock.get('/daily-pyq/attempts/:attemptId', requireUser, (req, res) => {
      if (req.params.attemptId !== ATTEMPT_ID) {
        return res.status(404).json({ message: 'Attempt not found.' });
      }
      res.json({ attempt: attemptPayload });
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
  const cookie = setCookie.find((c) => startsWith(c, 'ec_app_session='));
  return cookie ? cookie.split(';')[0] : null;
}

function startsWith(str, prefix) {
  return String(str).slice(0, prefix.length) === prefix;
}

async function loginStudent() {
  const response = await request(app)
    .post('/api/app-auth/login')
    .send({ email: STUDENT.email, password: 'anything' });
  expect(response.status).toBe(200);
  return extractSessionCookie(response);
}

describe('Daily PYQ proxy', () => {
  let cookie;

  beforeAll(async () => {
    cookie = await loginStudent();
  });

  beforeEach(() => {
    observed = { auth: null, body: null, query: null, submitStatus: 200 };
  });

  it('requires an app session for GET /today', async () => {
    const res = await request(app).get('/api/app/daily-pyq/today');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('APP_SESSION_REQUIRED');
  });

  it('proxies GET /today with the session token', async () => {
    const res = await request(app).get('/api/app/daily-pyq/today').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(todayPayload.date);
    expect(res.body.questions[0]._id).toBe(todayPayload.questions[0]._id);
    expect(observed.auth).toBe(`Bearer ${STUDENT_TOKEN}`);
  });

  it('validates the submit body before proxying', async () => {
    const badDate = await request(app)
      .post('/api/app/daily-pyq/submit')
      .set('Cookie', cookie)
      .send({ date: 'not-a-date', answers: [] });
    expect(badDate.status).toBe(400);
    expect(badDate.body.code).toBe('VALIDATION_ERROR');

    const badAnswers = await request(app)
      .post('/api/app/daily-pyq/submit')
      .set('Cookie', cookie)
      .send({ date: '2026-09-24', answers: { evil: true } });
    expect(badAnswers.status).toBe(400);
  });

  it('forwards whitelisted submit fields upstream', async () => {
    const res = await request(app)
      .post('/api/app/daily-pyq/submit')
      .set('Cookie', cookie)
      .send({
        date: '2026-09-24',
        timeTakenSeconds: 245.8,
        answers: [{ questionId: '507f1f77bcf86cd799439055', selectedAnswer: 2 }],
        malicious: 'drop tables',
      });
    expect(res.status).toBe(200); // proxy normalises proxied successes to 200
    expect(res.body.attempt._id).toBe(ATTEMPT_ID);
    expect(observed.body).toEqual({
      date: '2026-09-24',
      timeTakenSeconds: 246,
      answers: [{ questionId: '507f1f77bcf86cd799439055', selectedAnswer: 2 }],
    });
  });

  it('rejects cross-origin submits (CSRF guard)', async () => {
    const res = await request(app)
      .post('/api/app/daily-pyq/submit')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .send({ date: '2026-09-24', answers: [] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REJECTED');
  });

  it('passes upstream 409 (date rollover) through to the client', async () => {
    observed.submitStatus = 409;
    const res = await request(app)
      .post('/api/app/daily-pyq/submit')
      .set('Cookie', cookie)
      .send({ date: '2026-09-24', answers: [] });
    expect(res.status).toBe(409);
    expect(res.body.appCode).toBe('DAILY_PYQ_DATE_MISMATCH');
    expect(res.body.currentDate).toBe('2026-09-25');
  });

  it('maps upstream 5xx to 503 APP_UNAVAILABLE', async () => {
    observed.submitStatus = 503;
    const res = await request(app).get('/api/app/daily-pyq/today').set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('APP_UNAVAILABLE');
  });

  it('whitelists history query params', async () => {
    const res = await request(app)
      .get('/api/app/daily-pyq/history?page=2&limit=5&evil=1')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(observed.query).toEqual({ page: '2', limit: '5' });
  });

  it('validates attempt ids', async () => {
    const res = await request(app)
      .get('/api/app/daily-pyq/attempts/not-an-object-id')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('proxies attempt detail', async () => {
    const res = await request(app)
      .get(`/api/app/daily-pyq/attempts/${ATTEMPT_ID}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.attempt.score).toBe(31);
  });

  it('404s unknown daily-pyq paths (no passthrough)', async () => {
    const res = await request(app)
      .get('/api/app/daily-pyq/secret-admin-thing')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
