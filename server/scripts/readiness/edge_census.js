'use strict';

/**
 * Readiness Score — §18 edge-case census (docs/READINESS_SCORE.md §18 + §26
 * Phase 6 "run the census: every §18 row against the booted engine + API").
 *
 * TWO layers, one matrix:
 *   1. DOMAIN  — every §18.1–§18.5 row against computeReadiness directly with
 *                injected clocks (offline; Phase 3 scope, unchanged).
 *   2. API     — the same matrix through the BOOTED server: real express app,
 *                real routes/predictor.js wiring, mock App API + in-memory
 *                Mongo (the predictorReadinessApi.test.js harness), supertest
 *                HTTP, frozen wall-clock windows for date-dependent rows
 *                (NO_UPCOMING_EXAM 409, §18.2 rollover, exam-day B=0, cap
 *                saturation, expected-date-passed) + auth/CSRF/rate-limit/
 *                persistence/integrity rows that only exist at the API layer.
 *
 * Run:  node scripts/readiness/edge_census.js            # both layers
 *       node scripts/readiness/edge_census.js --domain   # offline rows only
 *       node scripts/readiness/edge_census.js --api      # booted-API rows only
 *
 * Done when: every row prints PASS and the summary reads
 *   "EDGE CENSUS (domain layer): ALL <d> ROWS PASS"
 *   "EDGE CENSUS (api layer):    ALL <a> ROWS PASS"
 *   "EDGE CENSUS: ALL <d+a> ROWS PASS (domain <d> + api <a>)"
 * Any FAIL row (or a harness crash) exits non-zero (repo convention: the
 * census is the test; any fix it forces lands with a unit pin).
 *
 * Budget discipline: every POST consumes the poster's 30/hr readiness budget
 * (the limiter runs before validation), so rows are bucketed per census user
 * per clock-window exactly like the jest API suite — see USER_V/USER_H/USER_R.
 */

const { computeReadiness } = require('../../predictor/readiness');
const { EXAMS, READINESS } = require('../../predictor/config');
const { CODES } = require('../../predictor/errors');

// Frozen instants (UTC) chosen so their IST civil dates pin exact calendar
// resolutions — the same instants the domain rows use, plus API-only ones.
const NOW_0926 = new Date('2026-09-26T04:00:00Z'); // IST 09:30 — INI 36 days, NEET 323 (capped)
const NOW_NEET36 = new Date('2027-07-10T04:00:00Z'); // NEET 36 days, uncapped
const NOW_INI_EXAM_DAY = new Date('2026-11-01T04:00:00Z'); // INI '2027-01' exam day (B=0)
const NOW_DAY_AFTER_INI = new Date('2026-11-02T04:00:00Z'); // INI '2027-01' passed → rollover
const NOW_NEET_PASSED = new Date('2027-08-20T04:00:00Z'); // NEET '2027' (8/15) passed, INI '2028-01' live
const NOW_EXHAUSTED = new Date('2028-01-05T06:00:00Z'); // every seed entry past

const gts = (exam, ...corrects) => ({ exam, gts: corrects.map((c) => ({ corrects: c })) });

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}
function thrownBy(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
}
function expectCode(fn, code, label) {
  const err = thrownBy(fn);
  assert(err !== null, `${label}: expected a thrown ${code}, nothing thrown`);
  assert(err.code === code, `${label}: expected code ${code}, got ${err.code}`);
  return err;
}

// =============================================================================
// Layer 1 — DOMAIN (§18 rows against computeReadiness; Phase 3 scope, verbatim)
// =============================================================================

