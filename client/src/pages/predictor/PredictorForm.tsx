import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, Loader2, Plus, Sparkles, Trash2, User, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { errorRowIndices, predictorEndpoints, predictorErrorMessage } from '../../lib/predictorClient';
import type {
  GtAttemptInput, GtsResponse, PredictResponse, PredictorExam, PredictorExamId,
} from '../../types/predictor';
import {
  CATEGORIES, EXAM_PATTERN_LABELS, LOW_GT_NOTE, MAX_CORRECTS, NO_SKIP_NOTE, SUGGESTION_CHIPS_MAX,
} from './constants';
import { dateLabel, latestAttempt } from './format';

/**
 * The predictor input experience (spec §3/§13): exam → Grand Tests → category,
 * with auto-fill from Eyeconic attempts (provenance-tagged). P0 de-cluttered:
 * plain-language copy everywhere, at most three "last time" chips, no dev
 * notes; P3: Enter submits (real form), history link; P4: live validation,
 * 44px remove targets, focus-visible rings (scoped CSS).
 */

interface GtRow {
  key: number;
  value: string;
  origin: 'auto' | 'manual';
  edited: boolean;
  gtId?: string;
  attempts?: GtAttemptInput[];
  title?: string | null;
  dateLabel?: string;
  attemptsNote?: string;
}

function rowValidationError(value: string): string | null {
  if (value.trim() === '') return 'Enter a score';
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return 'Whole numbers only (0 or more)';
  if (num > MAX_CORRECTS) return `Cannot exceed ${MAX_CORRECTS} questions`;
  return null;
}

