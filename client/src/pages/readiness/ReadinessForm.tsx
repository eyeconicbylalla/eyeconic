import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, ExternalLink, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { errorRowIndices, predictorEndpoints, predictorErrorMessage } from '../../lib/predictorClient';
import type { PredictorExam, PredictorExamId } from '../../types/predictor';
import type { ReadinessCalendarResponse, ReadinessCorrectsRow, ReadinessRequestBody, ReadinessResponse } from '../../types/readiness';
import ExamPicker from '../predictor/ExamPicker';
import GtInputSection from '../predictor/GtInputSection';
import { useGtInput } from '../predictor/useGtInput';
import { latestAttempt } from '../predictor/format';
import { examDateLabel, fmtNum, patternFor, sessionLabel, timeRemainingLabel } from './constants';

/**
 * Readiness Score input (Feature 09, spec §3/§17.3): exam → the server-resolved
 * upcoming session banner → performance in ONE mode (GT corrects, reusing the
 * predictor's auto-filling rows, or GT score rows). Everything derived — the
 * exam date, days left, anchors, budget, the state — is computed by the server
 * at submit time; this form only sends raw inputs (no `session` is ever sent:
 * the server re-resolves the calendar per request, FR-3).
 */

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
  const [examId, setExamId] = useState<PredictorExamId>('NEET_PG');
  const [mode, setMode] = useState<'corrects' | 'score'>('corrects');
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

  const nextSession = calendar?.exams?.[examId]?.next ?? null;

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
        setFormError('Enter at least one Grand Test score.');
        gt.markInvalidRows();
        return;
      }
      if (!gt.markInvalidRows()) {
        setFormError('Fix the highlighted Grand Test scores first.');
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
      const body: ReadinessRequestBody =
        mode === 'corrects'
          ? { exam: examId, gts: buildReadinessGts(gt) }
          : {
              exam: examId,
              score:
                valuedScoreRows.length === 1
                  ? { value: Number(valuedScoreRows[0].value) }
                  : valuedScoreRows.map((row) => ({ value: Number(row.value) })),
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

      {/* Server-resolved upcoming session (§3 step 4): banner only — the date
          is re-resolved by the server at submit time, never sent from here. */}
      {nextSession ? (
        <div
          className={`mb-4 rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center gap-x-5 gap-y-2 ${
            nextSession.status === 'announced'
              ? 'bg-[#18222E] border-[#18B6A4]/25'
              : 'bg-amber-500/[0.05] border-amber-500/25'
          }`}
          data-anim="fade-up"
        >
          <span className="inline-flex items-center gap-2 text-sm text-[#F8FAFC]">
            <CalendarClock size={16} className="text-[#4DD7C8] shrink-0" />
            Next {exams.find((e) => e.id === examId)?.label ?? examId}:{' '}
            <strong className="font-semibold">{examDateLabel(nextSession.examDate)}</strong>
          </span>
          <span className="text-xs text-[#94A3B8]">{sessionLabel(nextSession.session)}</span>
          <span
            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
              nextSession.status === 'announced'
                ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/40'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {nextSession.status === 'announced' ? 'Announced' : 'Expected date'}
          </span>
          <span className="text-xs text-[#CBD5E1]">{timeRemainingLabel(nextSession)} left</span>
          <a
            href={nextSession.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#4DD7C8]"
          >
            Official portal <ExternalLink size={11} />
          </a>
          {nextSession.status === 'expected' ? (
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
          title="Your Grand Test scores"
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
