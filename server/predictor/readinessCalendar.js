'use strict';

const { EXAMS, READINESS } = require('./config');
const { PredictorError, invalidInput, dataIntegrity, noUpcomingExam } = require('./errors');

/**
 * Readiness Score — exam calendar (Feature 09, docs/READINESS_SCORE.md
 * §7 Upcoming-Exam-Date Handling, §8 Days/Months Remaining).
 *
 * A versioned SERVER-SIDE calendar of upcoming exam sessions. The frontend
 * never decides an exam date (FR-3); it only renders what this resolver
 * returns. This is deliberately plain CommonJS config + resolver, NOT a
 * predictor-data snapshot: exam dates change 2–4× a year and every change is
 * a reviewable code commit with a CALENDAR_VERSION bump, not a data-store
 * republish (§7.2).
 *
 * Resolution rules (§7.2, deterministic, unit-tested with injected `now`):
 *   1. candidates = entries of the requested exam with examDate ≥ today (IST).
 *   2. the EARLIEST candidate wins.
 *   3. status 'expected' ⇒ DATE_EXPECTED warning + "not yet officially
 *      announced" labeling (never a silent guess).
 *   4. no candidate within READINESS.CALENDAR.HORIZON_DAYS ⇒ NO_UPCOMING_EXAM.
 *   5. every result echoes calendarVersion + the entry's
 *      status/sourceUrl/verifiedAsOf + daysRemaining.
 *   6. an explicit `session` targets that listed session (planning mode);
 *      unknown/past session keys are INVALID_INPUT (§18.1).
 *   7. an explicit `targetYear` targets the student's intended EXAM YEAR
 *      (target-exam selection): candidates are the entries whose session key
 *      carries that year (NEET PG '2028'; INI-CET '2028-01'/'2028-07' — the
 *      admission-session year, matching the product's session naming), and
 *      the earliest STILL-UPCOMING one wins, so a year whose first session
 *      passed falls forward to its next session. The allowed window is
 *      [current IST year, current IST year + TARGET_YEAR_SPAN] — the student's
 *      explicit pick inside that window replaces the §7.2-rule-4 horizon (the
 *      honesty mechanism for a far pick is the expected-date labeling, and the
 *      §9.4 budget caps at CAP_MONTHS regardless). Years outside the window,
 *      non-integer values, a `session`+`targetYear` combination, or a year
 *      with no upcoming calendar entry are INVALID_INPUT (§18.1).
 *
 * Timezone rule (§7.4): exam dates are IST calendar dates. daysRemaining is a
 * difference of IST CIVIL DATES (date granularity, never hour granularity), so
 * "exam tomorrow" reads 1 at 11 PM IST and 6 AM IST alike. All arithmetic is
 * done on UTC day-numbers after a fixed +05:30 shift — correct regardless of
 * the host machine's timezone (dev IST, prod UTC).
 *
 * Session-key convention (§7.2 "matches counselling snapshots"): INI-CET
 * sessions are the store's 'YYYY-MM' counselling keys ('2027-01' = the Jan
 * 2027 admission session, fed by the Nov 2026 exam). NEET PG counselling is
 * YEAR-scoped (EXAMS.NEET_PG.counselling has examYear, no session key), so a
 * NEET PG session is the plain exam year 'YYYY' ('2027' = NEET PG 2027).
 *
 * Maintenance SOP (§7.3): when AIIMS/NBEMS publishes a date, a maintainer
 * updates the entry (status 'announced', real date, sourceUrl, verifiedAsOf),
 * bumps CALENDAR_VERSION, and the change ships as a normal reviewed commit.
 * No env vars are involved (deliberately, §23). The seed must also KEEP PACE
 * with the target-year window: rule 7 offers every year in
 * [current year, current year + TARGET_YEAR_SPAN], so as the window rolls
 * forward a maintainer adds the next cadence-derived `expected` placeholder
 * (R2) for each exam — a missing year simply isn't offered (INVALID_INPUT),
 * never guessed.
 *
 * Engine-layer purity (§14.2): zero dependencies beyond config/errors; never
 * imports routes or models. Phase 4's rollover handling (§18.2 — "server's
 * resolution wins + note when a client-sent session passed between page load
 * and submit") builds ON this strict primitive: catch the past-session
 * INVALID_INPUT, fall back to default resolution, annotate.
 */

