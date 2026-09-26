/**
 * Readiness Score — Phase 4 API tests (docs/READINESS_SCORE.md §26 Phase 4,
 * §22.4): the /api/predictor/readiness* surface against a mock of the real
 * App API and a live (in-memory) Mongo — mirroring predictorApi.test.js.
 *
 * §22.4 done-when covered here:
 *  - auth 401 on every readiness route; CSRF 403/allowed-origin shapes
 *  - calendar GET contract (announced/expected/null, horizon, version)
 *  - POST happy paths: both exams × both input modes, golden anchors,
 *    §10 arithmetic, engine-record parity (API serves the domain record
 *    unmodified), persist-before-serve incl. forced write failure
 *  - validation: INPUT_MODE_CONFLICT / SCORE_OUT_OF_RANGE / INVALID_INPUT
 *    field paths (pattern-derived bounds — the 180-question pin at API level)
 *  - server-authoritative derived values (smuggled fields are inert)
 *  - explicit-session planning mode + §18.2 session rollover (frozen clock)
 *  - NO_UPCOMING_EXAM 409; routine-empty calendar 200 (Phase-10a lesson)
 *  - retrieval: own-only 404, deterministic resultHash, tamper ⇒ matches:false
 *  - inherited warnings/coverage states + §18.3 extremes through the API
 *  - own rate budget (429)
 *
 * Real-clock tests assert date-robust invariants (self-consistent §10
 * arithmetic, parity with a direct engine call on the same IST day);
 * clock-frozen tests pin exact calendar values (rollover, horizon
 * exhaustion, seed resolution).
 *
 * POST budget note: readiness allows 30 POSTs/user/hour — STUDENT spends
 * ~20 happy-path posts, STUDENT3 carries the validation-error posts, and
 * STUDENT2 burns its own budget in the 429 test.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { computeReadiness, STATES: ENGINE_STATES } = require('../predictor/readiness');
const readinessCalendar = require('../predictor/readinessCalendar');
const { READINESS } = require('../predictor/config');
const ReadinessQuery = require('../models/ReadinessQuery');

const SERVICE_TOKEN = 's'.repeat(43);
const STUDENT_TOKEN = 'app-user-jwt-for-student';
const STUDENT2_TOKEN = 'app-user-jwt-for-student2';
const STUDENT3_TOKEN = 'app-user-jwt-for-student3';
const STUDENT = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test Student',
  email: 'student@example.com',
  role: 'student',
  isFreeUser: false,
};
const STUDENT2 = { ...STUDENT, _id: '507f1f77bcf86cd799439099', name: 'Second Student', email: 'student2@example.com' };
const STUDENT3 = { ...STUDENT, _id: '507f1f77bcf86cd799439088', name: 'Third Student', email: 'student3@example.com' };

const STATES = ['READY', 'MODERATELY_READY', 'BARELY_READY'];

let app;
let mockAppApi;
let mongoServer;

function startMockAppApi() {
  return new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());

    const users = {
      [STUDENT.email]: { user: STUDENT, token: STUDENT_TOKEN },
      [STUDENT2.email]: { user: STUDENT2, token: STUDENT2_TOKEN },
      [STUDENT3.email]: { user: STUDENT3, token: STUDENT3_TOKEN },
    };

    mock.post('/auth/login', (req, res) => {
      const { email, password } = req.body || {};
      const entry = users[email];
      if (entry && password === 'correct-password') {
        return res.json({ token: entry.token, user: entry.user, linkedAttempts: 0 });
      }
      return res.status(400).json({ message: 'Invalid email or password.' });
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
  // The persistence gate (re)connects via MONGO_URI on demand — set it so
  // dropped-connection behavior can self-heal like production.
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

/** POST /readiness shorthand. */
function postReadiness(cookie, body) {
  return request(app).post('/api/predictor/readiness').set('Cookie', cookie).send(body);
}

/** Civil-day difference of two ISO dates (UTC day arithmetic — TZ-free). */
const daysBetween = (fromIso, toIso) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);

