/**
 * Readiness Score — Phase 2 exam-calendar tests (docs/READINESS_SCORE.md
 * §26 Phase 2, §22.1): resolution with injected `now` (exam today/tomorrow
 * boundaries, IST date math, expected vs announced, horizon exhaustion ⇒
 * NO_UPCOMING_EXAM, explicit session, past-entry exclusion) plus the §18.2
 * load-time duplicate/shape self-checks and the §15 GET-snapshot shape.
 *
 * Every daysRemaining literal is hand-verifiable IST civil-date arithmetic AND
 * cross-checked against an independent Date-UTC computation in the same
 * assertion — the phase's "a reviewer can resolve 'next INI-CET as of date X'
 * by hand and match the module" completion criterion, pinned.
 */

const {
  CALENDAR_VERSION,
  DAYS_PER_MONTH,
  ENTRIES,
  createCalendar,
  validateEntries,
  resolve,
  nextExam,
  calendarSnapshot,
} = require('../../predictor/readinessCalendar');
const { READINESS } = require('../../predictor/config');
const { CODES, noUpcomingExam } = require('../../predictor/errors');

/** Independent civil-day counter (UTC-midnight ms arithmetic — no shared code path). */
function utcDaysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}

/** Independent today+n ISO-date builder for horizon fixtures. */
function utcAddDays(iso, days) {
  return new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);
}

/** Run fn, return the thrown error (or null) for typed-code assertions. */
function thrownBy(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
}

const at = (utcIso) => new Date(utcIso);

// Phase-0 verification day (2026-09-26) at 09:30 IST — the spec §7.3 "36 days
// away" anchor instant.
const NOW_0926 = at('2026-09-26T04:00:00Z');

function fixtureEntry(overrides = {}) {
  const session = overrides.session !== undefined ? overrides.session : '2027-07';
  // Derive the v3 sitting from the admission key ('-01' keys are November
  // sittings, '-07' keys May) unless the fixture pins one explicitly.
  const derivedSession = session.endsWith('-01') ? 'NOVEMBER' : 'MAY';
  return {
    exam: 'INI_CET',
    session,
    examSession: derivedSession,
    examDate: '2027-05-16',
    status: 'expected',
    sourceUrl: 'https://aiimsexams.ac.in/',
    verifiedAsOf: '2026-09-26',
    note: 'fixture',
    ...overrides,
  };
}