/** Bump on ANY calendar entry edit (spec §21 version table; SOP §7.3). */
const CALENDAR_VERSION = 'readiness-calendar-v2';

/** Spec §8 pins 30.44 (mean Gregorian month) — monthsRemaining = days / 30.44. */
const DAYS_PER_MONTH = 30.44;

/** IST is UTC+05:30 with no DST — the fixed civil-date shift (§7.4). */
const IST_OFFSET_MINUTES = 330;

/** DATE_EXPECTED warning copy (§7.2 rule 3 wording). */
const DATE_EXPECTED_NOTE =
  'Exam date expected (based on the recent-year schedule), not yet officially announced. It will be replaced with the official date as soon as the authority publishes it.';

/**
 * Seed entries — Phase 0 verification results, 2026-09-26 (spec §7.3):
 *
 *  - INI-CET Nov 2026 (Jan 2027 session) ANNOUNCED: exam 1 Nov 2026 (Sunday,
 *    CBT); reg 16 Sep – 13 Oct 2026; result ~7 Nov 2026. Re-confirmed at seed
 *    time (2026-09-26) via secondary outlets agreeing with the Phase 0 record;
 *    the official portal is an SPA whose plain-HTML fetch exposes no bulletin
 *    (the known 2026 gap), so sourceUrl is the portal root and a maintainer
 *    click-verifies per the §7.3 SOP. 36 days away as of verification day.
 *  - INI-CET runs TWICE a year: exam ~May → July session, exam ~November →
 *    January session (verified cadence; sessions 2023-01 … 2026-01 in the
 *    store confirm the Jan/Jul rhythm). The two later sessions seed as
 *    cadence-derived `expected` placeholders (mid-May / mid-Nov Sundays) per
 *    decision R2, so the calendar never goes silently empty within its horizon.
 *  - NEET PG runs ONCE a year in the late-summer window (verified cadence:
 *    2024-08-11, 2025-08-03, 2026-08-30 — all Sundays). NEET PG 2027 is
 *    unannounced and seeds as an `expected` placeholder ~mid-Aug 2027 (R2),
 *    replaced on announcement. NEET PG 2028 seeds the same way (mid-Aug
 *    Sunday placeholder) so the target-year window [current year, +2] stays
 *    fully selectable — 2026 is deliberately ABSENT: that edition already
 *    took place (2026-08-30) and is never a targetable year again.
 */
const SEED = [
  {
    exam: 'INI_CET',
    session: '2027-01',
    examDate: '2026-11-01',
    status: 'announced',
    sourceUrl: 'https://aiimsexams.ac.in/',
    verifiedAsOf: '2026-09-26',
    note: 'INI-CET for the January 2027 session (computer-based). Announced: exam 1 November 2026 (Sunday); registration 16 September – 13 October 2026; result expected around 7 November 2026. Verified 2026-09-26 (Phase 0, §7.3) via four agreeing secondary outlets plus the live registration window; the AIIMS portal is an SPA that exposes no plain-HTML bulletin, so a maintainer click-verifies it per the §7.3 SOP.',
  },
  {
    exam: 'INI_CET',
    session: '2027-07',
    examDate: '2027-05-16',
    status: 'expected',
    sourceUrl: 'https://aiimsexams.ac.in/',
    verifiedAsOf: '2026-09-26',
    note: 'Cadence-derived placeholder (status expected): INI-CET runs twice a year and the exam around May feeds the July session (verified cadence, Phase 0 §7.3). Mid-May Sunday placeholder for the July 2027 session — replaced with the official date on announcement (SOP §7.3).',
  },
  {
    exam: 'INI_CET',
    session: '2028-01',
    examDate: '2027-11-14',
    status: 'expected',
    sourceUrl: 'https://aiimsexams.ac.in/',
    verifiedAsOf: '2026-09-26',
    note: 'Cadence-derived placeholder (status expected): the exam around November feeds the January session (verified cadence, Phase 0 §7.3). Mid-November Sunday placeholder for the January 2028 session — replaced with the official date on announcement (SOP §7.3).',
  },
  {
    exam: 'NEET_PG',
    session: '2027',
    examDate: '2027-08-15',
    status: 'expected',
    sourceUrl: 'https://natboard.edu.in/',
    verifiedAsOf: '2026-09-26',
    note: 'NEET PG 2027 is unannounced. Cadence-derived placeholder (status expected): NEET PG runs once a year in the late-summer window (2024-08-11, 2025-08-03, 2026-08-30 — Phase 0 §7.3). Mid-August Sunday placeholder for the 2027 edition — replaced with the official date on announcement (SOP §7.3).',
  },
  {
    exam: 'NEET_PG',
    session: '2028',
    examDate: '2028-08-13',
    status: 'expected',
    sourceUrl: 'https://natboard.edu.in/',
    verifiedAsOf: '2026-09-27',
    note: 'NEET PG 2028 is unannounced. Cadence-derived placeholder (status expected), same R2 policy as the 2027 entry: NEET PG runs once a year in the late-summer window (2024-08-11, 2025-08-03, 2026-08-30 — Phase 0 §7.3). Mid-August Sunday placeholder for the 2028 edition, seeded so the target-year window [current year, current year + 2] stays fully selectable — replaced with the official date on announcement (SOP §7.3).',
  },
];

