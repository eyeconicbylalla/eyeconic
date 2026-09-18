/**
 * TRUE end-to-end integration test: the website server talks to the REAL
 * Eyeconic App backend (../eyeconic-app) running in-process against an
 * in-memory MongoDB — no mocks between the two servers.
 *
 * Covers the Phase 2 flows at the API level:
 *   Flow A/B — website login → quiz list → start → answer → submit →
 *              results → analytics, all stored/graded by the real backend.
 *   Flow C   — app → website handoff: a code minted by the app's
 *              /auth/web-handoff logs the browser session into the website.
 *   Sync     — a submission made directly against the app API (as the mobile
 *              app would) is visible through the website proxy.
 *   Security — cross-user access and service-token abuse are rejected.
 *
 * Skips automatically when the sibling app repository is not checked out.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const APP_BACKEND_DIR = path.resolve(__dirname, '..', '..', '..', 'eyeconic-app', 'backend');
const hasAppRepo = fs.existsSync(path.join(APP_BACKEND_DIR, 'server.js'));
const describeE2e = hasAppRepo ? describe : describe.skip;

jest.setTimeout(180000);

const SERVICE_TOKEN = 'e2e-service-token-0123456789abcdef0123456789abcdef';
const STUDENT_PASSWORD = 'student-pass-123';

let appBackendServer;      // real app backend on an ephemeral port
let appBackend;            // supertest agent for the app backend (acts as the mobile app)
let websiteApp;            // the website server (real routes)
let websiteMongo;
let db;                    // app backend db helpers
let admin;
let student;
let otherStudent;
let quiz;
let questions;

function requireFromAppBackend(relPath) {
  return require(path.join(APP_BACKEND_DIR, relPath));
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  // Shared by both servers in this single process (separate deployments in
  // production, each with their own secret).
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-jwt-secret-0123456789abcdef';
  process.env.SESSION_SECRET = 'e2e-session-secret-0123456789abcdef';
  process.env.APP_INTEGRATION_TOKEN = SERVICE_TOKEN;
  process.env.INTEGRATION_SERVICE_TOKEN = SERVICE_TOKEN;
  process.env.APP_LOGIN_MAX_PER_IP = '500';

  // ---- Real app backend (its own mongoose instance + in-memory Mongo) ----
  db = requireFromAppBackend('tests/helpers/db');
  await db.connect();

  const requestIdMw = requireFromAppBackend('middleware/requestId');
  const authRoutes = requireFromAppBackend('routes/auth');
  const quizRoutes = requireFromAppBackend('routes/quizzes');
  const questionBankRoutes = requireFromAppBackend('routes/question-bank');
  const subjectRoutes = requireFromAppBackend('routes/subjects');
  const integrationRoutes = requireFromAppBackend('routes/integration');

  const backendApp = express();
  backendApp.use(express.json({ limit: '50mb' }));
  backendApp.use(requestIdMw);
  backendApp.use('/api/auth', authRoutes);
  backendApp.use('/api/quizzes', quizRoutes);
  backendApp.use('/api/question-bank', questionBankRoutes);
  backendApp.use('/api/subjects', subjectRoutes);
  backendApp.use('/api/integration/v1', integrationRoutes);

  appBackendServer = http.createServer(backendApp);
  await new Promise((resolve) => appBackendServer.listen(0, resolve));
  const backendPort = appBackendServer.address().port;
  process.env.APP_API_BASE_URL = `http://127.0.0.1:${backendPort}/api`;
  appBackend = request(backendApp);

  // ---- Website server (its own mongoose instance + in-memory Mongo) ----
  websiteMongo = await MongoMemoryServer.create();
  await mongoose.connect(websiteMongo.getUri());
  websiteApp = require('../server');
});

afterAll(async () => {
  if (appBackendServer) {
    await new Promise((resolve) => appBackendServer.close(resolve));
  }
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  if (websiteMongo) await websiteMongo.stop();
  if (db) await db.closeDatabase();
});

beforeEach(async () => {
  await db.clearDatabase();

  const { createUser, createSubject } = requireFromAppBackend('tests/helpers/testApp');
  const Quiz = requireFromAppBackend('models/Quiz');
  const QuestionBank = requireFromAppBackend('models/QuestionBank');
  const bcrypt = requireFromAppBackend('node_modules/bcryptjs');

  admin = await createUser({ role: 'admin', name: 'E2E Admin' });
  student = await createUser({ role: 'student', name: 'E2E Student' });
  otherStudent = await createUser({ role: 'student', name: 'E2E Other' });

  // createUser's helper doesn't hash the password — set one the real login
  // route can verify.
  const User = requireFromAppBackend('models/User');
  const hash = await bcrypt.hash(STUDENT_PASSWORD, 10);
  await User.updateOne({ _id: student.user._id }, { $set: { password: hash } });
  await User.updateOne({ _id: otherStudent.user._id }, { $set: { password: hash } });

  const subject = await createSubject('E2E Pathology');

  const mkQuestion = async (overrides = {}) =>
    QuestionBank.create({
      subject: subject._id,
      topicName: 'E2E Topic',
      subtopicName: 'E2E Subtopic',
      system: 'E2E System',
      questionType: 'mcq_single',
      difficulty: 'easy',
      question: `E2E question ${Math.random().toString(36).slice(2)}?`,
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      correctAnswer: 1,
      explanation: 'Because E2E.',
      ...overrides,
    });

  questions = [
    await mkQuestion(),
    await mkQuestion({ questionType: 'multiple_correct', options: ['A', 'B', 'C'], correctAnswer: [0, 2] }),
    await mkQuestion(),
  ];

  quiz = await Quiz.create({
    title: `E2E Grand Test ${Date.now()}`,
    subject: subject._id,
    testType: 'grand',
    duration: 30,
    questions: questions.map((q) => q._id),
    positiveMarks: 4,
    negativeMarks: 1,
    assignedStudents: [student.user._id],
    createdBy: admin.user._id,
  });
});

function extractSessionCookie(response) {
  const setCookie = response.headers['set-cookie'];
  const cookie = (setCookie || []).find((c) => c.startsWith('ec_app_session='));
  return cookie ? cookie.split(';')[0] : null;
}

describeE2e('Website ↔ App backend end-to-end (real backend, no mocks)', () => {
  it('Flow B: website login → list → detail → start → answer → submit → results → analytics', async () => {
    // 1. Login through the website against the real app backend.
    const login = await request(websiteApp)
      .post('/api/app-auth/login')
      .send({ email: student.user.email, password: STUDENT_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(String(student.user._id));
    const cookie = extractSessionCookie(login);
    expect(cookie).toBeTruthy();

    // 2. Quiz list contains the assigned grand test.
    const list = await request(websiteApp).get('/api/app/quizzes').set('Cookie', cookie);
    expect(list.status).toBe(200);
    const listed = list.body.find((q) => String(q._id) === String(quiz._id));
    expect(listed).toBeTruthy();
    expect(listed.testType).toBe('grand');
    expect(listed.attemptStatus.hasAttempted).toBe(false);

    // 3. Detail exposes questions but never the answer key.
    const detail = await request(websiteApp)
      .get(`/api/app/quizzes/${quiz._id}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.questions).toHaveLength(3);
    for (const question of detail.body.questions) {
      expect(question.correctAnswer).toBeUndefined();
      expect(question.explanation).toBeUndefined();
    }

    // 4. Start.
    const start = await request(websiteApp)
      .post(`/api/app/quizzes/${quiz._id}/start`)
      .set('Cookie', cookie)
      .send({});
    expect(start.status).toBe(200);
    const attemptId = start.body.attemptId;
    expect(attemptId).toBeTruthy();

    // 5. Answer (correct mcq, partial multiple-correct, skip one).
    const answer1 = await request(websiteApp)
      .put(`/api/app/quizzes/${quiz._id}/attempt/${attemptId}/answer`)
      .set('Cookie', cookie)
      .send({ questionIndex: 0, questionId: String(questions[0]._id), selectedAnswer: 1, timeSpent: 20 });
    expect(answer1.status).toBe(200);

    const answer2 = await request(websiteApp)
      .put(`/api/app/quizzes/${quiz._id}/attempt/${attemptId}/answer`)
      .set('Cookie', cookie)
      .send({ questionIndex: 1, questionId: String(questions[1]._id), selectedAnswer: [0], timeSpent: 30 });
    expect(answer2.status).toBe(200);

    // 6. Submit — server-side grading (not client-supplied scores).
    const submit = await request(websiteApp)
      .post(`/api/app/quizzes/${quiz._id}/attempt/${attemptId}/submit`)
      .set('Cookie', cookie)
      .send({ isAutoSubmit: false });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe('completed');
    expect(submit.body.totalQuestions).toBe(3);
    expect(submit.body.marksObtained).toBe(3); // +4 correct, -1 wrong, 0 skipped

    // 7. Results with solutions (quiz.shareSolution defaults true).
    const results = await request(websiteApp)
      .get(`/api/app/quizzes/${quiz._id}/attempt/${attemptId}/results`)
      .query({ groupBy: 'section' })
      .set('Cookie', cookie);
    expect(results.status).toBe(200);
    expect(results.body.summary.totalQuestions).toBe(3);
    expect(results.body.attempt._id).toBe(attemptId);

    // 8. Analytics reflect the same attempt.
    const analytics = await request(websiteApp)
      .get('/api/app/analytics/me')
      .set('Cookie', cookie);
    expect(analytics.status).toBe(200);
    expect(
      analytics.body.attempts.some((a) => String(a._id) === String(attemptId))
    ).toBe(true);
  });

  it('Flow C: app → website handoff mints a website session from a one-time code', async () => {
    // The mobile app creates a handoff code with its own JWT.
    const handoff = await appBackend
      .post('/api/auth/web-handoff')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ dest: '/tests' });
    expect(handoff.status).toBe(200);
    expect(handoff.body.url).toContain('/app-link?code=');

    // The website exchanges the code server-to-server and sets its session.
    const exchange = await request(websiteApp)
      .post('/api/app-auth/handoff')
      .send({ code: handoff.body.code, dest: '/tests' });
    expect(exchange.status).toBe(200);
    expect(exchange.body.user.id).toBe(String(student.user._id));
    const cookie = extractSessionCookie(exchange);
    expect(cookie).toBeTruthy();

    // The session works for data calls — identity is the same student.
    const list = await request(websiteApp).get('/api/app/quizzes').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.some((q) => String(q._id) === String(quiz._id))).toBe(true);

    // The code can never be replayed.
    const replay = await request(websiteApp)
      .post('/api/app-auth/handoff')
      .send({ code: handoff.body.code });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('HANDOFF_INVALID');
  });

  it('Sync: a submission made by the mobile app is visible on the website', async () => {
    // Mobile app path: login directly against the app backend.
    const appLogin = await appBackend
      .post('/api/auth/login')
      .send({ email: student.user.email, password: STUDENT_PASSWORD });
    expect(appLogin.status).toBe(200);
    const appToken = appLogin.body.token;

    const appStart = await appBackend
      .post(`/api/quizzes/${quiz._id}/start`)
      .set('Authorization', `Bearer ${appToken}`);
    expect(appStart.status).toBe(201);
    const attemptId = appStart.body.attemptId;

    await appBackend
      .put(`/api/quizzes/${quiz._id}/attempt/${attemptId}/answer`)
      .set('Authorization', `Bearer ${appToken}`)
      .send({ questionIndex: 0, questionId: String(questions[0]._id), selectedAnswer: 1 })
      .expect(200);

    const appSubmit = await appBackend
      .post(`/api/quizzes/${quiz._id}/attempt/${attemptId}/submit`)
      .set('Authorization', `Bearer ${appToken}`)
      .send({});
    expect(appSubmit.status).toBe(200);
    expect(appSubmit.body.status).toBe('completed');

    // Website sees the mobile-made attempt immediately.
    const login = await request(websiteApp)
      .post('/api/app-auth/login')
      .send({ email: student.user.email, password: STUDENT_PASSWORD });
    const cookie = extractSessionCookie(login);

    // Bypass the 10s quiz-list cache by reading the quiz detail directly.
    const detail = await request(websiteApp)
      .get(`/api/app/quizzes/${quiz._id}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.attemptStatus.hasAttempted).toBe(true);
    expect(detail.body.attemptStatus.attemptId).toBe(String(attemptId));

    // And the website can fetch the result the app produced.
    const results = await request(websiteApp)
      .get(`/api/app/quizzes/${quiz._id}/attempt/${attemptId}/results`)
      .set('Cookie', cookie);
    expect(results.status).toBe(200);
    expect(results.body.attempt._id).toBe(String(attemptId));
  });

  it('Security: a student cannot read another student’s results through the proxy', async () => {
    const victimLogin = await request(websiteApp)
      .post('/api/app-auth/login')
      .send({ email: student.user.email, password: STUDENT_PASSWORD });
    const victimCookie = extractSessionCookie(victimLogin);

    const start = await request(websiteApp)
      .post(`/api/app/quizzes/${quiz._id}/start`)
      .set('Cookie', victimCookie)
      .send({});
    expect(start.status).toBe(200);

    const attackerLogin = await request(websiteApp)
      .post('/api/app-auth/login')
      .send({ email: otherStudent.user.email, password: STUDENT_PASSWORD });
    const attackerCookie = extractSessionCookie(attackerLogin);

    const attemptId = start.body.attemptId;
    const crossed = await request(websiteApp)
      .get(`/api/app/quizzes/${quiz._id}/attempt/${attemptId}/results`)
      .set('Cookie', attackerCookie);
    expect([403, 404]).toContain(crossed.status);

    // The attacker (not assigned) cannot even open the quiz detail.
    const quizDetail = await request(websiteApp)
      .get(`/api/app/quizzes/${quiz._id}`)
      .set('Cookie', attackerCookie);
    expect(quizDetail.status).toBe(403);

    // And cannot start it.
    const startDenied = await request(websiteApp)
      .post(`/api/app/quizzes/${quiz._id}/start`)
      .set('Cookie', attackerCookie)
      .send({});
    expect(startDenied.status).toBe(403);
  });

  it('Security: the website proxy cannot call admin-only app endpoints', async () => {
    const login = await request(websiteApp)
      .post('/api/app-auth/login')
      .send({ email: student.user.email, password: STUDENT_PASSWORD });
    const cookie = extractSessionCookie(login);

    // Admin endpoint shape through the proxy surface → 404 (not allowlisted).
    const analyticsCsv = await request(websiteApp)
      .get('/api/app/quizzes/analytics/csv')
      .set('Cookie', cookie);
    expect(analyticsCsv.status).toBe(404);
  });
});