describe('Readiness Score — Phase 2 exam calendar', () => {
  describe('seed sanity + load-time self-check (§18.2)', () => {
    test('module loads with a validated, versioned, deterministic seed', () => {
      expect(CALENDAR_VERSION).toBe('readiness-calendar-v3');
      expect(() => createCalendar(ENTRIES)).not.toThrow(); // the seed re-validates
      const byExam = ENTRIES.reduce(
        (acc, e) => ({ ...acc, [e.exam]: [...(acc[e.exam] || []), e.session] }),
        {}
      );
      expect(byExam).toEqual({
        INI_CET: ['2027-01', '2027-07', '2028-01', '2028-07', '2029-01'],
        NEET_PG: ['2027', '2028'],
      });
    });

    test('seed matches the Phase-0 findings: one announced INI-CET entry, cadence placeholders on Sundays', () => {
      const announced = ENTRIES.filter((e) => e.status === 'announced');
      expect(announced).toHaveLength(1);
      expect(announced[0]).toMatchObject({
        exam: 'INI_CET',
        session: '2027-01',
        examSession: 'NOVEMBER',
        examDate: '2026-11-01',
      });
      for (const e of ENTRIES.filter((x) => x.status === 'expected')) {
        expect(new Date(`${e.examDate}T00:00:00Z`).getUTCDay()).toBe(0); // Sunday cadence
        expect(e.sourceUrl).toMatch(/^https:\/\/(aiimsexams\.ac\.in|natboard\.edu\.in)\//);
        expect(e.verifiedAsOf).toMatch(/^2026-09-2[678]$/);
      }
      // The NEET PG 2028 placeholder (target-year window) — exact shape pin.
      expect(ENTRIES).toContainEqual(
        expect.objectContaining({ exam: 'NEET_PG', session: '2028', examDate: '2028-08-13', status: 'expected' })
      );
      // v3: every INI-CET entry carries its exam-calendar sitting, and each
      // offered year has BOTH sittings (2026 November-only: May already
      // happened — past sittings are never seeded).
      const ini = ENTRIES.filter((e) => e.exam === 'INI_CET');
      expect(ini.map((e) => [Number(e.examDate.slice(0, 4)), e.examSession])).toEqual([
        [2026, 'NOVEMBER'],
        [2027, 'MAY'],
        [2027, 'NOVEMBER'],
        [2028, 'MAY'],
        [2028, 'NOVEMBER'],
      ]);
    });

    test('duplicate session or duplicate examDate within an exam fails the load-time check', () => {
      const dupSession = [fixtureEntry(), fixtureEntry({ examDate: '2027-05-17' })];
      expect(thrownBy(() => validateEntries(dupSession)).code).toBe(CODES.DATA_INTEGRITY);
      const dupDate = [fixtureEntry(), fixtureEntry({ session: '2028-01' })];
      expect(thrownBy(() => validateEntries(dupDate)).code).toBe(CODES.DATA_INTEGRITY);
    });

    test('malformed entries fail the load-time check (shape, dates, status, source, session, exam)', () => {
      for (const bad of [
        [],
        [null],
        [fixtureEntry({ examDate: '2027-02-30' })],
        [fixtureEntry({ examDate: '2027-5-16' })],
        [fixtureEntry({ verifiedAsOf: '09/26/2026' })],
        [fixtureEntry({ status: 'rumored' })],
        [fixtureEntry({ sourceUrl: 'http://aiimsexams.ac.in/' })],
        [fixtureEntry({ session: '2027-13' })],
        [fixtureEntry({ exam: 'FMGE' })],
        [fixtureEntry({ note: 42 })],
      ]) {
        const err = thrownBy(() => validateEntries(bad));
        expect(err).not.toBeNull();
        expect(err.code).toBe(CODES.DATA_INTEGRITY);
      }
    });

    test('v3 examSession self-checks: missing/invalid on INI, present on NEET, key contradictions, dup sitting', () => {
      for (const bad of [
        [fixtureEntry({ examSession: undefined })], // INI entry without a sitting
        [fixtureEntry({ examSession: 'JUNE' })], // not a sitting name
        [fixtureEntry({ session: '2028-01', examSession: 'MAY' })], // '-01' key must be NOVEMBER
        [fixtureEntry({ session: '2027-01', examDate: '2026-11-01', examSession: 'MAY' })], // same, explicit date
        [
          // two MAY sittings of one calendar year ⇒ ambiguous (year, session)
          [fixtureEntry({ examDate: '2027-05-16' }), fixtureEntry({ session: '2027-05', examDate: '2027-05-23', examSession: 'MAY' })],
        ][0],
        [{ ...fixtureEntry(), exam: 'NEET_PG', session: '2027', examSession: 'MAY' }], // NEET sits once
      ]) {
        const err = thrownBy(() => validateEntries(bad));
        expect(err).not.toBeNull();
        expect(err.code).toBe(CODES.DATA_INTEGRITY);
        expect(err.message).toMatch(/examSession|sitting/i);
      }
    });
  });

  describe('resolution as of the Phase-0 verification day (2026-09-26)', () => {
    test('INI-CET: announced 1 Nov 2026, 36 days out, no DATE_EXPECTED (§7.3 pin)', () => {
      const r = resolve('INI_CET', NOW_0926);
      expect(r).toMatchObject({
        exam: 'INI_CET',
        session: '2027-01',
        examSession: 'NOVEMBER',
        targetLabel: 'November 2026',
        examDate: '2026-11-01',
        status: 'announced',
        sourceUrl: 'https://aiimsexams.ac.in/',
        verifiedAsOf: '2026-09-26',
        daysRemaining: 36,
        asOfIstDate: '2026-09-26',
        calendarVersion: CALENDAR_VERSION,
        horizonDays: 548,
      });
      expect(r.warnings).toEqual([]);
      expect(r.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2026-11-01')); // independent path
    });

    test('NEET PG: expected mid-Aug 2027 placeholder, 323 days out, DATE_EXPECTED carried', () => {
      const r = resolve('NEET_PG', NOW_0926);
      expect(r).toMatchObject({
        exam: 'NEET_PG',
        session: '2027',
        examDate: '2027-08-15',
        status: 'expected',
        sourceUrl: 'https://natboard.edu.in/',
        daysRemaining: 323,
      });
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].code).toBe('DATE_EXPECTED');
      expect(r.warnings[0].note).toMatch(/not yet officially announced/i);
      expect(r.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2027-08-15'));
    });

    test('monthsRemaining follows the pinned §8 definition: days / 30.44', () => {
      expect(DAYS_PER_MONTH).toBe(30.44);
      expect(resolve('NEET_PG', NOW_0926).monthsRemaining).toBeCloseTo(323 / DAYS_PER_MONTH, 10);
      expect(resolve('INI_CET', NOW_0926).monthsRemaining).toBeCloseTo(36 / DAYS_PER_MONTH, 10);
    });

    test('echo contract (§7.2 rule 5): every field a banner/record needs is present', () => {
      const r = resolve('INI_CET', NOW_0926);
      for (const key of [
        'exam',
        'session',
        'examSession',
        'targetLabel',
        'examDate',
        'status',
        'sourceUrl',
        'verifiedAsOf',
        'note',
        'daysRemaining',
        'monthsRemaining',
        'warnings',
        'asOfIstDate',
        'calendarVersion',
        'horizonDays',
        'targetYear',
        'targetSession',
      ]) {
        expect(r).toHaveProperty(key);
      }
      expect(typeof r.note).toBe('string');
      // Default resolution carries no explicit pick; NEET entries have no
      // sitting identity (one exam a year).
      expect(resolve('INI_CET', NOW_0926)).toMatchObject({ targetYear: null, targetSession: null });
      expect(resolve('NEET_PG', NOW_0926)).toMatchObject({ examSession: null, targetLabel: '2027' });
    });
  });

  describe('IST calendar-date math + today/tomorrow boundaries (§7.4, §8)', () => {
    test('"exam tomorrow" reads 1 at 23:00 IST and 06:00 IST alike (date granularity)', () => {
      expect(resolve('INI_CET', at('2026-10-31T17:30:00Z')).daysRemaining).toBe(1); // 23:00 IST Oct 31
      expect(resolve('INI_CET', at('2026-10-31T00:30:00Z')).daysRemaining).toBe(1); // 06:00 IST Oct 31
    });

    test('exam day reads 0 — including instants whose UTC date is still yesterday', () => {
      const r = resolve('INI_CET', at('2026-10-31T19:00:00Z')); // 00:30 IST Nov 1; UTC date Oct 31
      expect(r.daysRemaining).toBe(0);
      expect(r.asOfIstDate).toBe('2026-11-01');
      expect(resolve('INI_CET', at('2026-11-01T04:00:00Z')).daysRemaining).toBe(0); // 09:30 IST
    });

    test('the IST rollover boundary: 23:59 IST is still day 0; 00:01 IST the next day is past', () => {
      expect(resolve('INI_CET', at('2026-11-01T18:29:00Z')).daysRemaining).toBe(0); // 23:59 IST Nov 1
      const rolled = resolve('INI_CET', at('2026-11-01T18:31:00Z')); // 00:01 IST Nov 2
      expect(rolled.session).toBe('2027-07'); // 2026-11-01 excluded as past
      expect(rolled.daysRemaining).toBe(utcDaysBetween('2026-11-02', '2027-05-16'));
    });

    test('past entries never resolve (daysRemaining ≥ 0 always)', () => {
      const r = resolve('INI_CET', at('2026-12-01T10:00:00Z')); // 15:30 IST Dec 1
      expect(r).toMatchObject({ session: '2027-07', examDate: '2027-05-16', status: 'expected' });
      expect(r.daysRemaining).toBe(utcDaysBetween('2026-12-01', '2027-05-16'));
    });
  });

  describe('expected vs announced + horizon (§7.2 rules 3–4)', () => {
    test('an expected resolution carries exactly the DATE_EXPECTED warning', () => {
      const r = resolve('INI_CET', at('2026-12-01T10:00:00Z'));
      expect(r.warnings.map((w) => w.code)).toEqual(['DATE_EXPECTED']);
    });

    test('horizon exhaustion ⇒ typed NO_UPCOMING_EXAM (never a silent guess)', () => {
      // 2028-11-13 IST: past every seeded date of BOTH exams — NEET '2028'
      // (8/13) and the INI November 2028 sitting (11/12).
      const now = at('2028-11-13T06:00:00Z');
      for (const exam of ['NEET_PG', 'INI_CET']) {
        const err = thrownBy(() => resolve(exam, now));
        expect(err).not.toBeNull();
        expect(err.code).toBe(CODES.NO_UPCOMING_EXAM);
        expect(err.details).toMatchObject({ exam, horizonDays: 548 });
        expect(err.message).toMatch(/check back/i);
      }
    });

    test('NEET-only exhaustion while INI-CET still resolves (the 2028 asymmetry)', () => {
      // 2028-08-20: NEET '2028' (8/13) passed with no later seed; INI-CET's
      // November 2028 sitting (11/12) is still ahead.
      const now = at('2028-08-20T06:00:00Z');
      const neetErr = thrownBy(() => resolve('NEET_PG', now));
      expect(neetErr.code).toBe(CODES.NO_UPCOMING_EXAM);
      const ini = resolve('INI_CET', now);
      expect(ini).toMatchObject({ examSession: 'NOVEMBER', examDate: '2028-11-12', targetLabel: 'November 2028' });
    });

    test('NEET-only exhaustion while INI-CET still resolves (per-exam calendars)', () => {
      // Fixture calendars pin the per-exam independence; the live seed now
      // falls forward past NEET 2027 to the 2028 placeholder (next test).
      const now = at('2027-09-01T10:00:00Z'); // 15:30 IST — past 2027-08-15
      const neetOnly = createCalendar([fixtureEntry({ session: '2028-01', examDate: '2027-11-14' })]); // INI entries only
      const neetErr = thrownBy(() => neetOnly.resolve('NEET_PG', now));
      expect(neetErr.code).toBe(CODES.NO_UPCOMING_EXAM);
      const ini = neetOnly.resolve('INI_CET', now);
      expect(ini).toMatchObject({ session: '2028-01', examDate: '2027-11-14' });
    });

    test('live seed: an expired expected date falls forward to the next seeded edition', () => {
      const now = at('2027-09-01T10:00:00Z'); // 15:30 IST — past 2027-08-15, no announcement
      const neet = resolve('NEET_PG', now);
      expect(neet).toMatchObject({ session: '2028', examDate: '2028-08-13', status: 'expected' });
      expect(neet.daysRemaining).toBe(utcDaysBetween('2027-09-01', '2028-08-13'));
      const ini = resolve('INI_CET', now);
      expect(ini).toMatchObject({ session: '2028-01', examDate: '2027-11-14' });
      expect(ini.daysRemaining).toBe(utcDaysBetween('2027-09-01', '2027-11-14'));
    });

    test('horizon boundary is inclusive: +548 days resolves, +549 does not (fixture)', () => {
      const now = at('2027-01-10T12:00:00Z'); // 17:30 IST Jan 10
      const inside = createCalendar([fixtureEntry({ examDate: utcAddDays('2027-01-10', 548) })]);
      expect(inside.resolve('INI_CET', now).daysRemaining).toBe(548);
      const outside = createCalendar([fixtureEntry({ examDate: utcAddDays('2027-01-10', 549) })]);
      const err = thrownBy(() => outside.resolve('INI_CET', now));
      expect(err.code).toBe(CODES.NO_UPCOMING_EXAM);
    });

    test('horizon is config-driven: READINESS.CALENDAR.HORIZON_DAYS = 548', () => {
      expect(READINESS.CALENDAR.HORIZON_DAYS).toBe(548);
      expect(resolve('INI_CET', NOW_0926).horizonDays).toBe(READINESS.CALENDAR.HORIZON_DAYS);
    });
  });

  describe('explicit session — planning mode (§7.2 rule 6, §18.1)', () => {
    test('a later listed session resolves under the same rules and echo', () => {
      const r = resolve('INI_CET', NOW_0926, { session: '2027-07' });
      expect(r).toMatchObject({ session: '2027-07', examDate: '2027-05-16', status: 'expected' });
      expect(r.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2027-05-16'));
      const later = resolve('INI_CET', NOW_0926, { session: '2028-01' });
      expect(later.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2027-11-14'));
    });

    test('unknown session (not listed for the exam, or the other exam\'s key) ⇒ INVALID_INPUT', () => {
      for (const session of ['2026-01', '2027', '']) {
        const err = thrownBy(() => resolve('INI_CET', NOW_0926, { session }));
        expect(err.code).toBe(CODES.INVALID_INPUT);
        expect(err.details).toMatchObject({ field: 'session', session });
      }
    });

    test('a session that has already taken place ⇒ INVALID_INPUT (session) — §18.1 "≥ today"', () => {
      const err = thrownBy(() => resolve('INI_CET', at('2026-11-02T04:00:00Z'), { session: '2027-01' }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'session', session: '2027-01' });
      expect(err.message).toMatch(/already taken place/);
    });

    test('a listed session beyond the horizon ⇒ NO_UPCOMING_EXAM (same rules, rule 6)', () => {
      const now = at('2027-01-10T12:00:00Z');
      const cal = createCalendar([
        fixtureEntry({ session: '2029-01', examDate: utcAddDays('2027-01-10', 600) }),
      ]);
      const err = thrownBy(() => cal.resolve('INI_CET', now, { session: '2029-01' }));
      expect(err.code).toBe(CODES.NO_UPCOMING_EXAM);
      expect(err.details).toMatchObject({ session: '2029-01' });
    });
  });

  describe('target year — target-exam selection (§7.2 rule 7, v3 calendar-year semantics)', () => {
    test('NEET PG targetYear resolves that year’s edition; days remaining follow the year', () => {
      const r2027 = resolve('NEET_PG', NOW_0926, { targetYear: 2027 });
      expect(r2027).toMatchObject({ targetYear: 2027, session: '2027', examDate: '2027-08-15' });
      expect(r2027.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2027-08-15'));
      const r2028 = resolve('NEET_PG', NOW_0926, { targetYear: 2028 });
      expect(r2028).toMatchObject({ targetYear: 2028, session: '2028', examDate: '2028-08-13' });
      expect(r2028.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2028-08-13'));
      expect(r2028.daysRemaining).toBeGreaterThan(r2027.daysRemaining);
    });

    test('the year window — not the horizon — bounds targeting: NEET 2028 (>548 days) resolves by year, raw session 409s', () => {
      const byYear = resolve('NEET_PG', NOW_0926, { targetYear: 2028 });
      expect(byYear.daysRemaining).toBeGreaterThan(548);
      const bySession = thrownBy(() => resolve('NEET_PG', NOW_0926, { session: '2028' }));
      expect(bySession.code).toBe(CODES.NO_UPCOMING_EXAM);
    });

    test('INI-CET targetYear is the CALENDAR year of the exam date — the displayed year always matches the pick', () => {
      // The v2 admission-year bug this replaces: targetYear 2027 used to
      // resolve the Jan-2027 admission session whose exam was 1 Nov 2026.
      const r2026 = resolve('INI_CET', NOW_0926, { targetYear: 2026 });
      expect(r2026).toMatchObject({
        targetYear: 2026,
        session: '2027-01',
        examSession: 'NOVEMBER',
        targetLabel: 'November 2026',
        examDate: '2026-11-01',
      });
      expect(r2026.daysRemaining).toBe(utcDaysBetween('2026-09-26', '2026-11-01'));
      const r2027 = resolve('INI_CET', NOW_0926, { targetYear: 2027 });
      expect(r2027).toMatchObject({
        targetYear: 2027,
        session: '2027-07',
        examSession: 'MAY',
        targetLabel: 'May 2027',
        examDate: '2027-05-16',
      });
      const r2028 = resolve('INI_CET', NOW_0926, { targetYear: 2028 });
      expect(r2028).toMatchObject({ targetYear: 2028, session: '2028-07', examDate: '2028-05-21' });
      // Every resolution's exam date falls inside its picked year — always.
      for (const year of [2026, 2027, 2028]) {
        expect(Number(resolve('INI_CET', NOW_0926, { targetYear: year }).examDate.slice(0, 4))).toBe(year);
      }
    });

    test('a year whose first sitting passed falls forward to its next sitting', () => {
      const now = at('2027-05-17T04:00:00Z'); // the May 2027 sitting took place 16 May
      const r = resolve('INI_CET', now, { targetYear: 2027 });
      expect(r).toMatchObject({
        targetYear: 2027,
        session: '2028-01',
        examSession: 'NOVEMBER',
        targetLabel: 'November 2027',
        examDate: '2027-11-14',
      });
    });

    test('a year whose sittings have ALL passed ⇒ INVALID_INPUT "already taken place" (pastTarget)', () => {
      const now = at('2026-11-02T04:00:00Z'); // the November 2026 sitting took place 1 Nov
      const err = thrownBy(() => resolve('INI_CET', now, { targetYear: 2026 }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'targetYear', targetYear: 2026, pastTarget: true });
      expect(err.message).toMatch(/already taken place/);
    });

    test('window validation: past year / beyond-span year carry the window in details', () => {
      for (const bad of [2025, 2029]) {
        const err = thrownBy(() => resolve('NEET_PG', NOW_0926, { targetYear: bad }));
        expect(err.code).toBe(CODES.INVALID_INPUT);
        expect(err.details).toMatchObject({ field: 'targetYear', targetYear: bad, minYear: 2026, maxYear: 2028 });
        expect(err.message).toMatch(/between 2026 and 2028/);
      }
    });

    test('the window rolls with the clock (dynamic years, never a hardcoded list)', () => {
      const now = at('2027-04-01T04:00:00Z'); // 09:30 IST — window becomes 2027..2029
      const past = thrownBy(() => resolve('NEET_PG', now, { targetYear: 2026 }));
      expect(past.details).toMatchObject({ field: 'targetYear', minYear: 2027, maxYear: 2029 });
      const stillValid = resolve('NEET_PG', now, { targetYear: 2027 });
      expect(stillValid).toMatchObject({ session: '2027', targetYear: 2027 });
      // 2029 is inside the window but has no seed yet ⇒ offered never, guessed never.
      const unseeded = thrownBy(() => resolve('NEET_PG', now, { targetYear: 2029 }));
      expect(unseeded.code).toBe(CODES.INVALID_INPUT);
      expect(unseeded.message).toMatch(/not on the exam calendar/);
    });

    test('malformed targetYear values ⇒ INVALID_INPUT (never clamped, never coerced)', () => {
      for (const bad of [2027.5, '2027.5', 'abcd', '02027', true, {}, NaN, -1]) {
        const err = thrownBy(() => resolve('NEET_PG', NOW_0926, { targetYear: bad }));
        expect(err.code).toBe(CODES.INVALID_INPUT);
        expect(err.details).toMatchObject({ field: 'targetYear' });
      }
    });

    test('a 4-digit numeric string normalizes to the same resolution as the number', () => {
      expect(resolve('NEET_PG', NOW_0926, { targetYear: '2027' })).toEqual(
        resolve('NEET_PG', NOW_0926, { targetYear: 2027 })
      );
    });

    test('a year with no calendar entry (NEET PG 2026 — that edition already took place) ⇒ INVALID_INPUT', () => {
      const err = thrownBy(() => resolve('NEET_PG', NOW_0926, { targetYear: 2026 }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'targetYear', targetYear: 2026, exam: 'NEET_PG' });
      expect(err.message).toMatch(/not on the exam calendar/);
    });

    test('session + targetYear together ⇒ INVALID_INPUT (exactly one targeting mechanism)', () => {
      const err = thrownBy(() =>
        resolve('INI_CET', NOW_0926, { session: '2027-07', targetYear: 2027 })
      );
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'targetYear' });
    });

    test('default and explicit-session resolutions echo targetYear: null', () => {
      expect(resolve('NEET_PG', NOW_0926).targetYear).toBeNull();
      expect(resolve('INI_CET', NOW_0926, { session: '2027-07' }).targetYear).toBeNull();
    });
  });

  describe('target session — INI-CET sitting selection (§7.2 rule 8, v3)', () => {
    test('targetYear + targetSession resolves that exact sitting; sessions of one year differ', () => {
      const may = resolve('INI_CET', NOW_0926, { targetYear: 2027, targetSession: 'MAY' });
      expect(may).toMatchObject({
        targetYear: 2027,
        targetSession: 'MAY',
        session: '2027-07',
        examSession: 'MAY',
        targetLabel: 'May 2027',
        examDate: '2027-05-16',
      });
      const november = resolve('INI_CET', NOW_0926, { targetYear: 2027, targetSession: 'NOVEMBER' });
      expect(november).toMatchObject({
        targetYear: 2027,
        targetSession: 'NOVEMBER',
        session: '2028-01',
        examSession: 'NOVEMBER',
        targetLabel: 'November 2027',
        examDate: '2027-11-14',
      });
      expect(november.daysRemaining).toBeGreaterThan(may.daysRemaining);
      // The picked year stays the exam date's year under either sitting.
      expect(Number(may.examDate.slice(0, 4))).toBe(2027);
      expect(Number(november.examDate.slice(0, 4))).toBe(2027);
    });

    test('2028 offers both sittings; November 2028 resolves the far seed (beyond the raw-session horizon)', () => {
      const may = resolve('INI_CET', NOW_0926, { targetYear: 2028, targetSession: 'MAY' });
      expect(may).toMatchObject({ examDate: '2028-05-21', targetLabel: 'May 2028' });
      const november = resolve('INI_CET', NOW_0926, { targetYear: 2028, targetSession: 'NOVEMBER' });
      expect(november).toMatchObject({ examDate: '2028-11-12', session: '2029-01', targetLabel: 'November 2028' });
    });

    test('a seeded sitting that has passed ⇒ INVALID_INPUT with pastTarget + the entry (rollover primitive)', () => {
      const err = thrownBy(() =>
        resolve('INI_CET', at('2026-11-02T04:00:00Z'), { targetYear: 2026, targetSession: 'NOVEMBER' })
      );
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({
        field: 'targetSession',
        targetSession: 'NOVEMBER',
        targetYear: 2026,
        session: '2027-01',
        examDate: '2026-11-01',
        targetLabel: 'November 2026',
        pastTarget: true,
      });
    });

    test('an unseeded MAY pick is decidable from config: upcoming NOVEMBER of the year ⇒ "already taken place"', () => {
      // May 2026 is not seeded (past sittings never are); November 2026 is
      // upcoming — so the May sitting is inferably past and flagged for rollover.
      const err = thrownBy(() => resolve('INI_CET', NOW_0926, { targetYear: 2026, targetSession: 'MAY' }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'targetSession', pastTarget: true });
      expect(err.message).toMatch(/May session has already taken place/);
    });

    test('an unseeded later sitting (NOVEMBER with only MAY seeded) ⇒ honest "not on the calendar", no pastTarget', () => {
      const cal = createCalendar([
        fixtureEntry({ session: '2027-07', examDate: '2027-05-16' }),
        fixtureEntry({ session: '2027-01', examDate: '2026-11-01' }),
      ]);
      const err = thrownBy(() => cal.resolve('INI_CET', NOW_0926, { targetYear: 2027, targetSession: 'NOVEMBER' }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'targetSession', targetYear: 2027 });
      expect(err.details.pastTarget).toBeUndefined();
      expect(err.message).toMatch(/not on the exam calendar/);
    });

    test('targetSession is INI-CET only — NEET PG rejects it with one-session-a-year wording', () => {
      const err = thrownBy(() => resolve('NEET_PG', NOW_0926, { targetYear: 2027, targetSession: 'MAY' }));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'targetSession', exam: 'NEET_PG' });
      expect(err.message).toMatch(/one exam session a year/i);
    });

    test('targetSession misuse ⇒ INVALID_INPUT: bad value, without a year, beside a raw session', () => {
      const badValue = thrownBy(() => resolve('INI_CET', NOW_0926, { targetYear: 2027, targetSession: 'may' }));
      expect(badValue.details).toMatchObject({ field: 'targetSession', allowed: ['MAY', 'NOVEMBER'] });
      const noYear = thrownBy(() => resolve('INI_CET', NOW_0926, { targetSession: 'MAY' }));
      expect(noYear.details).toMatchObject({ field: 'targetSession' });
      expect(noYear.message).toMatch(/needs its target year/i);
      const withSession = thrownBy(() =>
        resolve('INI_CET', NOW_0926, { session: '2027-07', targetSession: 'MAY' })
      );
      expect(withSession.details).toMatchObject({ field: 'targetSession' });
    });

    test('snapshot targets: the authoritative (year, session) menu (ascending, echo-complete, default-aligned)', () => {
      const snap = calendarSnapshot(NOW_0926);
      expect(snap.exams.NEET_PG.targets.map((t) => [t.targetYear, t.targetSession ?? null, t.session])).toEqual([
        [2027, null, '2027'],
        [2028, null, '2028'],
      ]); // 2026 absent: that edition already took place
      expect(snap.exams.INI_CET.targets.map((t) => [t.targetYear, t.targetSession, t.targetLabel])).toEqual([
        [2026, 'NOVEMBER', 'November 2026'], // May 2026 passed — never offered
        [2027, 'MAY', 'May 2027'],
        [2027, 'NOVEMBER', 'November 2027'],
        [2028, 'MAY', 'May 2028'],
        [2028, 'NOVEMBER', 'November 2028'],
      ]);
      for (const exam of Object.keys(snap.exams)) {
        for (const key of ['targetYear', 'targetSession', 'targetLabel', 'session', 'examDate', 'status', 'daysRemaining', 'warnings']) {
          expect(snap.exams[exam].targets[0]).toHaveProperty(key);
        }
        // The menu's first entry is always the default resolution's session.
        expect(snap.exams[exam].targets[0].session).toBe(snap.exams[exam].next.session);
      }
    });

    test('the menu drops passed sittings automatically as the clock rolls (no hardcoded cutoffs)', () => {
      const afterNov2026 = calendarSnapshot(at('2026-11-02T04:00:00Z'));
      expect(afterNov2026.exams.INI_CET.targets.map((t) => [t.targetYear, t.targetSession])).toEqual([
        [2027, 'MAY'],
        [2027, 'NOVEMBER'],
        [2028, 'MAY'],
        [2028, 'NOVEMBER'],
      ]); // calendar year 2026 gone entirely — its only sitting passed
      const afterMay2027 = calendarSnapshot(at('2027-05-17T04:00:00Z'));
      expect(afterMay2027.exams.INI_CET.targets.map((t) => [t.targetYear, t.targetSession])).toEqual([
        [2027, 'NOVEMBER'], // May 2027 passed — dropped, November remains
        [2028, 'MAY'],
        [2028, 'NOVEMBER'],
      ]);
    });
  });

  describe('inputs, determinism, snapshot shape (§15, FR-10)', () => {
    test('unknown exam ⇒ INVALID_INPUT (exam)', () => {
      const err = thrownBy(() => resolve('FMGE', NOW_0926));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'exam' });
    });

    test('now accepts Date, ISO string, epoch ms — identical resolution; garbage rejected', () => {
      const instant = '2026-09-26T04:00:00Z';
      const viaDate = resolve('INI_CET', at(instant));
      expect(resolve('INI_CET', instant)).toEqual(viaDate);
      expect(resolve('INI_CET', Date.parse(instant))).toEqual(viaDate);
      const err = thrownBy(() => resolve('INI_CET', 'not-a-date'));
      expect(err.code).toBe(CODES.INVALID_INPUT);
      expect(err.details).toMatchObject({ field: 'now' });
    });

    test('determinism: identical (exam, now) ⇒ byte-identical results (FR-10)', () => {
      const a = resolve('NEET_PG', NOW_0926);
      const b = resolve('NEET_PG', NOW_0926);
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a))).toEqual(a); // stored-record round-trip
    });

    test('nextExam: null on an exhausted calendar (200-shaped empty, never 4xx), typed on unknown exam', () => {
      const now = at('2028-11-13T06:00:00Z'); // past every seeded date of both exams
      expect(nextExam('NEET_PG', now)).toBeNull();
      expect(nextExam('INI_CET', now)).toBeNull();
      const err = thrownBy(() => nextExam('FMGE', now));
      expect(err.code).toBe(CODES.INVALID_INPUT);
    });

    test('calendarSnapshot matches the GET /readiness/calendar contract (§15)', () => {
      const snap = calendarSnapshot(NOW_0926);
      expect(snap.calendarVersion).toBe(CALENDAR_VERSION);
      expect(Object.keys(snap.exams).sort()).toEqual(['INI_CET', 'NEET_PG']);
      expect(snap.exams.INI_CET.next).toMatchObject({
        session: '2027-01',
        examDate: '2026-11-01',
        status: 'announced',
        daysRemaining: 36,
      });
      expect(snap.exams.NEET_PG.next).toMatchObject({
        session: '2027',
        examDate: '2027-08-15',
        status: 'expected',
      });
      for (const exam of Object.keys(snap.exams)) {
        expect(snap.exams[exam].horizonDays).toBe(548);
        for (const key of ['session', 'examDate', 'status', 'sourceUrl', 'verifiedAsOf', 'daysRemaining']) {
          expect(snap.exams[exam].next).toHaveProperty(key);
        }
      }
      const empty = calendarSnapshot(at('2028-11-13T06:00:00Z'));
      expect(empty.exams.NEET_PG.next).toBeNull();
      expect(empty.exams.INI_CET.next).toBeNull();
      expect(empty.exams.NEET_PG.targets).toEqual([]);
      expect(empty.exams.INI_CET.targets).toEqual([]);
    });

    test('errors contract: NO_UPCOMING_EXAM code + factory exist for the Phase-4 409 mapping', () => {
      expect(CODES.NO_UPCOMING_EXAM).toBe('NO_UPCOMING_EXAM');
      const err = noUpcomingExam('none listed', { exam: 'NEET_PG' });
      expect(err.name).toBe('PredictorError');
      expect(err.code).toBe('NO_UPCOMING_EXAM');
    });
  });
});