// ---------------------------------------------------------------------------
// Date primitives (pure UTC day-number arithmetic — no host-timezone reads)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_RE = /^\d{4}(?:-\d{2})?$/;

/** Civil (Y,M,D) of the IST calendar date containing `epochMs` (§7.4). */
function istCivilDate(epochMs) {
  const shifted = new Date(epochMs + IST_OFFSET_MINUTES * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Proleptic-Gregorian day number of a civil date (Date.UTC is TZ-free). */
function civilDayNumber({ year, month, day }) {
  return Math.trunc(Date.UTC(year, month - 1, day) / 86400000);
}

/** 'YYYY-MM-DD' of a civil date (echoed as asOfIstDate so records are self-explaining). */
function isoOfCivil({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Strict ISO calendar-date parse (rejects '2027-2-3', '2027-02-30', offsets…).
 * Calendar entries are config, so a malformed date is a DATA_INTEGRITY
 * self-check failure (config self-check at module load, §18.2) — never a
 * student-facing validation error.
 */
function parseIsoDate(value, where) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw dataIntegrity(`Calendar ${where} must be a strict ISO date 'YYYY-MM-DD'.`, { where, value });
  }
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw dataIntegrity(`Calendar ${where} is not a real calendar date.`, { where, value });
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw dataIntegrity(`Calendar ${where} is not a real calendar date.`, { where, value });
  }
  return { year, month, day };
}

/** `now` normalization: Date | ISO string | epoch ms (absent ⇒ real clock). */
function normalizeNow(now) {
  const date = now === undefined || now === null ? new Date() : new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw invalidInput('now must be a Date, ISO string, or epoch milliseconds.', { field: 'now' });
  }
  return date;
}

// ---------------------------------------------------------------------------
// Entry validation (config self-check — runs on the seed at module load)
// ---------------------------------------------------------------------------

const STATUSES = new Set(['announced', 'expected']);