/** The §10 state rule, recomputed from a served gap block (self-consistency). */
const stateForGap = (gapCorrects, budget) =>
  gapCorrects <= 0 ? 'READY' : gapCorrects <= budget ? 'MODERATELY_READY' : 'BARELY_READY';

/**
 * Freeze ONLY the clock (Date) for the requests fn issues — every timer stays
 * real so the HTTP + Mongo machinery keeps working. Real timers are restored
 * in `finally` even when later assertions fail.
 */
async function withFrozenClock(isoNow, fn) {
  jest.useFakeTimers({
    now: new Date(isoNow),
    doNotFake: [
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask',
      'performance', 'hrtime', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback',
    ],
  });
  try {
    return await fn();
  } finally {
    jest.useRealTimers();
  }
}

describe('readiness API — auth, CSRF, calendar', () => {
  it('requires the App session on every readiness route', async () => {
    expect((await request(app).get('/api/predictor/readiness/calendar')).status).toBe(401);
    expect((await postReadiness(null, { exam: 'NEET_PG', gts: [{ corrects: 100 }] })).status).toBe(401);
    expect(
      (await request(app).get('/api/predictor/readiness/507f1f77bcf86cd7994390ff')).status
    ).toBe(401);
  });

  it('serves the calendar snapshot (§15 shape, date-robust structural pins)', async () => {
    const cookie = await login();
    const res = await request(app).get('/api/predictor/readiness/calendar').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.calendarVersion).toBe(readinessCalendar.CALENDAR_VERSION);
    expect(Object.keys(res.body.exams).sort()).toEqual(['INI_CET', 'NEET_PG']);
    for (const examId of ['NEET_PG', 'INI_CET']) {
      const entry = res.body.exams[examId];
      expect(entry.horizonDays).toBe(READINESS.CALENDAR.HORIZON_DAYS);
      const next = entry.next;
      if (next === null) continue; // routine-empty (pinned exactly at a frozen instant below)
      expect(next).toMatchObject({
        exam: examId,
        session: expect.any(String),
        examDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        sourceUrl: expect.stringMatching(/^https:\/\//),
        verifiedAsOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        calendarVersion: readinessCalendar.CALENDAR_VERSION,
        horizonDays: READINESS.CALENDAR.HORIZON_DAYS,
      });
      expect(['announced', 'expected']).toContain(next.status);
      expect(Number.isInteger(next.daysRemaining)).toBe(true);
      expect(next.daysRemaining).toBeGreaterThanOrEqual(0);
      expect(next.monthsRemaining).toBeCloseTo(next.daysRemaining / 30.44, 10);
      const codes = next.warnings.map((w) => w.code);
      if (next.status === 'expected') {
        expect(codes).toContain('DATE_EXPECTED');
      } else {
        expect(codes).not.toContain('DATE_EXPECTED');
      }
    }
  });

  it('accepts the site’s own origins and rejects foreign ones (CSRF defence-in-depth)', async () => {
    const cookie = await login();
    const body = { exam: 'NEET_PG', gts: [{ corrects: 100 }] };
    const dev = await request(app)
      .post('/api/predictor/readiness')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send(body);
    expect(dev.status).toBe(201);
    const prod = await request(app)
      .post('/api/predictor/readiness')
      .set('Cookie', cookie)
      .set('Origin', 'https://www.eyeconicneetpg.com')
      .send(body);
    expect(prod.status).toBe(201);
    const evil = await request(app)
      .post('/api/predictor/readiness')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .send(body);
    expect(evil.status).toBe(403);
    expect(evil.body.code).toBe('CSRF_REJECTED');
  });
});

