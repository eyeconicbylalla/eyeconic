import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, ExternalLink, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { errorRowIndices, predictorEndpoints, predictorErrorMessage } from '../../lib/predictorClient';
import type { PredictorExam, PredictorExamId } from '../../types/predictor';
import type {
  ReadinessCalendarResponse,
  ReadinessCalendarTarget,
  ReadinessCorrectsRow,
  ReadinessRequestBody,
  ReadinessResponse,
} from '../../types/readiness';
import ExamPicker from '../predictor/ExamPicker';
import GtInputSection from '../predictor/GtInputSection';
import { useGtInput } from '../predictor/useGtInput';
import { latestAttempt } from '../predictor/format';
import { admissionSessionLabel, examDateLabel, fmtNum, patternFor, sessionLabel, timeRemainingLabel } from './constants';

/**
 * Readiness Score input (Feature 09, spec §3/§17.3): exam → target exam year
 * → (INI-CET) target session — May or November, the exam-calendar sitting —
 * → the resolved-session banner → performance in ONE mode (GT corrects,
 * reusing the predictor's auto-filling rows, or GT score rows). Everything
 * derived — the exam date, days left, anchors, budget, the state — is
 * computed by the server at submit time; this form only sends raw inputs plus
 * the selected targetYear/targetSession (never a date, never a raw session
 * key: the server resolves the calendar per request, FR-3).
 *
 * The target pick (exam, year, session) persists across visits in
 * localStorage and is re-validated against the SERVER's menu on every mount —
 * a stored pick the calendar no longer offers (its sitting passed, its year
 * rolled out of the window) silently falls back to the menu's first entry,
 * which is always the server's default resolution.
 */

/** localStorage key for the persisted target pick (see header). */
const TARGET_STORE_KEY = 'eyeconic:readiness-target';

interface StoredTarget {
  exam: string;
  targetYear: number;
  targetSession: 'MAY' | 'NOVEMBER' | null;
}