/**
 * Validate calendar entries (shape, real dates, uniqueness per §18.2: no
 * duplicate session key or examDate within an exam). Exported so tests can
 * pin the failure modes against crafted fixtures.
 * @returns {Array} the input entries, unchanged, when every check passes
 */
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw dataIntegrity('Calendar ENTRIES must be a non-empty array.');
  }
  const seenSession = new Set();
  const seenDate = new Set();
  entries.forEach((entry, i) => {
    const where = `entries[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw dataIntegrity(`Calendar ${where} must be an object.`, { where });
    }
    if (!EXAMS[entry.exam]) {
      throw dataIntegrity(`Calendar ${where} names unknown exam '${String(entry.exam)}'.`, {
        where,
        known: Object.keys(EXAMS),
      });
    }
    if (typeof entry.session !== 'string' || !SESSION_RE.test(entry.session)) {
      throw dataIntegrity(`Calendar ${where}.session must be 'YYYY' (NEET PG) or 'YYYY-MM' (INI-CET).`, {
        where,
        session: entry.session,
      });
    }
    const month = entry.session.length === 7 ? Number(entry.session.slice(5, 7)) : null;
    if (month !== null && (month < 1 || month > 12)) {
      throw dataIntegrity(`Calendar ${where}.session has an invalid month.`, { where, session: entry.session });
    }
    if (!STATUSES.has(entry.status)) {
      throw dataIntegrity(`Calendar ${where}.status must be 'announced' or 'expected'.`, {
        where,
        status: entry.status,
      });
    }
    if (typeof entry.sourceUrl !== 'string' || !/^https:\/\//.test(entry.sourceUrl)) {
      throw dataIntegrity(`Calendar ${where}.sourceUrl must be an https URL (official AIIMS/NBEMS properties only, §20).`, {
        where,
        sourceUrl: entry.sourceUrl,
      });
    }
    parseIsoDate(entry.examDate, `${where}.examDate`);
    parseIsoDate(entry.verifiedAsOf, `${where}.verifiedAsOf`);
    if (entry.note !== undefined && typeof entry.note !== 'string') {
      throw dataIntegrity(`Calendar ${where}.note must be a string when present.`, { where });
    }
    const sessionKey = `${entry.exam}|${entry.session}`;
    const dateKey = `${entry.exam}|${entry.examDate}`;
    if (seenSession.has(sessionKey)) {
      throw dataIntegrity(`Duplicate calendar session '${entry.session}' for ${entry.exam} (§18.2).`, {
        where,
        session: entry.session,
        exam: entry.exam,
      });
    }
    if (seenDate.has(dateKey)) {
      throw dataIntegrity(`Duplicate calendar examDate ${entry.examDate} for ${entry.exam} (§18.2).`, {
        where,
        examDate: entry.examDate,
        exam: entry.exam,
      });
    }
    seenSession.add(sessionKey);
    seenDate.add(dateKey);
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Resolver factory (tests inject crafted entries; prod uses the seed)
// ---------------------------------------------------------------------------

/**
 * @param {Array} entries calendar entries (validated here — the live instance
 *   self-checks at module load, §18.2)
 * @param {object} [options] { calendarVersion, horizonDays } — defaults are
 *   the production values; tests may override either.
 * @returns {{calendarVersion, horizonDays, entries, resolve, nextExam, snapshot}}
 */
function createCalendar(entries, options = {}) {
  const calendarVersion =
    options.calendarVersion === undefined ? CALENDAR_VERSION : options.calendarVersion;
  if (typeof calendarVersion !== 'string' || !calendarVersion) {
    throw dataIntegrity('calendarVersion must be a non-empty string.');
  }
  const horizonDays =
    options.horizonDays === undefined ? READINESS.CALENDAR.HORIZON_DAYS : options.horizonDays;
  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    throw dataIntegrity('horizonDays must be a positive integer.');
  }

  // Deterministic order (exam, then examDate, then session) so listings and
  // earliest-candidate selection never depend on the source array order.
  const sorted = validateEntries(entries)
    .map((entry) => Object.freeze({ ...entry }))
    .sort((a, b) => {
      if (a.exam !== b.exam) return a.exam < b.exam ? -1 : 1;
      const dayA = civilDayNumber(parseIsoDate(a.examDate, 'examDate'));
      const dayB = civilDayNumber(parseIsoDate(b.examDate, 'examDate'));
      if (dayA !== dayB) return dayA - dayB;
      return a.session < b.session ? -1 : 1;
    })
    .map((entry) => ({ entry, day: civilDayNumber(parseIsoDate(entry.examDate, 'examDate')) }));
  const frozenEntries = Object.freeze(sorted.map((s) => s.entry));

  function assertKnownExam(examId) {
    if (typeof examId !== 'string' || !EXAMS[examId]) {
      throw invalidInput(`Unknown exam '${String(examId)}'. Supported: ${Object.keys(EXAMS).join(', ')}.`, {
        field: 'exam',
        exam: examId,
      });
    }
  }

  function resultFor(prepared, todayNum, todayCivil, targetYear = null) {
    const { entry, day } = prepared;
    const daysRemaining = day - todayNum; // ≥ 0 by construction (§8)
    const result = {
      exam: entry.exam,
      session: entry.session,
      examDate: entry.examDate,
      status: entry.status,
      sourceUrl: entry.sourceUrl,
      verifiedAsOf: entry.verifiedAsOf,
      note: entry.note === undefined ? null : entry.note,
      daysRemaining,
      monthsRemaining: daysRemaining / DAYS_PER_MONTH, // §8: raw float; UI rounds
      warnings: [],
      asOfIstDate: isoOfCivil(todayCivil),
      calendarVersion,
      horizonDays,
      targetYear, // the selected target year, or null for default/session resolution
    };
    if (entry.status === 'expected') {
      result.warnings.push({ code: 'DATE_EXPECTED', note: DATE_EXPECTED_NOTE });
    }
    return result;
  }

  /**
   * Resolve the upcoming exam session (§7.2 rules 1–7).
   * @param {string} examId EXAMS key
   * @param {Date|string|number} [now] injectable clock (tests); absent ⇒ now
   * @param {object} [opts] { session, targetYear } — exactly one targeting
   *   mechanism at a time:
   *   - session: explicit listed session (planning mode); unknown or
   *     already-past ⇒ INVALID_INPUT (§18.1); listed but beyond the horizon ⇒
   *     NO_UPCOMING_EXAM (same rules, §7.2 rule 6)
   *   - targetYear: the student's intended exam year (rule 7) — integer
   *     (numeric strings normalize) inside [current IST year, current year +
   *     TARGET_YEAR_SPAN]; resolves the earliest still-upcoming session whose
   *     session key carries that year; NO horizon check (the window is the
   *     bound). Outside the window / non-integer / no upcoming entry for the
   *     year / combined with session ⇒ INVALID_INPUT (§18.1)
   * @returns {object} deterministic resolution result (echo contract §7.2.5)
   * @throws {PredictorError} INVALID_INPUT | NO_UPCOMING_EXAM
   */
  function resolve(examId, now, opts = {}) {
    assertKnownExam(examId);
    const nowDate = normalizeNow(now);
    const todayCivil = istCivilDate(nowDate.getTime());
    const todayNum = civilDayNumber(todayCivil);
    const forExam = sorted.filter((s) => s.entry.exam === examId);

    const hasSession = opts.session !== undefined && opts.session !== null;
    const hasTargetYear = opts.targetYear !== undefined && opts.targetYear !== null;
    if (hasSession && hasTargetYear) {
      throw invalidInput('Pass either session or targetYear — not both.', {
        field: 'targetYear',
        session: opts.session,
        targetYear: opts.targetYear,
      });
    }

    if (hasTargetYear) {
      const raw = opts.targetYear;
      const year =
        typeof raw === 'string' && /^\d{4}$/.test(raw.trim()) ? Number(raw.trim()) : raw;
      if (typeof year !== 'number' || !Number.isFinite(year) || !Number.isInteger(year)) {
        throw invalidInput('Target year must be a whole year, like 2027.', {
          field: 'targetYear',
          targetYear: raw,
        });
      }
      const minYear = todayCivil.year; // IST current year — the window rolls with the clock
      const maxYear = minYear + READINESS.CALENDAR.TARGET_YEAR_SPAN;
      if (year < minYear || year > maxYear) {
        throw invalidInput(`Choose a target year between ${minYear} and ${maxYear}.`, {
          field: 'targetYear',
          targetYear: year,
          minYear,
          maxYear,
        });
      }
      // Rule 7: session keys start with their year under both conventions
      // ('2028' / '2028-01'), and `sorted` is examDate-ascending — the first
      // still-upcoming match is the year's earliest targetable session, so a
      // year whose first session passed falls forward to its next one.
      const prefix = String(year);
      const upcoming = forExam.find((s) => s.entry.session.startsWith(prefix) && s.day >= todayNum);
      if (upcoming) {
        return resultFor(upcoming, todayNum, todayCivil, year);
      }
      const anyForYear = forExam.some((s) => s.entry.session.startsWith(prefix));
      throw invalidInput(
        anyForYear
          ? `${EXAMS[examId].label} ${year} has already taken place — target an upcoming year.`
          : `${EXAMS[examId].label} ${year} is not on the exam calendar yet — pick a listed target year.`,
        { field: 'targetYear', targetYear: year, exam: examId }
      );
    }

    if (opts.session !== undefined && opts.session !== null) {
      if (typeof opts.session !== 'string') {
        throw invalidInput('session must be a string.', { field: 'session' });
      }
      const match = forExam.find((s) => s.entry.session === opts.session);
      if (!match) {
        throw invalidInput(
          `No calendar session '${opts.session}' for ${EXAMS[examId].label}. Listed sessions: ${forExam
            .map((s) => s.entry.session)
            .join(', ')}.`,
          { field: 'session', session: opts.session, exam: examId }
        );
      }
      if (match.day < todayNum) {
        throw invalidInput(
          `Session ${match.entry.session} (${match.entry.examDate}) has already taken place — target an upcoming session.`,
          { field: 'session', session: match.entry.session, examDate: match.entry.examDate }
        );
      }
      if (match.day - todayNum > horizonDays) {
        throw noUpcomingExam(
          `Session ${match.entry.session} (${match.entry.examDate}) is beyond the ${horizonDays}-day calendar horizon.`,
          { exam: examId, session: match.entry.session, horizonDays, calendarVersion }
        );
      }
      return resultFor(match, todayNum, todayCivil);
    }

    // Default resolution: earliest entry with today ≤ examDate ≤ today+horizon.
    const upcoming = sorted.find(
      (s) => s.entry.exam === examId && s.day >= todayNum && s.day - todayNum <= horizonDays
    );
    if (!upcoming) {
      throw noUpcomingExam(
        `No upcoming ${EXAMS[examId].label} exam is listed within the ${horizonDays}-day calendar horizon. Check back once the authority announces the next exam date — the calendar is updated on announcement.`,
        { exam: examId, horizonDays, calendarVersion }
      );
    }
    return resultFor(upcoming, todayNum, todayCivil);
  }

  /**
   * Non-throwing variant for the calendar GET endpoint (§15): the next
   * session or null — routine-empty is a 200-shaped null, never a 4xx
   * (Phase-10a lesson). Unknown exams still throw INVALID_INPUT.
   */
  function nextExam(examId, now) {
    try {
      return resolve(examId, now, {});
    } catch (err) {
      if (err instanceof PredictorError && err.code === 'NO_UPCOMING_EXAM') return null;
      throw err;
    }
  }

  /**
   * Snapshot for GET /api/predictor/readiness/calendar (§15):
   * { calendarVersion, exams: { <examId>: { next: <result|null>, horizonDays,
   * targets: [<result>, …] } } } — `targets` (additive) is the authoritative
   * target-year menu: every year of the [current year, +SPAN] window that
   * resolves, ascending, each entry the full §7.2.5 echo with its targetYear.
   * Years with no upcoming entry are simply absent (a 200-shaped menu, never
   * a 4xx — the Phase-10a lesson, same as `next`).
   */
  function snapshot(now) {
    const nowDate = normalizeNow(now);
    const currentYear = istCivilDate(nowDate.getTime()).year;
    const exams = {};
    for (const examId of Object.keys(EXAMS)) {
      const targets = [];
      for (let year = currentYear; year <= currentYear + READINESS.CALENDAR.TARGET_YEAR_SPAN; year += 1) {
        try {
          targets.push(resolve(examId, nowDate, { targetYear: year }));
        } catch {
          // Year not targetable (past/no entry) — not offered in the menu.
        }
      }
      exams[examId] = { next: nextExam(examId, nowDate), horizonDays, targets };
    }
    return { calendarVersion, exams };
  }

  return { calendarVersion, horizonDays, entries: frozenEntries, resolve, nextExam, snapshot };
}

/** The live calendar — self-checked at module load (§18.2). */
const calendar = createCalendar(SEED);

module.exports = {
  CALENDAR_VERSION,
  DAYS_PER_MONTH,
  ENTRIES: calendar.entries,
  createCalendar,
  validateEntries,
  resolve: (examId, now, opts) => calendar.resolve(examId, now, opts),
  nextExam: (examId, now) => calendar.nextExam(examId, now),
  calendarSnapshot: (now) => calendar.snapshot(now),
};