describe('readiness API — POST /readiness (persist before serve)', () => {
  it('serves the unmodified domain record for NEET PG corrects mode (golden anchors, R8)', async () => {
    const cookie = await login();
    const body = { exam: 'NEET_PG', gts: [{ corrects: 70 }, { corrects: 75 }] };
    const res = await postReadiness(cookie, body);
    expect(res.status).toBe(201);
    expect(res.body.persisted).toBe(true);
    expect(res.body.readinessId).toBeTruthy();

    const r = res.body.result;
    expect(STATES).toContain(r.state);
    expect(r.state).toBe('READY'); // c̄ = 72.5 ≥ 66 — date-independent
    expect(r.methodVersion).toBe(READINESS.METHOD_VERSION_NEET_PG);
    expect(r.examLabel).toBe('NEET PG');
    expect(r.method.timeAllowance).toEqual({
      provisional: true,
      rateCorrectsPerMonth: 6,
      capMonths: 9,
      note: READINESS.TIME_ALLOWANCE.NOTE,
    });
    // Phase-1/3 goldens through the API: QUALIFY 86c / ANY_SEAT 66c / STRONG 160c.
    expect(r.anchors.map((a) => [a.id, a.requiredCorrects])).toEqual([
      ['QUALIFY', 86],
      ['ANY_SEAT', 66],
      ['STRONG', 160],
    ]);
    expect(r.target).toMatchObject({ id: 'ANY_SEAT', rank: 182260, requiredCorrects: 66 });
    expect(r.input).toMatchObject({ mode: 'corrects', meanCorrects: 72.5 });
    expect(r.input.aggregation).toMatchObject({ n: 2, values: [70, 75] });
    // §10 arithmetic self-consistency against the served calendar (date-robust).
    expect(r.gap.budget).toBe(Math.floor(6 * Math.min(r.calendar.daysRemaining / 30.44, 9)));
    expect(r.gap.rate).toBe(6);
    expect(r.state).toBe(stateForGap(r.gap.gapCorrects, r.gap.budget));
    // Inherited NEET warnings/notes ride along (§5.5).
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('LOW_GT_COUNT');
    expect(codes).toContain('PROVISIONAL_WIDTHS');
    expect(r.notes.some((n) => n.includes('fraction-parity'))).toBe(true);
    expect(r.notes).toContain(READINESS.TIME_ALLOWANCE.NOTE);
    // API serves the domain record byte-for-byte (same real-clock IST day).
    expect(r).toEqual(JSON.parse(JSON.stringify(computeReadiness(body))));

    // Persisted BEFORE serving, §16-shaped, hash pinned.
    const doc = await ReadinessQuery.findById(res.body.readinessId).lean();
    expect(doc.userId).toBe(STUDENT._id);
    expect(doc.exam).toBe('NEET_PG');
    expect(doc.request).toEqual(body); // byte-faithful echo
    expect(doc.state).toBe('READY');
    expect(doc.methodVersion).toBe(READINESS.METHOD_VERSION_NEET_PG);
    expect(doc.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.rollover).toBeNull();
    expect(doc.examLabel).toBe('NEET PG');
    // The persistence enum mirrors the engine's exported three-state contract.
    expect(ReadinessQuery.schema.path('state').enumValues).toEqual([...ENGINE_STATES]);
    expect(ENGINE_STATES).toEqual(['READY', 'MODERATELY_READY', 'BARELY_READY']);
  });

  it('preserves the INI-CET Hazra-prior limitation exactly (§6.4, §9.3.1, §18.5)', async () => {
    const cookie = await login();
    const res = await postReadiness(cookie, { exam: 'INI_CET', gts: [{ corrects: 95 }] });
    expect(res.status).toBe(201);
    const r = res.body.result;
    expect(r.methodVersion).toBe(READINESS.METHOD_VERSION_INI_CET);
    // ANY_SEAT 44,418 sits below the ladder floor ⇒ conservative 110c + note.
    expect(r.target).toMatchObject({
      id: 'ANY_SEAT',
      rank: 44418,
      requiredCorrects: 110,
      requiredState: 'below-ladder',
    });
    const anySeat = r.anchors.find((a) => a.id === 'ANY_SEAT');
    expect(anySeat.note).toMatch(/beyond the crowd ladder's floor rung/i);
    // STRONG = AIR 4 is above the ladder ⇒ open-ended context row, never the target.
    const strong = r.anchors.find((a) => a.id === 'STRONG');
    expect(strong).toMatchObject({
      rank: 4,
      requiredCorrects: null,
      requiredState: 'above-ladder',
      ladderEndCorrects: 160,
    });
    // Crowd prior always flagged; UR caveat always noted (§6.4/§6.5).
    expect(r.warnings.map((w) => w.code)).toContain('CROWD_SOURCED_PRIOR');
    expect(r.notes).toContain(READINESS.NOTES.INI_UR_CAVEAT);
    // State via the exact §10 rule on the served gap (date-robust).
    expect(r.state).toBe(stateForGap(r.gap.gapCorrects, r.gap.budget));
    expect(r.gap.budget).toBe(Math.floor(5 * Math.min(r.calendar.daysRemaining / 30.44, 9)));
  });

  it('score mode converts through the exact pattern inverse, both exams, on and off lattice (R5)', async () => {
    const cookie = await login();

    const neetOn = await postReadiness(cookie, { exam: 'NEET_PG', score: { value: 415 } });
    expect(neetOn.status).toBe(201);
    expect(neetOn.body.result.input.mode).toBe('score');
    expect(neetOn.body.result.input.scoreRows[0]).toMatchObject({ value: 415, corrects: 119, onLattice: true });
    expect(neetOn.body.result.notes).not.toContain(READINESS.NOTES.SCORE_OFF_LATTICE);

    const neetOff = await postReadiness(cookie, { exam: 'NEET_PG', score: { value: 437 } });
    expect(neetOff.status).toBe(201);
    expect(neetOff.body.result.input.scoreRows[0]).toMatchObject({
      value: 437,
      corrects: 123,
      onLattice: false,
      residueMarks: 2,
    });
    expect(neetOff.body.result.notes).toContain(READINESS.NOTES.SCORE_OFF_LATTICE);

    const iniOn = await postReadiness(cookie, { exam: 'INI_CET', score: { value: 100 } });
    expect(iniOn.status).toBe(201);
    expect(iniOn.body.result.input.scoreRows[0]).toMatchObject({ corrects: 125, onLattice: true });

    const iniOff = await postReadiness(cookie, { exam: 'INI_CET', score: { value: 100.5 } });
    expect(iniOff.status).toBe(201);
    expect(iniOff.body.result.input.scoreRows[0]).toMatchObject({ corrects: 125, onLattice: false, residueMarks: 0.5 });
    expect(iniOff.body.result.notes).toContain(READINESS.NOTES.SCORE_OFF_LATTICE);
  });

  it('rejects INPUT_MODE_CONFLICT when both or neither input mode is valued (§18.1)', async () => {
    const cookie = await login(STUDENT3.email);
    const before = await ReadinessQuery.countDocuments({ userId: STUDENT3._id });
    const both = await postReadiness(cookie, {
      exam: 'NEET_PG',
      gts: [{ corrects: 100 }],
      score: { value: 400 },
    });
    expect(both.status).toBe(400);
    expect(both.body.code).toBe('INPUT_MODE_CONFLICT');
    expect(both.body.field).toBe('gts');

    const neither = await postReadiness(cookie, { exam: 'NEET_PG' });
    expect(neither.status).toBe(400);
    expect(neither.body.code).toBe('INPUT_MODE_CONFLICT');
    expect(await ReadinessQuery.countDocuments({ userId: STUDENT3._id })).toBe(before); // nothing stored
  });

  it('rejects out-of-pattern scores with SCORE_OUT_OF_RANGE and the bounds (§18.1)', async () => {
    const cookie = await login(STUDENT3.email);
    for (const body of [
      { exam: 'NEET_PG', score: { value: 721 } },
      { exam: 'NEET_PG', score: { value: -181 } },
      { exam: 'INI_CET', score: { value: 200.1 } },
      { exam: 'INI_CET', score: { value: -67 } },
    ]) {
      const res = await postReadiness(cookie, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SCORE_OUT_OF_RANGE');
      expect(res.body.field).toBe('score');
      expect(res.body.msg).toMatch(/marks/);
    }
    // The exact bounds themselves stay resolvable.
    const edge = await postReadiness(cookie, { exam: 'NEET_PG', score: { value: -180 } });
    expect(edge.status).toBe(201);
    expect(edge.body.result.input.meanCorrects).toBe(0);
  });

  it('rejects junk corrects with typed field paths and pattern-derived bounds (the 180 pin)', async () => {
    const cookie = await login(STUDENT3.email);
    const over = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 181 }] });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('INVALID_INPUT');
    expect(over.body.field).toBe('gts[0].corrects');
    expect(over.body.msg).toContain('180');
    expect(over.body.msg).not.toContain('200');

    const iniOver = await postReadiness(cookie, { exam: 'INI_CET', gts: [{ corrects: 201 }] });
    expect(iniOver.status).toBe(400);
    expect(iniOver.body.msg).toContain('200');

    // (Infinity/NaN cannot cross JSON — they arrive as null, i.e. a skipped
    // row; those shapes are pinned at the engine layer in Phase 3 tests.)
    for (const bad of [119.5, -1, 'abc', '12x']) {
      const res = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: bad }] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
      expect(res.body.field).toBe('gts[0].corrects');
    }
  });

  it('rejects unknown exams and unknown sessions with typed 400s', async () => {
    const cookie = await login(STUDENT3.email);
    const exam = await postReadiness(cookie, { exam: 'FMGE', gts: [{ corrects: 100 }] });
    expect(exam.status).toBe(400);
    expect(exam.body.code).toBe('INVALID_INPUT');
    expect(exam.body.field).toBe('exam');
    expect(exam.body.msg).toMatch(/NEET_PG|INI_CET/);

    const session = await postReadiness(cookie, {
      exam: 'INI_CET',
      gts: [{ corrects: 100 }],
      session: '2099-01',
    });
    expect(session.status).toBe(400);
    expect(session.body.code).toBe('INVALID_INPUT');
    expect(session.body.field).toBe('session');
  });

  it('ignores client attempts to override derived values — the server recomputes everything (FR-3, §20)', async () => {
    const cookie = await login();
    const smuggle = {
      exam: 'NEET_PG',
      gts: [{ corrects: 70 }],
      state: 'BARELY_READY',
      daysRemaining: 0,
      monthsRemaining: 0,
      budget: 0,
      rate: 0,
      calendarVersion: 'fake',
      examDate: '2020-01-01',
      anchors: [],
      warnings: [],
      notes: [],
    };
    const res = await postReadiness(cookie, smuggle);
    expect(res.status).toBe(201);
    const clean = JSON.parse(JSON.stringify(computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: 70 }] })));
    // Every derived stage is EXACTLY the clean-body computation — every
    // smuggled key inert. Only the byte-faithful request echo keeps the junk.
    const { request: echoed, ...servedStages } = res.body.result;
    const { request: cleanRequest, ...cleanStages } = clean;
    void cleanRequest;
    expect(echoed).toEqual(smuggle);
    expect(servedStages).toEqual(cleanStages);
    expect(res.body.result.state).toBe('READY'); // engine-derived, not 'BARELY_READY'
    expect(res.body.result.calendar.calendarVersion).toBe(readinessCalendar.CALENDAR_VERSION);
    // The raw body (junk included) is what gets persisted byte-faithfully.
    const doc = await ReadinessQuery.findById(res.body.readinessId).lean();
    expect(doc.request).toEqual(smuggle);
  });

  it('targets an explicit listed session in planning mode (server-side resolution, §7.2 rule 6)', async () => {
    const cookie = await login();
    // Pick the LATEST future INI session at the real clock — stays valid for
    // the whole seeded horizon (a null here means the seed needs its SOP
    // maintenance commit, which is exactly what should fail loudly).
    const istToday = Math.trunc((Date.now() + 330 * 60000) / 86400000);
    const dayOf = (iso) => Math.trunc(Date.parse(`${iso}T00:00:00Z`) / 86400000);
    const future = readinessCalendar.ENTRIES.filter(
      (e) => e.exam === 'INI_CET' && dayOf(e.examDate) >= istToday
    );
    expect(future.length).toBeGreaterThan(0);
    const target = future[future.length - 1];

    const res = await postReadiness(cookie, {
      exam: 'INI_CET',
      gts: [{ corrects: 100 }],
      session: target.session,
    });
    expect(res.status).toBe(201);
    expect(res.body.result.calendar).toMatchObject({ session: target.session, examDate: target.examDate });
    expect(res.body.rollover).toBeUndefined(); // the session is upcoming — no rollover
  });

  it('does NOT serve a result when persistence fails (READINESS_NOT_STORED)', async () => {
    const spy = jest.spyOn(ReadinessQuery, 'create').mockRejectedValueOnce(new Error('db down'));
    const cookie = await login();
    const res = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 100 }] });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('READINESS_NOT_STORED');
    expect(res.body.readinessId).toBeUndefined();
    expect(res.body.result).toBeUndefined();
  });

  it('produces a deterministic resultHash for identical requests (FR-10)', async () => {
    const cookie = await login();
    const body = { exam: 'NEET_PG', gts: [{ corrects: 80 }, { corrects: 82 }] };
    const a = await postReadiness(cookie, body);
    const b = await postReadiness(cookie, body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.readinessId).not.toBe(b.body.readinessId); // two records…
    const docA = await ReadinessQuery.findById(a.body.readinessId).lean();
    const docB = await ReadinessQuery.findById(b.body.readinessId).lean();
    expect(docA.resultHash).toBe(docB.resultHash); // …with byte-identical stages
    expect(JSON.stringify(docA.gap)).toBe(JSON.stringify(docB.gap));
  });
});