function readStoredTarget(): StoredTarget | null {
  try {
    const raw = localStorage.getItem(TARGET_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTarget;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.exam !== 'string' ||
      !Number.isInteger(parsed.targetYear)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null; // private mode / corrupted value — defaults apply
  }
}

function writeStoredTarget(target: StoredTarget): void {
  try {
    localStorage.setItem(TARGET_STORE_KEY, JSON.stringify(target));
  } catch {
    // Private mode / storage full — persistence is a convenience, never a blocker.
  }
}

interface ScoreRow {
  key: number;
  value: string;
}

/** Live per-row validation for score mode (bounds mirror the exam pattern). */
function scoreRowError(value: string, min: number, max: number): string | null {
  if (value.trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return 'Enter a number';
  if (num < min || num > max) return `Between ${fmtNum(min)} and ${fmtNum(max)} marks`;
  return null;
}

/** The GT rows the student sees → the readiness API's corrects rows (§15). */
function buildReadinessGts(gt: ReturnType<typeof useGtInput>): ReadinessCorrectsRow[] {
  return gt.rows
    .filter((row) => row.value.trim() !== '')
    .map((row) => {
      const isAuto = row.origin === 'auto' && !row.edited;
      const latest = row.attempts?.length ? latestAttempt(row.attempts) : null;
      return {
        corrects: Number(row.value),
        provenance: isAuto ? ('auto-captured' as const) : ('self-reported' as const),
        ...(isAuto && row.gtId ? { gtId: row.gtId } : {}),
        ...(isAuto && latest && latest.endedAt != null ? { attemptedAt: latest.endedAt } : {}),
      };
    });
}

const ReadinessForm: React.FC<{ onResult: (res: ReadinessResponse) => void }> = ({ onResult }) => {
  const [exams, setExams] = useState<PredictorExam[]>([
    {
      id: 'NEET_PG',
      label: 'NEET PG',
      available: true,
      milestone: 'M1',
      patternVersion: '720-scale (+4/-1)',
      pattern: { totalQuestions: 180, positive: 4, negative: 1, maxMarks: 720 },
    },
    {
      id: 'INI_CET',
      label: 'INI-CET',
      available: true,
      milestone: 'M2',
      patternVersion: '200 marks (+1/-1/3)',
      pattern: { totalQuestions: 200, positive: 1, negative: 1 / 3, maxMarks: 200 },
    },
  ]);
  // The whole pick restores on mount — exam included, so a student who last
  // targeted INI-CET November 2027 comes back to exactly that (§8). The ids
  // are the fixed two-exam registry, safe to validate before the list loads.
  const [examId, setExamId] = useState<PredictorExamId>(() => {
    const stored = readStoredTarget();
    return stored && (stored.exam === 'NEET_PG' || stored.exam === 'INI_CET')
      ? (stored.exam as PredictorExamId)
      : 'NEET_PG';
  });
  const [mode, setMode] = useState<'corrects' | 'score'>('corrects');
  const [targetYear, setTargetYear] = useState<number | null>(null);
  const [targetSession, setTargetSession] = useState<'MAY' | 'NOVEMBER' | null>(null);
  const [calendar, setCalendar] = useState<ReadinessCalendarResponse | null>(null);

  const pattern = patternFor(exams, examId);
  const maxCorrects = pattern.totalQuestions;
  // Pattern-derived score bounds (display/validation only — the server enforces).
  const minScore = -(pattern.negative * pattern.totalQuestions);
  const maxScore = pattern.maxMarks;
  const stepMarks = pattern.positive + pattern.negative;

  const gt = useGtInput({ maxCorrects });

  const scoreKeySeq = useRef(1);
  const [scoreRows, setScoreRows] = useState<ScoreRow[]>([{ key: 1, value: '' }]);
  const [scoreErrors, setScoreErrors] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let cancelled = false;
    predictorEndpoints
      .exams()
      .then((list) => {
        if (!cancelled) setExams(list);
      })
      .catch(() => {});
    // The banner is a convenience echo of the server calendar — a failure never
    // blocks the check (the server re-resolves the session at submit time).
    predictorEndpoints
      .readinessCalendar()
      .then((data) => {
        if (!cancelled) setCalendar(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const scoreValidation = useMemo(() => {
    const errors = scoreRows.map((row) => scoreRowError(row.value, minScore, maxScore));
    return { errors, valid: errors.every((e) => e === null) };
  }, [scoreRows, minScore, maxScore]);
  const valuedScoreRows = scoreRows.filter((row) => row.value.trim() !== '');

  const examLabel = exams.find((e) => e.id === examId)?.label ?? examId;
  const isIniCet = examId === 'INI_CET';
  const nextSession = calendar?.exams?.[examId]?.next ?? null;
  /** The server's offered (year, session) targets for this exam — the menu. */
  const targets = calendar?.exams?.[examId]?.targets ?? [];
  const targetsKey = targets.map((t) => `${t.targetYear}:${t.targetSession ?? '-'}`).join(',');

  /** The menu's years, first-seen order (examDate-ascending ⇒ year-ascending). */
  const menuYears = useMemo(() => {
    const years: number[] = [];
    for (const t of targets) {
      if (!years.includes(t.targetYear)) years.push(t.targetYear);
    }
    return years;
  }, [targetsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The selected year's sittings (INI-CET: up to two; NEET PG: exactly one). */
  const yearSessions = useMemo(
    () => targets.filter((t) => t.targetYear === targetYear),
    [targetsKey, targetYear] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Selection default/restore: the stored pick when the menu still offers it,
  // else the menu's first entry — always the server's default resolution.
  // Re-runs on exam change or menu (re)load so a stale pick from a previous
  // exam (or a sitting that has since passed) can never ride into a submit.
  useEffect(() => {
    if (!targets.length) {
      setTargetYear(null);
      setTargetSession(null);
      return;
    }
    const stored = readStoredTarget();
    const storedMatch =
      stored && stored.exam === examId
        ? targets.find(
            (t) =>
              t.targetYear === stored.targetYear &&
              (t.targetSession ?? null) === (stored.targetSession ?? null)
          )
        : undefined;
    const chosen: ReadinessCalendarTarget = storedMatch ?? targets[0];
    setTargetYear(chosen.targetYear);
    setTargetSession(chosen.targetSession ?? null);
  }, [examId, targetsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the pick on every change (localStorage may throw — see writer).
  useEffect(() => {
    if (targetYear === null) return;
    writeStoredTarget({ exam: examId, targetYear, targetSession: targetSession ?? null });
  }, [examId, targetYear, targetSession]);

  const selectYear = (year: number) => {
    setTargetYear(year);
    // Land on the year's earliest upcoming sitting (May before November).
    setTargetSession(targets.find((t) => t.targetYear === year)?.targetSession ?? null);
  };

  const selectedTarget =
    targets.find(
      (t) => t.targetYear === targetYear && (t.targetSession ?? null) === targetSession
    ) ?? null;
  const bannerEntry: typeof nextSession = selectedTarget ?? nextSession;

  const updateScoreRow = (key: number, value: string) =>
    setScoreRows((prev) => prev.map((row) => (row.key === key ? { ...row, value } : row)));

  const addScoreRow = () =>
    setScoreRows((prev) => [...prev, { key: ++scoreKeySeq.current, value: '' }]);

  const removeScoreRow = (key: number) =>
    setScoreRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.key !== key)));

  const submit = async () => {
    setFormError('');
    if (mode === 'corrects') {
      if (!gt.hasValues) {
        setFormError('Enter at least one Grand Test correct count.');
        gt.markInvalidRows();
        return;
      }
      if (!gt.markInvalidRows()) {
        setFormError('Fix the highlighted Grand Test corrects first.');
        return;
      }
    } else if (valuedScoreRows.length === 0) {
      setFormError('Enter a Grand Test score.');
      setScoreErrors(new Set([0]));
      return;
    } else if (!scoreValidation.valid) {
      setScoreErrors(new Set(scoreValidation.errors.map((e, i) => (e ? i : -1)).filter((i) => i >= 0)));
      setFormError('Fix the highlighted scores first.');
      return;
    }

    setSubmitting(true);
    try {
      // Exactly one input mode valued per request (FR-2) — the toggle decides.
      // The selected target year + session name WHICH edition is targeted;
      // the server derives its date and every downstream quantity (never
      // trusted here). NEET PG never sends targetSession (one sitting a
      // year); INI-CET always does — the session pills force a pick.
      const body: ReadinessRequestBody = {
        exam: examId,
        ...(targetYear != null ? { targetYear } : {}),
        ...(isIniCet && targetSession != null ? { targetSession } : {}),
        ...(mode === 'corrects'
          ? { gts: buildReadinessGts(gt) }
          : {
              score:
                valuedScoreRows.length === 1
                  ? { value: Number(valuedScoreRows[0].value) }
                  : valuedScoreRows.map((row) => ({ value: Number(row.value) })),
            }),
      };
      onResult(await predictorEndpoints.readiness(body));
    } catch (err) {
      setFormError(predictorErrorMessage(err, 'Could not check your readiness. Please try again.'));
      if (mode === 'corrects') {
        const rows = errorRowIndices(err);
        if (rows.size > 0) gt.markRowErrors(rows);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting &&
    (mode === 'corrects'
      ? gt.validation.valid && gt.hasValues
      : scoreValidation.valid && valuedScoreRows.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting) submit();
      }}
      noValidate
    >
      <ExamPicker exams={exams} examId={examId} onSelect={setExamId} />

      {/* Target exam (calendar rule 7): the menu is the SERVER's offered
          years for this exam — never a client-side year list. The year is
          the CALENDAR year of the exam date, so what the pill says is always
          the year the resolved date shows. */}
      {menuYears.length > 0 ? (
        <div className="mb-4" data-anim="fade-up">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">
              Target exam
            </span>
            <span className="text-[11px] text-[#94A3B8]">the edition you are preparing for</span>
          </div>
          <div role="group" aria-label="Target exam" className="flex flex-wrap gap-2">
            {menuYears.map((year) => {
              const selected = year === targetYear;
              const yearEntry = targets.find((t) => t.targetYear === year);
              return (
                <button
                  key={year}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectYear(year)}
                  title={
                    yearEntry
                      ? `${examLabel} ${year} · next sitting ${examDateLabel(yearEntry.examDate)}`
                      : `${examLabel} ${year}`
                  }
                  className={`text-sm rounded-full px-4 py-2 border transition ${
                    selected
                      ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/40 font-semibold'
                      : 'bg-[#18222E] text-[#94A3B8] border-white/10 hover:text-[#CBD5E1]'
                  }`}
                >
                  {examLabel} {year}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Target session (calendar rule 8): INI-CET runs TWICE a calendar
          year — after the year, the student picks the sitting. Only offered
          sittings render (the server menu already hides passed ones), and a
          year with a single upcoming sitting shows no pills — the banner
          below carries the session identity. */}
      {isIniCet && yearSessions.length > 1 ? (
        <div className="mb-4" data-anim="fade-up">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">
              Target session
            </span>
            <span className="text-[11px] text-[#94A3B8]">INI-CET runs twice a year — May &amp; November</span>
          </div>
          <div role="group" aria-label="Target session" className="flex flex-wrap gap-2">
            {yearSessions.map((t) => {
              const selected = (t.targetSession ?? null) === targetSession;
              return (
                <button
                  key={t.targetSession ?? t.session}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTargetSession(t.targetSession ?? null)}
                  title={`${t.targetLabel ?? t.session} · ${examDateLabel(t.examDate)}`}
                  className={`text-sm rounded-full px-4 py-2 border transition ${
                    selected
                      ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/40 font-semibold'
                      : 'bg-[#18222E] text-[#94A3B8] border-white/10 hover:text-[#CBD5E1]'
                  }`}
                >
                  {t.targetLabel ?? t.session}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Server-resolved target session (§3 step 4): banner only — the date
          is re-resolved by the server at submit time, never sent from here.
          Shows the SELECTED (year, session)'s resolution (falls back to the
          server's default next exam while the calendar loads). */}
      {bannerEntry ? (
        <div
          className={`mb-4 rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center gap-x-5 gap-y-2 ${
            bannerEntry.status === 'announced'
              ? 'bg-[#18222E] border-[#18B6A4]/25'
              : 'bg-amber-500/[0.05] border-amber-500/25'
          }`}
          data-anim="fade-up"
        >
          <span className="inline-flex items-center gap-2 text-sm text-[#F8FAFC]">
            <CalendarClock size={16} className="text-[#4DD7C8] shrink-0" />
            {selectedTarget ? 'Target' : 'Next'} {examLabel}:{' '}
            <strong className="font-semibold">{examDateLabel(bannerEntry.examDate)}</strong>
          </span>
          <span
            className="text-xs text-[#94A3B8]"
            title={
              bannerEntry.examSession
                ? `This sitting feeds the ${admissionSessionLabel(bannerEntry.session)} intake`
                : undefined
            }
          >
            {sessionLabel(bannerEntry)}
          </span>
          <span
            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
              bannerEntry.status === 'announced'
                ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/40'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {bannerEntry.status === 'announced' ? 'Announced' : 'Expected date'}
          </span>
          <span className="text-xs text-[#CBD5E1]">{timeRemainingLabel(bannerEntry)} left</span>
          <a
            href={bannerEntry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#4DD7C8]"
          >
            Official portal <ExternalLink size={11} />
          </a>
          {bannerEntry.status === 'expected' ? (
            <p className="w-full text-[11px] text-amber-300/90">
              Expected date (based on the recent-year schedule), not yet officially announced.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Input mode toggle (FR-2): exactly one of the two is sent. */}
      <div
        role="group"
        aria-label="Input mode"
        className="mb-4 flex p-1 bg-[#18222E] border border-white/[0.06] rounded-2xl"
        data-anim="fade-up"
      >
        {(['corrects', 'score'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              mode === m ? 'bg-[#18B6A4]/15 text-[#4DD7C8]' : 'text-[#94A3B8] hover:text-[#CBD5E1]'
            }`}
          >
            {m === 'corrects' ? 'GT corrects' : 'GT score'}
          </button>
        ))}
      </div>

      {mode === 'corrects' ? (
        <GtInputSection
          gt={gt}
          title="Your Grand Test corrects"
          subtitle={`Correct answers per Grand Test (out of ${maxCorrects}). Add as many as you have — the check uses your average.`}
        />
      ) : (
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
          <h3 className="font-semibold text-[#F8FAFC]">Your Grand Test scores</h3>
          <p className="text-xs text-[#94A3B8] mt-1 mb-4">
            Total marks per Grand Test ({exams.find((e) => e.id === examId)?.label ?? examId} pattern:{' '}
            {maxCorrects} questions · max {fmtNum(maxScore)}). Add as many as you have — the check uses
            your average.
          </p>
          <div className="space-y-3" data-stagger>
            {scoreRows.map((row, index) => {
              const error = scoreValidation.errors[index];
              const highlighted = Boolean(error) && (row.value !== '' || scoreErrors.has(index));
              return (
                <div key={row.key}>
                  <div
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      highlighted ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08] bg-[#151E29]'
                    }`}
                  >
                    <span className="shrink-0 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border bg-white/[0.04] text-[#94A3B8] border-white/10">
                      Score
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={minScore}
                      max={maxScore}
                      value={row.value}
                      onChange={(e) => updateScoreRow(row.key, e.target.value)}
                      placeholder={`e.g. ${Math.round(maxScore * 0.45)}`}
                      aria-label={`Grand Test ${index + 1} total score`}
                      aria-invalid={Boolean(highlighted)}
                      className="w-28 bg-transparent text-[#F8FAFC] text-lg font-semibold outline-none text-center [appearance:textfield]"
                    />
                    <span className="flex-1 text-xs text-[#94A3B8] truncate">
                      out of {fmtNum(maxScore)} marks
                    </span>
                    <button
                      type="button"
                      onClick={() => removeScoreRow(row.key)}
                      disabled={scoreRows.length === 1}
                      aria-label="Remove this Grand Test score"
                      className="text-[#94A3B8] hover:text-rose-300 disabled:opacity-30 p-2 -m-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {highlighted ? <p className="text-xs text-rose-300 mt-1 ml-2">{error}</p> : null}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addScoreRow} className="btn btn-outline text-sm px-4 py-2 mt-4">
            <Plus size={14} className="mr-1.5" /> Add another GT score
          </button>
          <p className="mt-4 text-xs text-[#94A3B8] bg-[#151E29] border border-white/[0.06] rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
            Achievable scores move in steps of {fmtNum(stepMarks)} marks (one more correct); a score
            between steps is treated as rounding noise and read at the nearest whole correct.
          </p>
        </div>
      )}

      {formError ? (
        <p
          className="mb-4 flex items-center gap-2 text-sm text-rose-300 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl p-3"
          role="alert"
        >
          <AlertTriangle size={15} /> {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn btn-primary w-full text-base py-3"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" /> Checking…
          </>
        ) : (
          <>
            <Sparkles size={16} className="mr-2" /> Check my readiness
          </>
        )}
      </button>
      <p className="text-center text-xs text-[#94A3B8] mt-3">
        Estimate based on historical data and a provisional improvement rule of thumb — actual results
        may vary.
      </p>
    </form>
  );
};

export default ReadinessForm;