function runDomainCensus() {
  let passed = 0;
  let failed = 0;
  function row(name, fn) {
    try {
      fn();
      passed += 1;
      console.log(`PASS  ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${name}\n      ${err && err.message ? err.message : err}`);
    }
  }

  // --- §18.1 input validation -------------------------------------------------

  row('18.1.a invalid exam ids ⇒ INVALID_INPUT (field exam)', () => {
    for (const exam of ['FMGE', 'neet_pg', 42, null]) {
      const err = expectCode(() => computeReadiness({ exam, gts: [{ corrects: 100 }] }, { now: NOW_0926 }), CODES.INVALID_INPUT, `exam=${String(exam)}`);
      assertEq(err.details.field, 'exam', 'field');
    }
  });

  row('18.1.b both input modes valued ⇒ INPUT_MODE_CONFLICT', () => {
    expectCode(
      () => computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: 100 }], score: { value: 400 } }, { now: NOW_0926 }),
      CODES.INPUT_MODE_CONFLICT,
      'both modes'
    );
  });

  row('18.1.c neither input mode valued ⇒ INPUT_MODE_CONFLICT (exactly one per request)', () => {
    expectCode(() => computeReadiness({ exam: 'NEET_PG' }, { now: NOW_0926 }), CODES.INPUT_MODE_CONFLICT, 'neither mode');
  });

  row('18.1.d corrects above pattern total ⇒ INVALID_INPUT, bound read from config (180-pin)', () => {
    const neet = expectCode(() => computeReadiness(gts('NEET_PG', 181), { now: NOW_0926 }), CODES.INVALID_INPUT, '181');
    assert(neet.message.includes(String(EXAMS.NEET_PG.pattern.totalQuestions)), 'message carries the pattern total');
    expectCode(() => computeReadiness(gts('INI_CET', 201), { now: NOW_0926 }), CODES.INVALID_INPUT, '201');
  });

  row('18.1.e decimals / negatives / text corrects ⇒ INVALID_INPUT (never clamped)', () => {
    for (const bad of [100.5, -3, 'hundred', Number.NaN]) {
      expectCode(() => computeReadiness(gts('NEET_PG', bad), { now: NOW_0926 }), CODES.INVALID_INPUT, `corrects=${String(bad)}`);
    }
  });

  row('18.1.f scores outside pattern bounds ⇒ SCORE_OUT_OF_RANGE with pattern-derived bounds', () => {
    const err = expectCode(() => computeReadiness({ exam: 'NEET_PG', score: { value: 900 } }, { now: NOW_0926 }), CODES.SCORE_OUT_OF_RANGE, '900');
    assertEq(err.details.max, EXAMS.NEET_PG.pattern.maxMarks, 'max');
    expectCode(() => computeReadiness({ exam: 'NEET_PG', score: { value: -181 } }, { now: NOW_0926 }), CODES.SCORE_OUT_OF_RANGE, '-181');
    expectCode(() => computeReadiness({ exam: 'INI_CET', score: { value: 200.5 } }, { now: NOW_0926 }), CODES.SCORE_OUT_OF_RANGE, '200.5');
  });

  row('18.1.g off-lattice scores accepted + rounded + SCORE_OFF_LATTICE note (R5)', () => {
    const r = computeReadiness({ exam: 'NEET_PG', score: { value: 437 } }, { now: NOW_0926 });
    assertEq(r.input.scoreRows[0].corrects, 123, '437 ⇒ 123c');
    assert(r.notes.includes(READINESS.NOTES.SCORE_OFF_LATTICE), 'note present');
  });

  row('18.1.h empty/whitespace rows skipped; all-empty ⇒ INVALID_INPUT', () => {
    const r = computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: '' }, { corrects: null }, { corrects: 100 }] }, { now: NOW_0926 });
    assertEq(r.input.aggregation.n, 1, 'one usable row');
    expectCode(() => computeReadiness({ exam: 'NEET_PG', gts: [{ corrects: ' ' }] }, { now: NOW_0926 }), CODES.INVALID_INPUT, 'all empty');
  });

  row('18.1.i unknown session ⇒ INVALID_INPUT (field session)', () => {
    const err = expectCode(() => computeReadiness({ exam: 'INI_CET', gts: [{ corrects: 110 }], session: '2020-01' }, { now: NOW_0926 }), CODES.INVALID_INPUT, 'session');
    assertEq(err.details.field, 'session', 'field');
  });

  // --- §18.2 calendar edges (domain-relevant rows) ------------------------------

  row('18.2.a horizon exhausted ⇒ NO_UPCOMING_EXAM passes through, typed', () => {
    for (const exam of ['NEET_PG', 'INI_CET']) {
      expectCode(() => computeReadiness(gts(exam, 100), { now: NOW_EXHAUSTED }), CODES.NO_UPCOMING_EXAM, exam);
    }
  });

  row('18.2.b expected date ⇒ DATE_EXPECTED warning; announced ⇒ none', () => {
    const neet = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
    assert(neet.warnings.some((w) => w.code === 'DATE_EXPECTED'), 'NEET seed is expected');
    const ini = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
    assert(!ini.warnings.some((w) => w.code === 'DATE_EXPECTED'), 'INI seed is announced');
  });

  // --- §18.3 boundary/extreme performance --------------------------------------

  row('18.3.a corrects = 0 valid on both exams (floor standing, BARELY_READY + SIGNIFICANT_GAP)', () => {
    const neet = computeReadiness(gts('NEET_PG', 0), { now: NOW_NEET36 });
    assertEq(neet.state, 'BARELY_READY', 'NEET state');
    assertEq(neet.gap.significantGap, true, 'NEET significant');
    const ini = computeReadiness(gts('INI_CET', 0), { now: NOW_0926 });
    assertEq(ini.state, 'BARELY_READY', 'INI state');
    assertEq(ini.gap.significantGap, true, 'INI significant');
  });

  row('18.3.b NEET 180/180 ⇒ above-distribution, rank 1, READY + headroom note', () => {
    const r = computeReadiness(gts('NEET_PG', 180), { now: NOW_0926 });
    assertEq(r.state, 'READY', 'state');
    assertEq(r.standing.rank.bestRank, 1, 'best rank');
    assert(r.notes.some((n) => n.includes('headroom')), 'headroom note');
  });

  row('18.3.c INI 200/200 ⇒ above-prior standing WITHOUT crashing (R9 fix)', () => {
    const r = computeReadiness(gts('INI_CET', 200), { now: NOW_0926 });
    assertEq(r.standing.coverage, 'above-prior', 'coverage');
    assertEq(r.state, 'READY', 'state');
  });

  row('18.3.d INI whole-range below ladder (20/200) ⇒ below-prior WITHOUT crashing (R9 symmetric)', () => {
    const r = computeReadiness(gts('INI_CET', 20), { now: NOW_0926 });
    assertEq(r.standing.coverage, 'below-prior', 'coverage');
  });

  row('18.3.e fractional c̄: display keeps fraction, decision compares directly (documented rounding)', () => {
    const r = computeReadiness(gts('INI_CET', 104, 105), { now: NOW_0926 }); // c̄ 104.5 ⇒ G 5.5 > B 5
    assertEq(r.input.meanCorrects, 104.5, 'mean');
    assertEq(r.gap.gapCorrects, 5.5, 'gap');
    assertEq(r.state, 'BARELY_READY', 'state');
  });

  // --- §18.4 time boundaries ----------------------------------------------------

  row('18.4.a daysRemaining = 0 ⇒ B = 0, binary READY/BARELY_READY (MODERATELY unreachable)', () => {
    const seen = new Set();
    for (const c of [100, 105, 109, 110, 111, 120]) {
      const r = computeReadiness(gts('INI_CET', c), { now: NOW_INI_EXAM_DAY });
      assertEq(r.gap.budget, 0, `B at c=${c}`);
      seen.add(r.state);
    }
    assertEq([...seen].sort().join('|'), 'BARELY_READY|READY', 'only two states reachable');
  });

  row('18.4.b long horizon saturates: B = RATE × CAP exactly', () => {
    const r = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 }); // 323 days ⇒ months capped at 9
    assertEq(r.gap.capped, true, 'capped');
    assertEq(
      r.gap.budget,
      READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH.NEET_PG * READINESS.TIME_ALLOWANCE.CAP_MONTHS,
      'B = RATE × CAP'
    );
  });

  row('18.4.c daysRemaining computed once server-side and stored in the record (§8 echo)', () => {
    const r = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
    assertEq(r.calendar.daysRemaining, 36, 'days');
    assertEq(Math.round(r.gap.monthsRemaining * 100) / 100, Math.round((36 / 30.44) * 100) / 100, 'months = days / 30.44');
  });

  // --- §18.5 data-condition edges ------------------------------------------------

  row('18.5.a INI ANY_SEAT below the Hazra floor ⇒ conservative 110c + explicit note', () => {
    const r = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
    const a = r.anchors.find((x) => x.id === 'ANY_SEAT');
    assertEq(a.requiredCorrects, 110, 'floor corrects');
    assert(/floor rung/i.test(a.note || ''), 'resolver note carried');
  });

  row('18.5.b INI STRONG above the ladder ⇒ open-ended context row, default math unaffected', () => {
    const r = computeReadiness(gts('INI_CET', 110), { now: NOW_0926 });
    const s = r.anchors.find((x) => x.id === 'STRONG');
    assertEq(s.requiredCorrects, null, 'open-ended');
    assertEq(s.ladderEndCorrects, 160, 'ladder end echoed');
    assertEq(r.target.id, 'ANY_SEAT', 'target unchanged');
  });

  row('18.5.c determinism: identical (request, now) ⇒ byte-identical records', () => {
    const a = computeReadiness(gts('NEET_PG', 80, 82), { now: NOW_0926 });
    const b = computeReadiness(gts('NEET_PG', 80, 82), { now: NOW_0926 });
    assert(JSON.stringify(a) === JSON.stringify(b), 'byte-identical');
  });

  row('18.5.d method block completeness: every constant echoed (FR-5)', () => {
    const r = computeReadiness(gts('NEET_PG', 66), { now: NOW_0926 });
    for (const key of [
      'version',
      'anchorSetRuleId',
      'timeAllowanceRuleId',
      'defaultAnchor',
      'significantGapFactor',
      'daysPerMonth',
      'timeAllowance',
      'calendarVersion',
      'pattern',
      'patternVersion',
      'distribution',
      'aggregation',
      'inheritedForwardMethodVersion',
    ]) {
      assert(r.method[key] !== undefined, `method.${key} present`);
    }
    assertEq(r.method.pattern.totalQuestions, EXAMS.NEET_PG.pattern.totalQuestions, '180-pin');
  });

  row('18.5.e score≡corrects parity: same c̄ through either mode ⇒ identical standing', () => {
    const viaScore = computeReadiness({ exam: 'NEET_PG', score: { value: 415 } }, { now: NOW_0926 });
    const viaCorrects = computeReadiness(gts('NEET_PG', 119), { now: NOW_0926 });
    assert(JSON.stringify(viaScore.standing) === JSON.stringify(viaCorrects.standing), 'standing identical');
    assertEq(viaScore.state, viaCorrects.state, 'state identical');
  });

  row('18.5.f boundary sweep: state severity only improves as corrects grow (no bucket cliffs)', () => {
    const order = { READY: 0, MODERATELY_READY: 1, BARELY_READY: 2 };
    let prev = Number.MAX_SAFE_INTEGER;
    for (let c = 90; c <= 130; c += 1) {
      const r = computeReadiness(gts('INI_CET', c), { now: NOW_0926 });
      const sev = order[r.state];
      assert(sev <= prev, `severity regressed at c=${c}`);
      prev = sev;
    }
  });

  return { passed, failed };
}