const PredictorForm: React.FC<{ onPredicted: (res: PredictResponse) => void }> = ({ onPredicted }) => {
  const keySeq = useRef(1);
  const nextKey = () => keySeq.current++;

  const [exams, setExams] = useState<PredictorExam[]>([
    { id: 'NEET_PG', label: 'NEET PG', available: true, milestone: 'M1', patternVersion: '800-scale (+4/-1)' },
  ]);
  const [examId, setExamId] = useState<PredictorExamId>('NEET_PG');
  const [rows, setRows] = useState<GtRow[]>([{ key: nextKey(), value: '', origin: 'manual', edited: false }]);
  const [suggestions, setSuggestions] = useState<number[]>([]);
  const [category, setCategory] = useState('');
  const [pwd, setPwd] = useState(false);

  const [autoFilling, setAutoFilling] = useState(true);
  const [hasAutoGts, setHasAutoGts] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowErrors, setRowErrors] = useState<Set<number>>(new Set());

  // Auto-fill must never clobber something the student started typing: once
  // any row is touched, a late-arriving feed is ignored (P3 race fix).
  const userTouched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: GtsResponse = await predictorEndpoints.gts();
        if (cancelled) return;
        setSuggestions(
          (data.selfReported || [])
            .map((s) => (s.attempts?.length ? s.attempts[s.attempts.length - 1].corrects : null))
            .filter((c): c is number => typeof c === 'number')
            .slice(-SUGGESTION_CHIPS_MAX)
        );
        if (data.gts?.length && !userTouched.current) {
          setRows(
            data.gts.map((gt) => {
              const attempts = gt.attempts || [];
              const latest = latestAttempt(attempts);
              return {
                key: nextKey(),
                value: String(latest.corrects),
                origin: 'auto' as const,
                edited: false,
                gtId: gt.gtId,
                attempts,
                title: gt.title,
                dateLabel: dateLabel(latest.endedAt),
                attemptsNote:
                  attempts.length > 1 ? `latest of ${attempts.length} attempts` : undefined,
              };
            })
          );
          setHasAutoGts(true);
        }
      } catch {
        // Auto-fill is a convenience, never a blocker — manual entry works.
      } finally {
        if (!cancelled) setAutoFilling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    predictorEndpoints
      .exams()
      .then((list) => {
        if (!cancelled) setExams(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (key: number, value: string) => {
    userTouched.current = true;
    setRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? {
              ...row,
              value,
              edited: row.origin === 'auto' ? row.value !== value || row.edited : row.edited,
            }
          : row
      )
    );
  };

  const addRow = (prefill?: number) => {
    userTouched.current = true;
    setRows((prev) => [
      ...prev,
      { key: nextKey(), value: prefill !== undefined ? String(prefill) : '', origin: 'manual', edited: false },
    ]);
  };

  const removeRow = (key: number) => {
    userTouched.current = true;
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.key !== key)));
  };

  // P4: live per-row validation (errors exist as you type; they only turn red
  // once a row has content or a submit was attempted).
  const validation = useMemo(() => {
    const errors = rows.map((row) => rowValidationError(row.value));
    return { errors, valid: errors.every((e) => e === null) };
  }, [rows]);

  const lowGtCount = rows.length <= 2;

  const predict = async () => {
    setFormError('');
    setRowErrors(new Set());
    if (!validation.valid) {
      setRowErrors(new Set(validation.errors.map((e, i) => (e ? i : -1)).filter((i) => i >= 0)));
      setFormError('Fix the highlighted Grand Test scores first.');
      return;
    }
    setPredicting(true);
    try {
      const data = await predictorEndpoints.predict({
        exam: examId,
        gts: rows.map((row) =>
          row.origin === 'auto' && !row.edited && row.attempts?.length
            ? { gtId: row.gtId, provenance: 'auto-captured' as const, attempts: row.attempts }
            : {
                provenance: 'self-reported' as const,
                attempts: [{ corrects: Number(row.value), status: 'completed' }],
              }
        ),
        ...(category ? { category, pwd } : {}),
      });
      onPredicted(data);
    } catch (err) {
      setRowErrors(errorRowIndices(err));
      setFormError(predictorErrorMessage(err, 'Could not generate the prediction. Please try again.'));
    } finally {
      setPredicting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!predicting) predict();
      }}
      noValidate
    >
      {/* exam selector (§13: functional, extensible) */}
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
        <h3 className="font-semibold text-[#F8FAFC] mb-3">Exam</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {exams.map((exam) => (
            <button
              key={exam.id}
              type="button"
              disabled={!exam.available}
              onClick={() => setExamId(exam.id)}
              aria-pressed={examId === exam.id}
              className={`text-left rounded-xl border p-4 transition ${
                !exam.available
                  ? 'border-white/[0.06] bg-[#151E29] opacity-60 cursor-not-allowed'
                  : examId === exam.id
                  ? 'border-[#18B6A4]/60 bg-[#18B6A4]/10'
                  : 'border-white/[0.08] bg-[#151E29] hover:border-[#18B6A4]/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#F8FAFC]">{exam.label}</span>
                {examId === exam.id && exam.available ? (
                  <span className="text-[10px] uppercase tracking-wide text-[#4DD7C8] border border-[#18B6A4]/40 rounded-full px-2 py-0.5">
                    Selected
                  </span>
                ) : !exam.available ? (
                  <span className="text-[10px] uppercase tracking-wide text-[#94A3B8] border border-white/10 rounded-full px-2 py-0.5">
                    Coming soon
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                {EXAM_PATTERN_LABELS[exam.id] ?? `${exam.patternVersion} · 200 questions`}
              </p>
            </button>
          ))}
        </div>
        {examId === 'INI_CET' ? (
          <p className="mt-3 flex items-start gap-2 text-xs text-[#94A3B8] bg-[#151E29] border border-white/[0.06] rounded-xl p-3">
            <Info size={14} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
            AIIMS never publishes INI-CET marks. Your corrects are mapped through a crowd-sourced
            estimate for the percentile step; the percentile→rank and branch steps are exact
            official AIIMS data.
          </p>
        ) : null}
      </div>

      {/* GT input (§13: dynamic list, auto-fill, provenance) */}
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-[#F8FAFC]">Your Grand Test scores</h3>
            <p className="text-xs text-[#94A3B8] mt-1">
              Correct answers per Grand Test (out of 200). Add as many as you have — more GTs
              give a narrower, more reliable range.
            </p>
          </div>
        </div>

        {autoFilling ? (
          <p className="text-xs text-[#94A3B8] mb-3 flex items-center gap-2" aria-live="polite">
            <Loader2 size={12} className="animate-spin" /> Checking your Eyeconic Grand Tests…
          </p>
        ) : null}

        <div className="space-y-3" data-stagger>
          {rows.map((row, index) => {
            const error = validation.errors[index];
            // Live feedback: a row that HAS content shows its error as you
            // type; untouched empty rows only flag after a submit attempt.
            const highlighted = Boolean(error) && (row.value !== '' || rowErrors.has(index));
            return (
              <div key={row.key}>
                <div
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    highlighted ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08] bg-[#151E29]'
                  }`}
                >
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                      row.origin === 'auto' && !row.edited
                        ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/30'
                        : 'bg-white/[0.04] text-[#94A3B8] border-white/10'
                    }`}
                    title={
                      row.origin === 'auto' && !row.edited
                        ? 'Filled from your Eyeconic quiz attempts'
                        : 'Typed by you'
                    }
                  >
                    {row.origin === 'auto' && !row.edited ? <Zap size={10} /> : <User size={10} />}
                    {row.origin === 'auto' && !row.edited ? 'Auto-captured' : 'Self-reported'}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_CORRECTS}
                    step={1}
                    value={row.value}
                    onChange={(e) => updateRow(row.key, e.target.value)}
                    placeholder="e.g. 120"
                    aria-label={`Grand Test ${index + 1} correct answers`}
                    aria-invalid={Boolean(highlighted)}
                    className="w-24 bg-transparent text-[#F8FAFC] text-lg font-semibold outline-none text-center [appearance:textfield]"
                  />
                  <div className="flex-1 min-w-0 text-xs text-[#94A3B8] truncate">
                    {row.title ? <span className="text-[#CBD5E1]">{row.title}</span> : null}
                    {row.dateLabel ? <span> · {row.dateLabel}</span> : null}
                    {row.attemptsNote ? <span> · {row.attemptsNote}</span> : null}
                    {row.origin === 'auto' && row.edited ? (
                      <span className="text-[#FBBF24]"> · edited → self-reported</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    aria-label="Remove this Grand Test"
                    className="text-[#94A3B8] hover:text-rose-300 disabled:opacity-30 p-2 -m-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {highlighted ? (
                  <p className="text-xs text-rose-300 mt-1 ml-2">{error}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" onClick={() => addRow()} className="btn btn-outline text-sm px-4 py-2">
            <Plus size={14} className="mr-1.5" /> Add another GT
          </button>
          {suggestions.map((value, i) => (
            <button
              key={`sug-${i}`}
              type="button"
              onClick={() => addRow(value)}
              className="text-xs text-[#94A3B8] hover:text-[#4DD7C8] border border-white/10 rounded-full px-3 py-2"
              title="From your most recent prediction — confirm before use"
            >
              + {value} corrects (last time)
            </button>
          ))}
        </div>

        {/* assumption note — ALWAYS visible with the input (§3.4/§13) */}
        <p className="mt-4 flex items-start gap-2 text-xs text-[#94A3B8] bg-[#151E29] border border-white/[0.06] rounded-xl p-3">
          <Info size={14} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
          {NO_SKIP_NOTE}
        </p>

        {lowGtCount ? (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
            <Sparkles size={14} className="mt-0.5 shrink-0" />
            {LOW_GT_NOTE}
          </p>
        ) : null}

        {hasAutoGts && !autoFilling ? (
          <p className="mt-3 text-[11px] text-[#94A3B8]">
            Filled from your Eyeconic Grand Tests — the latest completed attempt per test. Tap any
            score to edit it.
          </p>
        ) : null}
      </div>

      {/* category & quota (§3.6: never defaulted) */}
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
        <h3 className="font-semibold text-[#F8FAFC] mb-1">Category &amp; quota</h3>
        <p className="text-xs text-[#94A3B8] mb-4">
          Needed for branch predictions — closing ranks differ a lot by category, so this is
          never assumed for you. Rank prediction works without it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="bg-[#151E29] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-[#F8FAFC] outline-none focus:border-[#18B6A4]/60"
          >
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'UR' ? 'UR (General)' : c}
              </option>
            ))}
          </select>
          {category ? (
            <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                checked={pwd}
                onChange={(e) => setPwd(e.target.checked)}
                className="accent-[#18B6A4]"
              />
              PwD
            </label>
          ) : null}
          <span className="text-[11px] uppercase tracking-wide text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
            {examId === 'INI_CET'
              ? 'Single counselling pool (all INIs)'
              : 'Quota: All India Quota'}
          </span>
        </div>
      </div>

      {formError ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-rose-300 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl p-3" role="alert">
          <AlertTriangle size={15} /> {formError}
        </p>
      ) : null}

      <button type="submit" disabled={predicting || !validation.valid} className="btn btn-primary w-full text-base py-3">
        {predicting ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" /> Predicting…
          </>
        ) : (
          <>
            <Sparkles size={16} className="mr-2" /> Predict my range
          </>
        )}
      </button>
      <p className="text-center text-xs text-[#94A3B8] mt-3">
        Estimate based on historical data — actual results may vary.{' '}
        <Link to="/predictor/history" className="text-[#18B6A4] hover:text-[#1CC8B5] underline underline-offset-2">
          View your prediction history
        </Link>
      </p>
    </form>
  );
};

export default PredictorForm;