describe('readiness API — retrieval + integrity', () => {
  it('retrieves the stored result with a matching hash and a clean verified re-derivation', async () => {
    const cookie = await login();
    const made = await postReadiness(cookie, { exam: 'INI_CET', gts: [{ corrects: 105 }, { corrects: 106 }] });
    expect(made.status).toBe(201);

    const got = await request(app)
      .get(`/api/predictor/readiness/${made.body.readinessId}`)
      .set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.readinessId).toBe(made.body.readinessId);
    expect(got.body.integrity).toMatchObject({
      resultHash: expect.any(String),
      recomputedHash: got.body.integrity.resultHash,
      matches: true,
    });
    // Re-derivation from the stored request (pinned to the stored IST date)
    // reproduces the served result exactly — no drift, no verification diff.
    expect(got.body.verified).toBe(true);
    expect(got.body.verification).toBeUndefined();
    const r = got.body.result;
    expect(r).toMatchObject({
      exam: 'INI_CET',
      examLabel: 'INI-CET',
      methodVersion: READINESS.METHOD_VERSION_INI_CET,
      state: expect.any(String),
    });
    expect(r.request).toEqual({ exam: 'INI_CET', gts: [{ corrects: 105 }, { corrects: 106 }] });
    expect(r.input.meanCorrects).toBe(105.5);
    expect(r.createdAt).toBeTruthy();
    expect(r.rollover).toBeUndefined();
  });

  it('keeps other students out, and unknown/malformed ids 404 (own-only, no existence leak)', async () => {
    const cookie = await login();
    const made = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 90 }] });
    const other = await login(STUDENT2.email);
    expect(
      (await request(app).get(`/api/predictor/readiness/${made.body.readinessId}`).set('Cookie', other)).status
    ).toBe(404);
    expect(
      (await request(app).get('/api/predictor/readiness/507f1f77bcf86cd7994390ff').set('Cookie', cookie)).status
    ).toBe(404);
    expect(
      (await request(app).get('/api/predictor/readiness/not-an-objectid').set('Cookie', cookie)).status
    ).toBe(404);
  });

  it('flags a tampered stored stage: hash mismatch AND re-derivation drift (DBP pattern)', async () => {
    const cookie = await login();
    const made = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 90 }] });
    const id = made.body.readinessId;

    await ReadinessQuery.updateOne({ _id: id }, { $set: { 'gap.gapCorrects': 999 } });
    const tampered = await request(app).get(`/api/predictor/readiness/${id}`).set('Cookie', cookie);
    expect(tampered.status).toBe(200);
    expect(tampered.body.integrity.matches).toBe(false);
    expect(tampered.body.verified).toBe(false);
    expect(tampered.body.verification).toMatchObject({ stagesMatch: false });
  });
});