// =============================================================================
// Layer 2 — API (the same §18 matrix through the booted server)
// =============================================================================

async function runApiCensus() {
  const express = require('express');
  const request = require('supertest');
  const mongoose = require('mongoose');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const ReadinessQuery = require('../../models/ReadinessQuery');

  let passed = 0;
  let failed = 0;
  async function row(name, fn) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS  ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${name}\n      ${err && err.message ? err.message : err}`);
    }
  }

  // Census students: separate App users so the 30/hr POST budget buckets stay
  // under the cap per (user, clock-window) — V eats validation 400s, H the
  // happy paths, R burns its whole budget for the 429 row.
  const SERVICE_TOKEN = 's'.repeat(43);
  const USER_V = { _id: '507f1f77bcf86cd7994d0a01', name: 'Census V', email: 'census-v@example.com', role: 'student', isFreeUser: false };
  const USER_H = { _id: '507f1f77bcf86cd7994d0a02', name: 'Census H', email: 'census-h@example.com', role: 'student', isFreeUser: false };
  const USER_R = { _id: '507f1f77bcf86cd7994d0a03', name: 'Census R', email: 'census-r@example.com', role: 'student', isFreeUser: false };
  const users = { [USER_V.email]: USER_V, [USER_H.email]: USER_H, [USER_R.email]: USER_R };

  // ---- harness boot (the predictorReadinessApi.test.js pattern) ----------------

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'x'.repeat(40);
  process.env.SESSION_SECRET = 'y'.repeat(40);
  process.env.APP_INTEGRATION_TOKEN = SERVICE_TOKEN;
  process.env.APP_LOGIN_MAX_PER_IP = '500';

  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  await mongoose.connect(process.env.MONGO_URI);

  const mockAppApi = await new Promise((resolve) => {
    const mock = express();
    mock.use(express.json());
    mock.post('/auth/login', (req, res) => {
      const user = users[(req.body || {}).email];
      if (user) return res.json({ token: `census-jwt-${user._id}`, user, linkedAttempts: 0 });
      return res.status(400).json({ message: 'Invalid email or password.' });
    });
    mock.get('/quizzes/analytics/me', (_req, res) =>
      res.json({ attempts: [], pagination: { page: 1, totalPages: 1, total: 0 } })
    );
    const server = mock.listen(0, () => resolve(server));
  });
  process.env.APP_API_BASE_URL = `http://127.0.0.1:${mockAppApi.address().port}`;

  const app = require('../../server');

  // ---- helpers ------------------------------------------------------------------

  /** Swap the wall clock for the duration of fn (timers stay real — the exact
   *  pattern the jest API suite proved against supertest + mongoose). The
   *  session cookie's 7-day expiry is checked against this clock, so cookies
   *  are minted INSIDE each window (login is cheap). */
  const RealDate = Date;
  async function withFrozenClock(iso, fn) {
    const frozen = new RealDate(iso).getTime();
    class FrozenDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(frozen);
        else super(...args);
      }
      static now() {
        return frozen;
      }
    }
    global.Date = FrozenDate;
    try {
      return await fn();
    } finally {
      global.Date = RealDate;
    }
  }

  async function login(email) {
    const res = await request(app).post('/api/app-auth/login').send({ email, password: 'census' });
    assert(res.status === 200, `login ${email}: expected 200, got ${res.status}`);
    const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('ec_app_session='));
    assert(cookie, `login ${email}: no session cookie`);
    return cookie.split(';')[0];
  }

  const postReadiness = (cookie, body, headers = {}) =>
    request(app).post('/api/predictor/readiness').set('Cookie', cookie).set(headers).send(body);

  const expectStatus = (res, status, label) =>
    assert(res.status === status, `${label}: expected HTTP ${status}, got ${res.status} ${JSON.stringify(res.body)}`);

  const expectBodyCode = (res, code, label) =>
    assert(res.body && res.body.code === code, `${label}: expected body code ${code}, got ${JSON.stringify(res.body)}`);

  /** §10 state rule recomputed from a served gap block (self-consistency). */
  const stateForGap = (gapCorrects, budget) =>
    gapCorrects <= 0 ? 'READY' : gapCorrects <= budget ? 'MODERATELY_READY' : 'BARELY_READY';

  try {
    // -- §18.1 through HTTP: typed, field-scoped validation (USER_V, real clock)

    await row('6.1.a invalid exam ids ⇒ 400 INVALID_INPUT (field exam)', async () => {
      for (const exam of ['FMGE', 'neet_pg', 42, null]) {
        const res = await postReadiness(await login(USER_V.email), { exam, gts: [{ corrects: 100 }] });
        expectStatus(res, 400, `exam=${String(exam)}`);
        expectBodyCode(res, 'INVALID_INPUT', `exam=${String(exam)}`);
        assert(res.body.field === 'exam', `exam=${String(exam)}: expected field 'exam', got ${res.body.field}`);
      }
    });

    await row('6.1.b both/neither input mode ⇒ 400 INPUT_MODE_CONFLICT', async () => {
      const cookie = await login(USER_V.email);
      const both = await postReadiness(cookie, { exam: 'NEET_PG', gts: [{ corrects: 100 }], score: { value: 400 } });
      expectStatus(both, 400, 'both modes');
      expectBodyCode(both, 'INPUT_MODE_CONFLICT', 'both modes');
      const neither = await postReadiness(cookie, { exam: 'NEET_PG' });
      expectStatus(neither, 400, 'neither mode');
      expectBodyCode(neither, 'INPUT_MODE_CONFLICT', 'neither mode');
    });

    await row('6.1.c corrects above pattern total ⇒ 400, message carries the pattern total (180-pin)', async () => {
      const cookie = await login(USER_V.email);
      const neet = await postReadiness(cookie, gts('NEET_PG', 181));
      expectStatus(neet, 400, 'NEET 181');
      expectBodyCode(neet, 'INVALID_INPUT', 'NEET 181');
      assert(
        neet.body.msg.includes(String(EXAMS.NEET_PG.pattern.totalQuestions)),
        `NEET 181: message should carry ${EXAMS.NEET_PG.pattern.totalQuestions}, got "${neet.body.msg}"`
      );
      const ini = await postReadiness(cookie, gts('INI_CET', 201));
      expectStatus(ini, 400, 'INI 201');
      expectBodyCode(ini, 'INVALID_INPUT', 'INI 201');
    });

    await row('6.1.d decimals / negatives / text / array-string corrects ⇒ 400 INVALID_INPUT (never clamped)', async () => {
      const cookie = await login(USER_V.email);
      for (const bad of [100.5, -3, 'hundred', 'NaN', '[1,2]']) {
        const res = await postReadiness(cookie, gts('NEET_PG', bad));
        expectStatus(res, 400, `corrects=${String(bad)}`);
        expectBodyCode(res, 'INVALID_INPUT', `corrects=${String(bad)}`);
      }
    });

    await row('6.1.e non-numeric score value ⇒ 400 INVALID_INPUT (field-scoped: score.value)', async () => {
      const res = await postReadiness(await login(USER_V.email), { exam: 'INI_CET', score: { value: 'abc' } });
      expectStatus(res, 400, 'score abc');
      expectBodyCode(res, 'INVALID_INPUT', 'score abc');
      // validateScoreRows scopes to the precise leaf path — stricter than the
      // bare 'score' the §18.1 table names, never looser.
      assert(res.body.field === 'score.value', `expected field 'score.value', got ${res.body.field}`);
    });

    await row('6.1.f scores outside pattern bounds ⇒ 400 SCORE_OUT_OF_RANGE with pattern-derived bounds', async () => {
      const cookie = await login(USER_V.email);
      for (const [exam, value] of [['NEET_PG', 900], ['NEET_PG', -181], ['INI_CET', 200.5]]) {
        const res = await postReadiness(cookie, { exam, score: { value } });
        expectStatus(res, 400, `${exam} ${value}`);
        expectBodyCode(res, 'SCORE_OUT_OF_RANGE', `${exam} ${value}`);
      }
      const ini = await postReadiness(cookie, { exam: 'INI_CET', score: { value: 300 } });
      assert(
        ini.body.msg.includes('-66.67') && ini.body.msg.includes('200'),
        `INI bounds message should read "-66.67 … 200", got "${ini.body.msg}"`
      );
    });

    await row('6.1.g unknown session ⇒ 400 INVALID_INPUT (field session)', async () => {
      const res = await postReadiness(await login(USER_V.email), { exam: 'INI_CET', gts: [{ corrects: 110 }], session: '2020-01' });
      expectStatus(res, 400, 'unknown session');
      expectBodyCode(res, 'INVALID_INPUT', 'unknown session');
      assert(res.body.field === 'session', `expected field 'session', got ${res.body.field}`);
    });

    await row('6.1.h all-empty rows ⇒ 400 INVALID_INPUT (never an empty 201)', async () => {
      const res = await postReadiness(await login(USER_V.email), { exam: 'NEET_PG', gts: [{ corrects: ' ' }] });
      expectStatus(res, 400, 'all empty');
      expectBodyCode(res, 'INVALID_INPUT', 'all empty');
    });

    // -- §18.2 through HTTP: calendar edges (frozen windows) -----------------------

    await row('6.2.a horizon exhausted ⇒ 409 NO_UPCOMING_EXAM both exams; calendar GET stays 200 with next:null', async () => {
      await withFrozenClock(NOW_EXHAUSTED, async () => {
        const cookie = await login(USER_V.email);
        for (const exam of ['NEET_PG', 'INI_CET']) {
          const res = await postReadiness(cookie, gts(exam, 100));
          expectStatus(res, 409, exam);
          expectBodyCode(res, 'NO_UPCOMING_EXAM', exam);
          assert(/Check back/.test(res.body.msg), `${exam}: actionable copy expected, got "${res.body.msg}"`);
        }
        const cal = await request(app).get('/api/predictor/readiness/calendar').set('Cookie', cookie);
        expectStatus(cal, 200, 'calendar exhausted');
        assert(cal.body.exams.NEET_PG.next === null && cal.body.exams.INI_CET.next === null,
          `calendar next should be null/null, got ${JSON.stringify(cal.body.exams)}`);
      });
    });

    await row('6.2.b §18.2 rollover: past client session ⇒ server resolution wins + rollover note (201)', async () => {
      await withFrozenClock(NOW_DAY_AFTER_INI, async () => {
        const cookie = await login(USER_H.email);
        const res = await postReadiness(cookie, { exam: 'INI_CET', gts: [{ corrects: 110 }], session: '2027-01' });
        expectStatus(res, 201, 'rollover');
        const rollover = res.body.rollover;
        assert(rollover && rollover.requestedSession === '2027-01', `rollover.requestedSession: ${JSON.stringify(rollover)}`);
        assert(rollover.resolvedSession === '2027-07', `rollover.resolvedSession: ${JSON.stringify(rollover)}`);
        assert(/already taken place/.test(rollover.note), 'rollover note wording');
        assertEq(res.body.result.calendar.session, '2027-07', 'result uses the server-resolved session');
        assertEq(res.body.result.calendar.status, 'expected', 'rolled-over session is the expected placeholder');
      });
    });

    await row('6.2.c expected date passed without announcement ⇒ entry ignored; NEET 409 while INI still resolves', async () => {
      await withFrozenClock(NOW_NEET_PASSED, async () => {
        const cookie = await login(USER_H.email);
        const neet = await postReadiness(cookie, gts('NEET_PG', 100));
        expectStatus(neet, 409, 'NEET after 2027-08-15');
        expectBodyCode(neet, 'NO_UPCOMING_EXAM', 'NEET after 2027-08-15');
        const ini = await postReadiness(cookie, gts('INI_CET', 110));
        expectStatus(ini, 201, 'INI after 2027-08-15');
        assertEq(ini.body.result.calendar.session, '2028-01', 'INI falls forward to the Jan 2028 session');
        assertEq(ini.body.result.calendar.status, 'expected', 'later INI entry is an expected placeholder');
      });
    });

    await row('6.2.d announced vs expected through the served warnings (frozen seeds)', async () => {
      await withFrozenClock(NOW_0926, async () => {
        const cookie = await login(USER_H.email);
        const neet = await postReadiness(cookie, gts('NEET_PG', 66));
        expectStatus(neet, 201, 'NEET');
        assert(neet.body.result.warnings.some((w) => w.code === 'DATE_EXPECTED'), 'NEET expected ⇒ DATE_EXPECTED');
        const ini = await postReadiness(cookie, gts('INI_CET', 110));
        expectStatus(ini, 201, 'INI');
        assert(!ini.body.result.warnings.some((w) => w.code === 'DATE_EXPECTED'), 'INI announced ⇒ no DATE_EXPECTED');
      });
    });

    // -- §18.3 through HTTP: boundary/extreme performance (USER_H) -----------------

    await row('6.3.a corrects = 0 both exams ⇒ 201 BARELY_READY + SIGNIFICANT_GAP (no crash, no clamp)', async () => {
      const neet = await withFrozenClock(NOW_NEET36, async () =>
        postReadiness(await login(USER_H.email), gts('NEET_PG', 0))
      );
      expectStatus(neet, 201, 'NEET 0');
      assertEq(neet.body.result.state, 'BARELY_READY', 'NEET state');
      assertEq(neet.body.result.gap.significantGap, true, 'NEET significant');
      const ini = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('INI_CET', 0))
      );
      expectStatus(ini, 201, 'INI 0');
      assertEq(ini.body.result.state, 'BARELY_READY', 'INI state');
      assertEq(ini.body.result.gap.significantGap, true, 'INI significant');
    });

    await row('6.3.b NEET 180/180 ⇒ 201 READY, rank 1, headroom note (§18.3 extreme top)', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('NEET_PG', 180))
      );
      expectStatus(res, 201, '180/180');
      assertEq(res.body.result.state, 'READY', 'state');
      assertEq(res.body.result.standing.rank.bestRank, 1, 'best rank');
      assert(res.body.result.notes.some((n) => String(n).includes('headroom')), 'headroom note');
    });

    await row('6.3.c INI 200/200 ⇒ 201 above-prior without crashing (R9 through the API)', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('INI_CET', 200))
      );
      expectStatus(res, 201, '200/200');
      assertEq(res.body.result.standing.coverage, 'above-prior', 'coverage');
      assertEq(res.body.result.state, 'READY', 'state');
    });

    await row('6.3.d INI 20/200 ⇒ 201 below-prior without crashing (R9 symmetric through the API)', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('INI_CET', 20))
      );
      expectStatus(res, 201, '20/200');
      assertEq(res.body.result.standing.coverage, 'below-prior', 'coverage');
    });

    await row('6.3.e fractional c̄ (104,105) ⇒ 201, mean 104.5 kept fractional through the API', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('INI_CET', 104, 105))
      );
      expectStatus(res, 201, 'fractional');
      assertEq(res.body.result.input.meanCorrects, 104.5, 'mean');
      assertEq(res.body.result.gap.gapCorrects, 5.5, 'gap');
      assertEq(res.body.result.state, 'BARELY_READY', 'state');
    });

    await row('6.3.f off-lattice score 437 ⇒ 201, converted to 123c + SCORE_OFF_LATTICE note (R5)', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), { exam: 'NEET_PG', score: { value: 437 } })
      );
      expectStatus(res, 201, '437');
      assertEq(res.body.result.input.scoreRows[0].corrects, 123, '437 ⇒ 123c');
      assert(res.body.result.notes.includes(READINESS.NOTES.SCORE_OFF_LATTICE), 'note present');
    });

    await row('6.3.g empty/whitespace rows skipped through the API; only usable rows count', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), { exam: 'NEET_PG', gts: [{ corrects: '' }, { corrects: null }, { corrects: 100 }] })
      );
      expectStatus(res, 201, 'mixed rows');
      assertEq(res.body.result.input.aggregation.n, 1, 'one usable row');
    });

    // -- §18.4 through HTTP: time boundaries (frozen) -------------------------------

    await row('6.4.a exam day (daysRemaining = 0) ⇒ B = 0, only READY/BARELY reachable', async () => {
      await withFrozenClock(NOW_INI_EXAM_DAY, async () => {
        const cookie = await login(USER_H.email);
        const seen = new Set();
        for (const c of [100, 105, 109, 110, 111, 120]) {
          const res = await postReadiness(cookie, gts('INI_CET', c));
          expectStatus(res, 201, `c=${c}`);
          assertEq(res.body.result.gap.budget, 0, `B at c=${c}`);
          seen.add(res.body.result.state);
        }
        assertEq([...seen].sort().join('|'), 'BARELY_READY|READY', 'only two states reachable');
      });
    });

    await row('6.4.b long horizon saturates through the API: capped=true, B = RATE × CAP', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('NEET_PG', 66))
      );
      expectStatus(res, 201, 'cap');
      assertEq(res.body.result.gap.capped, true, 'capped');
      assertEq(
        res.body.result.gap.budget,
        READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH.NEET_PG * READINESS.TIME_ALLOWANCE.CAP_MONTHS,
        'B = RATE × CAP'
      );
    });

    // -- §18.5 through HTTP: data conditions, persistence, integrity ----------------

    let storedId = null;

    await row('6.5.a INI below-floor target through the API: conservative 110c + floor note; STRONG open-ended', async () => {
      const res = await withFrozenClock(NOW_0926, async () =>
        postReadiness(await login(USER_H.email), gts('INI_CET', 110))
      );
      expectStatus(res, 201, 'below-floor');
      const anySeat = res.body.result.anchors.find((a) => a.id === 'ANY_SEAT');
      assertEq(anySeat.requiredCorrects, 110, 'ANY_SEAT floor corrects');
      assert(/floor rung/i.test(anySeat.note || ''), 'floor note carried');
      const strong = res.body.result.anchors.find((a) => a.id === 'STRONG');
      assertEq(strong.requiredCorrects, null, 'STRONG open-ended');
      assertEq(res.body.result.target.id, 'ANY_SEAT', 'default target unaffected');
      storedId = res.body.readinessId;
    });

    await row('6.5.b §10 self-consistency from the served record (state, budget, arithmetic)', async () => {
      await withFrozenClock(NOW_0926, async () => {
        const cookie = await login(USER_H.email);
        const neet = await postReadiness(cookie, gts('NEET_PG', 66));
        expectStatus(neet, 201, 'NEET self-check');
        const ini = await postReadiness(cookie, gts('INI_CET', 107));
        expectStatus(ini, 201, 'INI self-check');
        for (const res of [neet, ini]) {
          const { gap, state } = res.body.result;
          assertEq(gap.budget, Math.floor(gap.rate * gap.cappedMonths), `B = floor(rate × cappedMonths) for ${res.body.result.exam}`);
          assertEq(state, stateForGap(gap.gapCorrects, gap.budget), `state matches the §10 rule for ${res.body.result.exam}`);
          assertEq(gap.gapCorrects, Math.round((gap.requiredCorrects - gap.meanCorrects) * 100) / 100, `G = req − c̄ for ${res.body.result.exam}`);
        }
        assertEq(neet.body.result.gap.budget, 54, 'NEET B at NOW_0926 (9 × 6, capped)');
        assertEq(ini.body.result.gap.budget, 5, 'INI B at NOW_0926 (floor(1.18 × 5))');
      });
    });

    await row('6.5.c determinism through the API: identical POSTs under one clock ⇒ identical records + hashes', async () => {
      await withFrozenClock(NOW_0926, async () => {
        const cookie = await login(USER_H.email);
        const body = gts('NEET_PG', 80, 82);
        const a = await postReadiness(cookie, body);
        const b = await postReadiness(cookie, body);
        expectStatus(a, 201, 'first');
        expectStatus(b, 201, 'second');
        assert(JSON.stringify(a.body.result) === JSON.stringify(b.body.result), 'served results byte-identical');
        const ga = await request(app).get(`/api/predictor/readiness/${a.body.readinessId}`).set('Cookie', cookie);
        const gb = await request(app).get(`/api/predictor/readiness/${b.body.readinessId}`).set('Cookie', cookie);
        expectStatus(ga, 200, 'GET a');
        expectStatus(gb, 200, 'GET b');
        assert(
          ga.body.integrity.resultHash === gb.body.integrity.resultHash,
          `stored hashes differ: ${ga.body.integrity.resultHash} vs ${gb.body.integrity.resultHash}`
        );
      });
    });

    await row('6.5.d persist-before-serve: every 201 carries readinessId; GET re-derives + verifies (stored §8 echo)', async () => {
      assert(storedId, 'a stored record exists from 6.5.a');
      const cookie = await login(USER_H.email);
      const res = await request(app).get(`/api/predictor/readiness/${storedId}`).set('Cookie', cookie);
      expectStatus(res, 200, 'GET stored');
      assertEq(res.body.integrity.matches, true, 'integrity hash matches');
      assertEq(res.body.verified, true, 're-derivation verifies (asOfIstDate pinning)');
      assertEq(res.body.result.calendar.daysRemaining, 36, 'stored daysRemaining echo (§8)');
      assertEq(
        Math.round(res.body.result.gap.monthsRemaining * 100) / 100,
        Math.round((36 / 30.44) * 100) / 100,
        'stored months = days / 30.44'
      );
    });

    await row('6.5.e tampered stored stage ⇒ GET reports matches:false + verified:false (never silently served)', async () => {
      assert(storedId, 'a stored record exists from 6.5.a');
      // 6.5.a's record is READY (INI 110 clears the 110c bar exactly), so the
      // tamper must write a DIFFERENT value or the bytes would not change.
      await ReadinessQuery.updateOne({ _id: storedId }, { $set: { state: 'MODERATELY_READY' } });
      const cookie = await login(USER_H.email);
      const res = await request(app).get(`/api/predictor/readiness/${storedId}`).set('Cookie', cookie);
      expectStatus(res, 200, 'GET tampered');
      assertEq(res.body.integrity.matches, false, 'tamper breaks the stored hash');
      assertEq(res.body.verified, false, 're-derivation disagrees with the tampered stage');
      assert(res.body.verification && typeof res.body.verification.note === 'string', 'verification diff block present');
    });

    await row('6.5.f own-only reads: another student’s id ⇒ 404 (no existence leak)', async () => {
      const cookie = await login(USER_R.email);
      const res = await request(app).get(`/api/predictor/readiness/${storedId}`).set('Cookie', cookie);
      expectStatus(res, 404, 'foreign id');
      expectBodyCode(res, 'NOT_FOUND', 'foreign id');
    });

    await row('6.5.g auth surface: 401 without a session on all three readiness routes', async () => {
      const cal = await request(app).get('/api/predictor/readiness/calendar');
      expectStatus(cal, 401, 'calendar');
      const post = await request(app).post('/api/predictor/readiness').send(gts('NEET_PG', 100));
      expectStatus(post, 401, 'POST');
      const got = await request(app).get(`/api/predictor/readiness/${storedId}`);
      expectStatus(got, 401, 'GET :id');
    });

    await row('6.5.h CSRF: foreign Origin POST ⇒ 403; local dev Origin passes the guard', async () => {
      const cookie = await login(USER_H.email);
      const evil = await postReadiness(cookie, gts('NEET_PG', 100), { Origin: 'https://evil.example' });
      expectStatus(evil, 403, 'evil origin');
      expectBodyCode(evil, 'CSRF_REJECTED', 'evil origin');
      // A same-site dev origin passes the guard and reaches validation (the
      // body is invalid on purpose — no budget spent on a fresh computation).
      const local = await postReadiness(cookie, { exam: 'NEET_PG' }, { Origin: 'http://localhost:5173' });
      expectStatus(local, 400, 'local origin reaches validation');
      expectBodyCode(local, 'INPUT_MODE_CONFLICT', 'local origin reaches validation');
    });

    await row('6.5.i rate limit: own 30/hr budget ⇒ 31st POST 429; sibling budgets unaffected', async () => {
      const cookie = await login(USER_R.email);
      // Burn the budget with cheap invalid bodies — the limiter runs BEFORE
      // validation, so these consume exactly like valid posts would.
      for (let i = 0; i < 30; i += 1) {
        const res = await postReadiness(cookie, { exam: 'NEET_PG' });
        assert(res.status === 400, `burn ${i + 1}: expected 400, got ${res.status}`);
      }
      const blocked = await postReadiness(cookie, gts('NEET_PG', 100));
      expectStatus(blocked, 429, '31st post');
      expectBodyCode(blocked, 'RATE_LIMITED', '31st post');
      // Own-budget isolation: a different student still gets 201 (real clock —
      // USER_H's only other real-window post was 6.5.h's validation pass).
      const other = await postReadiness(await login(USER_H.email), gts('NEET_PG', 70));
      expectStatus(other, 201, 'sibling budget unaffected');
    });
  } finally {
    // ---- harness teardown --------------------------------------------------------
    await new Promise((resolve) => mockAppApi.close(resolve));
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.connection.close();
    await mongoServer.stop();
  }

  return { passed, failed };
}

// =============================================================================
// Entry point
// =============================================================================

(async () => {
  const scope = process.argv.includes('--domain') ? 'domain' : process.argv.includes('--api') ? 'api' : 'all';

  let domain = { passed: 0, failed: 0 };
  let api = { passed: 0, failed: 0 };
  let crashed = null;

  if (scope === 'all' || scope === 'domain') {
    console.log('--- Readiness §18 census · layer 1: domain (offline engine) ---');
    domain = runDomainCensus();
  }
  if (scope === 'all' || scope === 'api') {
    console.log('--- Readiness §18 census · layer 2: booted API (real routes, mock App API + in-memory Mongo) ---');
    try {
      api = await runApiCensus();
    } catch (err) {
      crashed = err;
      console.log(`FAIL  api harness crashed\n      ${err && err.message ? err.message : err}`);
    }
  }

  console.log('');
  if (scope === 'all' || scope === 'domain') {
    if (domain.failed > 0) console.log(`EDGE CENSUS (domain layer): ${domain.failed}/${domain.passed + domain.failed} ROWS FAILED`);
    else console.log(`EDGE CENSUS (domain layer): ALL ${domain.passed} ROWS PASS`);
  }
  if (scope === 'all' || scope === 'api') {
    if (crashed) console.log('EDGE CENSUS (api layer):    HARNESS CRASHED');
    else if (api.failed > 0) console.log(`EDGE CENSUS (api layer):    ${api.failed}/${api.passed + api.failed} ROWS FAILED`);
    else console.log(`EDGE CENSUS (api layer):    ALL ${api.passed} ROWS PASS`);
  }
  if (scope === 'all') {
    const totalFailed = domain.failed + api.failed + (crashed ? 1 : 0);
    const total = domain.passed + api.passed;
    if (totalFailed > 0) console.log(`EDGE CENSUS: ${totalFailed} FAILURE(S) (domain ${domain.passed + domain.failed} + api rows ${total})`);
    else console.log(`EDGE CENSUS: ALL ${total} ROWS PASS (domain ${domain.passed} + api ${api.passed})`);
  }
  if (domain.failed > 0 || api.failed > 0 || crashed) process.exitCode = 1;
})().catch((err) => {
  console.error(`CENSUS CRASHED: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
});