describe('readiness API — frozen-clock behaviors (§7.2, §18.2, §19, Phase-10a)', () => {
  it('pins the calendar snapshot at a frozen instant (announced INI 31 days, expected NEET)', async () => {
    const cookie = await login();
    const res = await withFrozenClock('2026-10-01T04:00:00Z', () =>
      request(app).get('/api/predictor/readiness/calendar').set('Cookie', cookie)
    );
    expect(res.status).toBe(200);
    const ini = res.body.exams.INI_CET.next;
    expect(ini).toMatchObject({
      session: '2027-01',
      examDate: '2026-11-01',
      status: 'announced',
      daysRemaining: daysBetween('2026-10-01', '2026-11-01'),
      asOfIstDate: '2026-10-01',
    });
    expect(ini.warnings).toEqual([]); // announced ⇒ no DATE_EXPECTED
    const neet = res.body.exams.NEET_PG.next;
    expect(neet).toMatchObject({
      session: '2027',
      examDate: '2027-08-15',
      status: 'expected',
      daysRemaining: daysBetween('2026-10-01', '2027-08-15'),
    });
    expect(neet.warnings.map((w) => w.code)).toEqual(['DATE_EXPECTED']);
  });

  it('rolls a passed client-sent session forward: server resolution wins + annotation (§18.2)', async () => {
    // The session cookie carries a 7-day expiresAt checked against the clock,
    // so it must be minted INSIDE the frozen window (a real-clock cookie has
    // "expired" by mocked December).
    let frozenCookie;
    const res = await withFrozenClock('2026-12-01T04:00:00Z', async () => {
      frozenCookie = await login();
      return postReadiness(frozenCookie, {
        exam: 'INI_CET',
        gts: [{ corrects: 120 }],
        session: '2027-01',
      });
    });
    expect(res.status).toBe(201);
    // The annotation names both sessions.
    expect(res.body.rollover).toEqual({
      requestedSession: '2027-01',
      resolvedSession: '2027-07',
      note: expect.any(String),
    });
    // The server's default resolution won: the next upcoming session.
    expect(res.body.result.calendar).toMatchObject({
      session: '2027-07',
      examDate: '2027-05-16',
      status: 'expected',
      daysRemaining: daysBetween('2026-12-01', '2027-05-16'),
      asOfIstDate: '2026-12-01',
    });
    expect(res.body.result.warnings.map((w) => w.code)).toContain('DATE_EXPECTED');
    // The engine consumed (and the record echoes) the session-stripped body.
    expect(res.body.result.request).toEqual({ exam: 'INI_CET', gts: [{ corrects: 120 }] });

    // Persistence: stripped request + rollover annotation stored.
    const doc = await ReadinessQuery.findById(res.body.readinessId).lean();
    expect(doc.request).toEqual({ exam: 'INI_CET', gts: [{ corrects: 120 }] });
    expect(doc.rollover).toMatchObject({ requestedSession: '2027-01', resolvedSession: '2027-07' });

    // Retrieval AFTER the clock moved on still verifies: re-derivation is
    // pinned to the stored IST date, so rollover records re-derive cleanly.
    // (The frozen-minted cookie is still readable: readSession only checks
    // that the clock has not passed its expiresAt.)
    const got = await request(app)
      .get(`/api/predictor/readiness/${res.body.readinessId}`)
      .set('Cookie', frozenCookie);
    expect(got.status).toBe(200);
    expect(got.body.integrity.matches).toBe(true);
    expect(got.body.verified).toBe(true);
    expect(got.body.result.calendar.session).toBe('2027-07');
    expect(got.body.result.rollover.requestedSession).toBe('2027-01');
  });

  it('answers NO_UPCOMING_EXAM with 409 and actionable copy once the horizon is exhausted (§19)', async () => {
    const before = await ReadinessQuery.countDocuments({ userId: STUDENT._id });
    // Session minted inside the frozen window (cookie expiry is clock-checked).
    const res = await withFrozenClock('2028-01-05T06:00:00Z', async () => {
      const frozenCookie = await login();
      return postReadiness(frozenCookie, { exam: 'NEET_PG', gts: [{ corrects: 100 }] });
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_UPCOMING_EXAM');
    expect(res.body.msg).toMatch(/check back/i);
    expect(await ReadinessQuery.countDocuments({ userId: STUDENT._id })).toBe(before); // nothing stored for a refused request
  });

  it('serves a routine-empty calendar as a 200 with null nexts, never a 4xx (Phase-10a lesson)', async () => {
    const res = await withFrozenClock('2028-01-05T06:00:00Z', async () => {
      const frozenCookie = await login();
      return request(app).get('/api/predictor/readiness/calendar').set('Cookie', frozenCookie);
    });
    expect(res.status).toBe(200);
    expect(res.body.calendarVersion).toBe(readinessCalendar.CALENDAR_VERSION);
    expect(res.body.exams.NEET_PG).toMatchObject({ next: null, horizonDays: 548 });
    expect(res.body.exams.INI_CET).toMatchObject({ next: null, horizonDays: 548 });
  });
});

describe('readiness API — §18.3 extremes + own rate budget', () => {
  it('INI corrects=0: below-prior coverage, BARELY_READY + SIGNIFICANT_GAP at any date', async () => {
    const cookie = await login();
    const res = await postReadiness(cookie, { exam: 'INI_CET', gts: [{ corrects: 0 }] });
    expect(res.status).toBe(201);
    const r = res.body.result;
    // G = 110 > 2 × (5 × 9) = 90 for every reachable calendar state ⇒ always
    // BARELY_READY with the annotation (date-independent pin).
    expect(r.state).toBe('BARELY_READY');
    expect(r.gap.significantGap).toBe(true);
    expect(r.notes).toContain(READINESS.NOTES.SIGNIFICANT_GAP);
    expect(r.standing.coverage).toBe('below-prior');
    expect(r.target.requiredState).toBe('below-ladder');
  });

  it('INI 200/200 surfaces above-prior standing without crashing (R9 through the API)', async () => {
    const cookie = await login();
    const res = await postReadiness(cookie, { exam: 'INI_CET', gts: [{ corrects: 200 }] });
    expect(res.status).toBe(201);
    const r = res.body.result;
    expect(r.state).toBe('READY'); // G = 110 − 200 = −90
    expect(r.standing.coverage).toBe('above-prior');
    expect(r.standing.rank.rankRange).toEqual([1, 10]); // honest ladder-best-rung bound
    expect(r.notes.some((n) => n.startsWith('You already clear the target bar'))).toBe(true);
  });

  it('NEET 180/180: READY with headroom note and the rank-1 standing (§18.3)', async () => {
    const cookie = await login();
    const res = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 180 }] });
    expect(res.status).toBe(201);
    const r = res.body.result;
    expect(r.state).toBe('READY');
    expect(r.gap.gapCorrects).toBe(-114);
    expect(r.standing.coverage).toBe('above-distribution');
    expect(r.standing.rank.bestRank).toBe(1);
    expect(r.notes).toContain(READINESS.NOTES.HEADROOM.replace('{headroom}', '114'));
  });

  it('rate-limits abuse on its own budget (429 after 30/hr)', async () => {
    // Dedicated user: the readiness budget is separate from every sibling's.
    const cookie = await login(STUDENT2.email);
    const createSpy = jest.spyOn(ReadinessQuery, 'create').mockResolvedValue({ _id: 'x' });
    let saw429 = false;
    try {
      for (let i = 0; i < 40 && !saw429; i += 1) {
        const res = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 100 }] });
        if (res.status === 429) saw429 = true;
      }
    } finally {
      createSpy.mockRestore();
    }
    expect(saw429).toBe(true);
  });
});
