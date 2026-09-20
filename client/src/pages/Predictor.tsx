import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Award, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, Plus,
  Sparkles, Target, Trash2, User, Zap,
} from 'lucide-react';
import { errorField, errorRowIndices, predictorEndpoints, predictorErrorMessage } from '../lib/predictorClient';
import { useAppAuth } from '../context/AppAuthContext';
import type {
  BranchBand, BranchesResponse, BranchRow, GtsResponse, GtAttemptInput, OutcomeGetResponse,
  OutcomeSubmission, PredictionResult, PredictorExam,
} from '../types/predictor';

/**
 * Rank & Branch Predictor (spec §13/§14 UI). Everything this page shows comes
 * from the persisted /api/predictor responses: ranges (never points), data
 * coverage chips, methodology + limitation notes, and §12 banding with
 * explicit extreme-range states. The legacy visitor GT predictor is retired —
 * this is the only predictor (§1).
 */

const NO_SKIP_NOTE =
  'Prediction assumes you attempted all questions and did not skip any questions in these Grand Tests.';
const LOW_GT_NOTE =
  'Based on few Grand Tests. Add more GTs for a narrower, more reliable estimate.';
const CATEGORIES = ['UR', 'EWS', 'OBC', 'SC', 'ST'] as const;
const MAX_CORRECTS = 200;

const BAND_META: Record<BranchBand, { label: string; hint: string; chip: string }> = {
  COMFORTABLE: {
    label: 'Comfortable',
    hint: 'Even the cautious end of your range cleared this closing rank.',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  WITHIN_RANGE: {
    label: 'Within range',
    hint: 'Part of your predicted range clears this closing rank.',
    chip: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  },
  BORDERLINE: {
    label: 'Borderline',
    hint: 'Just beyond the closing rank, within typical year-to-year cutoff movement.',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  ASPIRATIONAL: {
    label: 'Aspirational',
    hint: 'Needs cutoff movement at the extreme of what recent years show.',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

const RANK_COVERAGE_TEXT: Record<string, string> = {
  full: 'Range fully covered by the official result data.',
  'partial-top': 'Upper end goes beyond the top of the official result data.',
  'above-distribution': 'Above every recorded score in the official result data.',
  'partial-bottom': 'Lower end goes beyond the recorded result data.',
  'below-distribution': 'Below every recorded score in the official result data.',
};

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

const fmtRank = (rank: number | null, beyond?: number | null) => {
  if (rank === null || rank === undefined) {
    return beyond ? `beyond ${beyond.toLocaleString('en-IN')}` : '—';
  }
  return rank.toLocaleString('en-IN');
};

const fmtPct = (value: number) => `${value.toFixed(1)}%`;

const latestAttempt = (attempts: GtAttemptInput[]): GtAttemptInput => {
  return [...attempts].sort((a, b) => {
    const ta = typeof a.endedAt === 'string' ? Date.parse(a.endedAt) : (a.endedAt ?? 0);
    const tb = typeof b.endedAt === 'string' ? Date.parse(b.endedAt) : (b.endedAt ?? 0);
    return (tb as number) - (ta as number);
  })[0];
};

const dateLabel = (value?: string | number | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function rowValidationError(value: string): string | null {
  if (value.trim() === '') return 'Enter a score';
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return 'Whole numbers only (0 or more)';
  if (num > MAX_CORRECTS) return `Cannot exceed ${MAX_CORRECTS} questions`;
  return null;
}

const Predictor: React.FC = () => {
  const { user } = useAppAuth();
  const keySeq = useRef(1);
  const nextKey = () => keySeq.current++;

  const [exams, setExams] = useState<PredictorExam[]>([
    { id: 'NEET_PG', label: 'NEET PG', available: true, milestone: 'M1', patternVersion: '800-scale (+4/-1)' },
  ]);
  const [rows, setRows] = useState<GtRow[]>([{ key: nextKey(), value: '', origin: 'manual', edited: false }]);
  const [suggestions, setSuggestions] = useState<number[]>([]);
  const [category, setCategory] = useState('');
  const [pwd, setPwd] = useState(false);

  const [autoFillNote, setAutoFillNote] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowErrors, setRowErrors] = useState<Set<number>>(new Set());

  const [result, setResult] = useState<PredictionResult | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);

  // Branch browsing state.
  const [bandFilter, setBandFilter] = useState<BranchBand | ''>('');
  const [yearFilter, setYearFilter] = useState<number | ''>('');
  const [branchPage, setBranchPage] = useState(1);
  const [branches, setBranches] = useState<BranchesResponse | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState('');

  // --- auto-fill on mount (§13): GTs taken in the app are pre-filled -------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: GtsResponse = await predictorEndpoints.gts();
        if (cancelled) return;
        setAutoFillNote(data.notes?.[0] ?? null);
        setSuggestions(
          (data.selfReported || [])
            .map((s) => (s.attempts?.length ? s.attempts[s.attempts.length - 1].corrects : null))
            .filter((c): c is number => typeof c === 'number')
        );
        if (data.gts?.length) {
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
        }
      } catch {
        // Auto-fill is a convenience, never a blocker — manual entry works.
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

  // --- form helpers ---------------------------------------------------------

  const updateRow = (key: number, value: string) => {
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
    setRows((prev) => [
      ...prev,
      { key: nextKey(), value: prefill !== undefined ? String(prefill) : '', origin: 'manual', edited: false },
    ]);
  };

  const removeRow = (key: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.key !== key)));
  };

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
      const gts = rows.map((row) => {
        if (row.origin === 'auto' && !row.edited && row.attempts?.length) {
          return { gtId: row.gtId, provenance: 'auto-captured', attempts: row.attempts };
        }
        return {
          provenance: 'self-reported',
          attempts: [{ corrects: Number(row.value), status: 'completed' }],
        };
      });
      const body: Record<string, unknown> = { exam: 'NEET_PG', gts };
      if (category) {
        body.category = category;
        body.pwd = pwd;
      }
      const data = await predictorEndpoints.predict(body as never);
      setResult(data.prediction);
      setPredictionId(data.predictionId);
      setBandFilter('');
      setYearFilter('');
      setBranchPage(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setRowErrors(errorRowIndices(err));
      setFormError(predictorErrorMessage(err, 'Could not generate the prediction. Please try again.'));
    } finally {
      setPredicting(false);
    }
  };

  // --- branch rows (paginated) ----------------------------------------------

  // Type guard: BranchSummary.coverage is a wide string, so exclude the
  // CATEGORY_REQUIRED member explicitly rather than relying on narrowing.
  const branchSummary =
    result && isBranchSummary(result.branches) ? result.branches : null;

  const loadBranches = useCallback(async () => {
    if (!predictionId || !branchSummary) return;
    setBranchesLoading(true);
    setBranchesError('');
    try {
      const data = await predictorEndpoints.branches(predictionId, {
        ...(bandFilter ? { band: bandFilter } : {}),
        ...(yearFilter ? { year: yearFilter } : {}),
        page: branchPage,
        limit: 25,
      });
      setBranches(data);
    } catch (err) {
      setBranchesError(predictorErrorMessage(err, 'Could not load branch results.'));
    } finally {
      setBranchesLoading(false);
    }
  }, [predictionId, branchSummary, bandFilter, yearFilter, branchPage]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // --- render ----------------------------------------------------------------

  if (result) {
    return (
      <ResultView
        result={result}
        predictionId={predictionId ?? undefined}
        onBack={() => {
          setResult(null);
          setPredictionId(null);
          setBranches(null);
        }}
        branchState={{
          summary: branchSummary,
          data: branches,
          loading: branchesLoading,
          error: branchesError,
          bandFilter,
          yearFilter,
          page: branchPage,
          setBandFilter: (band) => {
            setBandFilter(band);
            setBranchPage(1);
          },
          setYearFilter: (year) => {
            setYearFilter(year);
            setBranchPage(1);
          },
          setPage: setBranchPage,
          reload: loadBranches,
        }}
      />
    );
  }

  return (
    <section className="py-10 md:py-14 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-3">
            <Target size={26} className="text-[#4DD7C8]" /> Rank &amp; Branch Predictor
          </h2>
          <p className="text-[#94A3B8] text-sm mt-2">
            {user?.name?.split(' ')[0] || 'There'}, see where your Grand Test performance could
            land you in NEET PG — as an honest range, not a promise.
          </p>
        </div>

        {/* --- exam selector (§13) --- */}
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-6">
          <h3 className="font-semibold text-[#F8FAFC] mb-3">Exam</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {exams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                disabled={!exam.available}
                className={`text-left rounded-xl border p-4 transition ${
                  exam.available
                    ? 'border-[#18B6A4]/60 bg-[#18B6A4]/10'
                    : 'border-white/[0.06] bg-[#151E29] opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#F8FAFC]">{exam.label}</span>
                  {exam.available ? (
                    <span className="text-[10px] uppercase tracking-wide text-[#4DD7C8] border border-[#18B6A4]/40 rounded-full px-2 py-0.5">
                      Selected
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-[#94A3B8] border border-white/10 rounded-full px-2 py-0.5">
                      Coming soon · {exam.milestone}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#94A3B8] mt-1">
                  {exam.patternVersion} · 200 questions
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* --- GT input (§13: dynamic list, auto-fill, provenance) --- */}
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="font-semibold text-[#F8FAFC]">Your Grand Test scores</h3>
              <p className="text-xs text-[#94A3B8] mt-1">
                Correct answers per Grand Test (out of 200). Add as many as you have — more GTs
                give a narrower, more reliable range.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const error = validation.errors[index];
              const highlighted = rowErrors.has(index) && error;
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
                      className="text-[#94A3B8] hover:text-rose-300 disabled:opacity-30"
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
                className="text-xs text-[#94A3B8] hover:text-[#4DD7C8] border border-white/10 rounded-full px-3 py-1.5"
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

          {autoFillNote ? <p className="mt-3 text-[11px] text-[#64748B]">{autoFillNote}</p> : null}
        </div>

        {/* --- category & quota (§3.6: never defaulted) --- */}
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-6">
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
            <span className="text-[10px] uppercase tracking-wide text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
              Quota: All India Quota
            </span>
          </div>
        </div>

        {formError ? (
          <p className="mb-4 flex items-center gap-2 text-sm text-rose-300 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl p-3">
            <AlertTriangle size={15} /> {formError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={predict}
          disabled={predicting || !validation.valid}
          className="btn btn-primary w-full text-base py-3"
        >
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
        <p className="text-center text-[11px] text-[#64748B] mt-3">
          Estimate based on historical data — actual results may vary. Every prediction is saved
          to your history.
        </p>
      </div>
    </section>
  );
};

function isBranchSummary(
  branches: PredictionResult['branches']
): branches is Exclude<PredictionResult['branches'], { coverage: 'CATEGORY_REQUIRED' }> {
  return branches.coverage !== 'CATEGORY_REQUIRED';
}

// ---- result view --------------------------------------------------------------

interface BranchState {
  summary: Exclude<PredictionResult['branches'], { coverage: 'CATEGORY_REQUIRED' }> | null;
  data: BranchesResponse | null;
  loading: boolean;
  error: string;
  bandFilter: BranchBand | '';
  yearFilter: number | '';
  page: number;
  setBandFilter: (band: BranchBand | '') => void;
  setYearFilter: (year: number | '') => void;
  setPage: (page: number) => void;
  reload: () => void;
}

const ResultView: React.FC<{
  result: PredictionResult;
  predictionId?: string;
  onBack: () => void;
  branchState: BranchState;
}> = ({
  result,
  predictionId,
  onBack,
  branchState,
}) => {
  const { estimate, rank, aggregation, method } = result;
  const skippedWarning = estimate.warnings.find((w) => w.code === 'NO_SKIP_ASSUMPTION_WEAKENED');

  return (
    <section className="py-10 md:py-14 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-4xl">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[#94A3B8] hover:text-[#4DD7C8] mb-6 inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} /> Edit GTs &amp; predict again
        </button>

        {/* --- the ranges (§11: never a bare point; width visible) --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
            <div className="text-[#94A3B8] text-xs uppercase tracking-wide mb-2">
              Estimated percentile
            </div>
            <div className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">
              {fmtPct(estimate.percentile.range[0])} – {fmtPct(estimate.percentile.range[1])}
            </div>
            <p className="text-xs text-[#94A3B8] mt-2">
              {RANK_COVERAGE_TEXT[estimate.percentile.coverage] ?? ''}
            </p>
          </div>
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
            <div className="text-[#94A3B8] text-xs uppercase tracking-wide mb-2">
              Predicted AIR range · NEET PG {rank.examYear}
            </div>
            <div className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">
              {fmtRank(rank.bestRank, rank.beyondLastRecordedRank)} –{' '}
              {fmtRank(rank.worstRank, rank.beyondLastRecordedRank)}
            </div>
            <p className="text-xs text-[#94A3B8] mt-2">
              {RANK_COVERAGE_TEXT[rank.coverage] ?? ''}
            </p>
          </div>
        </div>

        {/* --- range-width context (§11: 1 GT must look less confident) --- */}
        <div
          className={`rounded-2xl border p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs ${
            aggregation.lowDataCaution
              ? 'bg-amber-500/[0.07] border-amber-500/25 text-amber-200'
              : 'bg-[#18222E] border-white/[0.06] text-[#94A3B8]'
          }`}
        >
          <span>
            Based on <strong className="text-[#F8FAFC]">{aggregation.n}</strong>{' '}
            {aggregation.n === 1 ? 'Grand Test' : 'Grand Tests'} · range ±
            {estimate.performance.halfWidthCorrects} marks
          </span>
          <span>
            GT spread (SD): {estimate.performance.dispersion.sdCorrects}
          </span>
          <span>Transfer: Tier 1 (fraction-correct parity)</span>
          {aggregation.lowDataCaution ? (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={12} /> {LOW_GT_NOTE}
            </span>
          ) : null}
        </div>

        {skippedWarning ? (
          <p className="mb-6 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {skippedWarning.note}
          </p>
        ) : null}

        {/* --- aggregation summary with provenance (§13) --- */}
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4">
          <h3 className="font-semibold text-[#F8FAFC] mb-3">What went in</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {result.input.gts.map((gt, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border ${
                  gt.provenance === 'auto-captured'
                    ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/30'
                    : 'bg-white/[0.04] text-[#CBD5E1] border-white/10'
                }`}
              >
                {gt.provenance === 'auto-captured' ? <Zap size={11} /> : <User size={11} />}
                GT {i + 1}: <strong>{gt.selected?.corrects ?? '—'}</strong> corrects
                {gt.excluded.length ? (
                  <span className="text-[#64748B]">({gt.excluded.length} older attempt(s) skipped)</span>
                ) : null}
              </span>
            ))}
          </div>
          <p className="text-xs text-[#94A3B8]">
            Aggregate used: <strong className="text-[#CBD5E1]">mean = {aggregation.mean}</strong>{' '}
            (median {aggregation.median} shown for comparison).
          </p>
        </div>

        {/* --- data coverage chips next to the numbers (§13 general rules) --- */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-[10px] uppercase tracking-wide text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
            Rank mapping: official NEET PG {rank.examYear} results
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
            Branches: MCC counselling {method.datasetSnapshots.counselling
              .map((c) => c.match(/-(\d{4})-/)?.[1])
              .filter(Boolean)
              .join(' & ')}
          </span>
        </div>

        {/* --- methodology + limitation notes (§13/§14, from the API) --- */}
        <div className="bg-[#151E29] border border-white/[0.06] rounded-2xl p-4 mb-8 space-y-1.5">
          {estimate.notes.map((note, i) => (
            <p key={i} className="text-xs text-[#94A3B8] flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0" /> {note}
            </p>
          ))}
        </div>

        <BranchSection state={branchState} />

        {/* §18 Phase 10a: consent-based outcome capture, reachable from the result */}
        {predictionId ? <OutcomeSection predictionId={predictionId} /> : null}
      </div>
    </section>
  );
};

// ---- branch results ------------------------------------------------------------

const BRANCH_COVERAGE_TEXT: Record<string, string> = {
  MATCHED: 'Branches your range has historically corresponded to:',
  PARTIAL:
    'Your optimistic end matches historical cutoffs; the cautious end is beyond the last recorded allotment. The overlapping portion is shown.',
  BEYOND_LAST_CLOSING:
    'Your estimated range is beyond the last rank historically allotted in the covered years. This reflects current GT performance, not fate — add more GTs and keep preparing.',
  NO_DATA_FOR_FILTER: 'No counselling data for this combination in the covered years.',
};

const BranchSection: React.FC<{ state: BranchState }> = ({ state }) => {
  if (!state.summary) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-center">
        <Award size={22} className="text-[#4DD7C8] mx-auto mb-3" />
        <h3 className="font-semibold text-[#F8FAFC] mb-1">Want possible branches too?</h3>
        <p className="text-sm text-[#94A3B8] mb-4 max-w-md mx-auto">
          Category is needed to match counselling cutoffs — it is never assumed. Tap “Edit GTs
          &amp; predict again” above, pick your category, and run the prediction once more.
        </p>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="btn btn-outline text-sm px-4 py-2">
          <ArrowLeft size={14} className="mr-1.5" /> Back to inputs
        </button>
      </div>
    );
  }

  const { summary, data, loading, error, bandFilter, yearFilter, page, setBandFilter, setYearFilter, setPage } = state;
  const years = summary.dataCoverage.years;
  const bandCounts = (band: BranchBand) =>
    summary.years.reduce((acc, y) => acc + (y.counts?.[band] ?? 0), 0);

  const aboveAll = summary.years.some((y) => y.aboveAllClosings);

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
            <Award size={16} className="text-[#4DD7C8]" /> Possible branches &amp; colleges
          </h3>
          <p className="text-xs text-[#94A3B8] mt-1">
            {summary.category.value}
            {summary.category.pwd ? ' · PwD' : ''} · {summary.quota} quota · final-state closing
            ranks ({years.join(' & ')})
          </p>
        </div>
      </div>

      {aboveAll ? (
        <p className="mb-4 text-xs text-emerald-300/90 bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl p-3">
          Your range sits at or above the top of the historical admissions data — every listed
          option is comfortably within reach historically.
        </p>
      ) : null}

      <p className="text-xs text-[#94A3B8] mb-4">
        {BRANCH_COVERAGE_TEXT[summary.coverage] ?? ''}
      </p>

      {/* band filters with counts */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={() => setBandFilter('')}
          className={`text-xs rounded-full px-3 py-1.5 border transition ${
            bandFilter === ''
              ? 'bg-white/[0.08] text-[#F8FAFC] border-white/20'
              : 'text-[#94A3B8] border-white/10 hover:text-[#CBD5E1]'
          }`}
        >
          All bands ({summary.years.reduce((acc, y) => acc + (y.counts?.total ?? 0), 0)})
        </button>
        {(Object.keys(BAND_META) as BranchBand[]).map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => setBandFilter(bandFilter === band ? '' : band)}
            title={BAND_META[band].hint}
            className={`text-xs rounded-full px-3 py-1.5 border transition ${
              bandFilter === band ? BAND_META[band].chip : 'text-[#94A3B8] border-white/10 hover:text-[#CBD5E1]'
            }`}
          >
            {BAND_META[band].label} ({bandCounts(band)})
          </button>
        ))}
        <span className="flex-1" />
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : '')}
          aria-label="Counselling year"
          className="bg-[#151E29] border border-white/[0.1] rounded-full px-3 py-1.5 text-xs text-[#CBD5E1] outline-none"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* rows table */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-[#151E29] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-rose-300">
          <p className="mb-3">{error}</p>
          <button type="button" onClick={state.reload} className="btn btn-outline text-xs px-3 py-1.5">
            Retry
          </button>
        </div>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-sm text-[#94A3B8] py-6 text-center">
          No options for this filter — try another band or year.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {data.rows.map((row: BranchRow, i) => (
              <div
                key={`${row.year}-${row.institute}-${row.branch}-${i}`}
                className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#F8FAFC] truncate" title={row.institute}>
                      {row.institute}
                    </p>
                    <p className="text-xs text-[#4DD7C8] mt-0.5">{row.branch}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${BAND_META[row.band].chip}`}
                    title={BAND_META[row.band].hint}
                  >
                    {BAND_META[row.band].label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#94A3B8] mt-2">
                  <span>
                    Closing rank <strong className="text-[#CBD5E1]">{row.closingRank.toLocaleString('en-IN')}</strong>
                  </span>
                  <span>Year {row.year}</span>
                  <span>{row.category}</span>
                  <span>{row.quota}</span>
                </div>
              </div>
            ))}
          </div>

          {/* pagination */}
          <div className="flex items-center justify-between mt-4 text-xs text-[#94A3B8]">
            <span>
              Page {data.filters.page} of {Math.max(1, data.totalPages)} · {data.total.toLocaleString('en-IN')} options
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn btn-outline !px-2.5 !py-1.5 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
                className="btn btn-outline !px-2.5 !py-1.5 disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </span>
          </div>
        </>
      )}

      {/* §12/§14 framing (from the API notes) */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-1.5">
        {summary.notes.map((note, i) => (
          <p key={i} className="text-[11px] text-[#64748B] flex items-start gap-2">
            <Info size={11} className="mt-0.5 shrink-0" /> {note}
          </p>
        ))}
      </div>
    </div>
  );
};

// ---- outcome capture (§15, §18 Phase 10a) --------------------------------------
//
// The consent-based post-exam self-report. Voluntary by design: nothing is
// required to use the predictor, every submission re-consents, and a recorded
// outcome can be edited or withdrawn. Only actual score / percentile / rank
// are captured — counselling outcomes land in M2 (Phase 10b).

const OUTCOME_CONSENT_NOTE =
  'I agree to share this result with Eyeconic to help calibrate the predictor. This is voluntary — I can edit or withdraw it anytime.';
const OUTCOME_INTRO_NOTE =
  'Your NEET PG result is out? Pairing your actual score, percentile or rank with this prediction helps make future ranges more accurate for everyone.';

const MAX_SCORE = 800; // 800-scale NEET PG pattern (spec §10)

interface OutcomeFieldErrors {
  score?: string;
  percentile?: string;
  rank?: string;
}

function outcomeFieldErrors(score: string, percentile: string, rank: string): OutcomeFieldErrors {
  const errors: OutcomeFieldErrors = {};
  if (score !== '') {
    const n = Number(score);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_SCORE) {
      errors.score = `Whole number between 0 and ${MAX_SCORE}`;
    }
  }
  if (percentile !== '') {
    const n = Number(percentile);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.percentile = 'Between 0 and 100';
  }
  if (rank !== '') {
    const n = Number(rank);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) errors.rank = 'Whole number, 1 or more';
  }
  return errors;
}

const OutcomeSection: React.FC<{ predictionId: string }> = ({ predictionId }) => {
  const [record, setRecord] = useState<OutcomeGetResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState('');
  const [percentile, setPercentile] = useState('');
  const [rank, setRank] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState('');
  const [serverField, setServerField] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRecord(await predictorEndpoints.outcome(predictionId));
    } catch {
      setRecord(null); // none recorded (or transient) — the card is optional
    } finally {
      setLoaded(true);
    }
  }, [predictionId]);

  useEffect(() => {
    setLoaded(false);
    setFormOpen(false);
    setEditing(false);
    load();
  }, [load]);

  const fieldErrors = useMemo(
    () => outcomeFieldErrors(score, percentile, rank),
    [score, percentile, rank]
  );
  const anyValue = score !== '' || percentile !== '' || rank !== '';
  const canSubmit =
    consent && anyValue && !saving && Object.keys(fieldErrors).length === 0;

  const openForm = (from?: OutcomeGetResponse) => {
    setScore(from && from.outcome.score !== null ? String(from.outcome.score) : '');
    setPercentile(from && from.outcome.percentile !== null ? String(from.outcome.percentile) : '');
    setRank(from && from.outcome.rank !== null ? String(from.outcome.rank) : '');
    setConsent(false); // every submission re-consents (§15)
    setError('');
    setServerField(null);
    setConfirmWithdraw(false);
    setEditing(Boolean(from));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(false);
    setError('');
    setServerField(null);
  };

  const submit = async () => {
    if (!consent) {
      setError('Sharing is voluntary — tick the consent box to submit.');
      return;
    }
    if (!anyValue) {
      setError('Enter at least one value: actual score, percentile or rank.');
      return;
    }
    if (Object.keys(fieldErrors).length) {
      setError('Fix the highlighted values first.');
      return;
    }
    setSaving(true);
    setError('');
    setServerField(null);
    try {
      const body: OutcomeSubmission = { consent: true };
      if (score !== '') body.score = Number(score);
      if (percentile !== '') body.percentile = Number(percentile);
      if (rank !== '') body.rank = Number(rank);
      await predictorEndpoints.saveOutcome(predictionId, body);
      closeForm();
      await load();
    } catch (err) {
      setError(predictorErrorMessage(err, 'Could not save your result. Please try again.'));
      setServerField(errorField(err));
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    try {
      await predictorEndpoints.withdrawOutcome(predictionId);
      setRecord(null);
      closeForm();
    } catch (err) {
      setError(predictorErrorMessage(err, 'Could not withdraw. Please try again.'));
    } finally {
      setWithdrawing(false);
      setConfirmWithdraw(false);
    }
  };

  if (!loaded) return null;

  const fieldClass = (name: keyof OutcomeFieldErrors) =>
    `w-full bg-[#151E29] border rounded-xl px-3 py-2.5 text-sm text-[#F8FAFC] outline-none focus:border-[#18B6A4]/60 ${
      (serverField === name && !fieldErrors[name]) || fieldErrors[name]
        ? 'border-rose-500/60'
        : 'border-white/[0.1]'
    }`;

  const renderForm = () => (
    <div className="mt-4 space-y-4">
      {!editing ? <p className="text-xs text-[#94A3B8]">{OUTCOME_INTRO_NOTE}</p> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="outcome-score" className="block text-xs text-[#94A3B8] mb-1.5">
            Actual score (/{MAX_SCORE})
          </label>
          <input
            id="outcome-score"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SCORE}
            step={1}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={fieldClass('score')}
            placeholder="e.g. 480"
          />
          {fieldErrors.score ? (
            <p className="text-xs text-rose-300 mt-1">{fieldErrors.score}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="outcome-percentile" className="block text-xs text-[#94A3B8] mb-1.5">
            Percentile
          </label>
          <input
            id="outcome-percentile"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            value={percentile}
            onChange={(e) => setPercentile(e.target.value)}
            className={fieldClass('percentile')}
            placeholder="e.g. 81.2"
          />
          {fieldErrors.percentile ? (
            <p className="text-xs text-rose-300 mt-1">{fieldErrors.percentile}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="outcome-rank" className="block text-xs text-[#94A3B8] mb-1.5">
            AIR (rank)
          </label>
          <input
            id="outcome-rank"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            className={fieldClass('rank')}
            placeholder="e.g. 42000"
          />
          {fieldErrors.rank ? <p className="text-xs text-rose-300 mt-1">{fieldErrors.rank}</p> : null}
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-xs text-[#CBD5E1] cursor-pointer bg-[#151E29] border border-white/[0.06] rounded-xl p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="accent-[#18B6A4] mt-0.5"
        />
        <span>
          {OUTCOME_CONSENT_NOTE}
          {serverField === 'consent' ? (
            <span className="block text-rose-300 mt-1">Please tick the consent box first.</span>
          ) : null}
        </span>
      </label>

      {error ? (
        <p className="flex items-center gap-2 text-xs text-rose-300">
          <AlertTriangle size={13} /> {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="btn btn-primary text-sm px-4 py-2"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="mr-1.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="mr-1.5" /> {editing ? 'Update result' : 'Share my result'}
            </>
          )}
        </button>
        <button type="button" onClick={closeForm} className="text-xs text-[#94A3B8] hover:text-[#CBD5E1]">
          Cancel
        </button>
      </div>
    </div>
  );

  // Recorded view: values + honest predicted-vs-actual context + edit/withdraw.
  if (record && !formOpen) {
    const o = record.outcome;
    const summary = record.predictionSummary;
    return (
      <div className="bg-[#18222E] border border-[#18B6A4]/25 rounded-2xl p-6 mt-6">
        <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
          <CheckCircle2 size={16} className="text-[#4DD7C8]" /> Your actual result — recorded, thank you
        </h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm text-[#F8FAFC]">
          {o.score !== null ? <span>Score <strong>{o.score}</strong>/{MAX_SCORE}</span> : null}
          {o.percentile !== null ? <span>Percentile <strong>{o.percentile}</strong></span> : null}
          {o.rank !== null ? (
            <span>AIR <strong>{o.rank.toLocaleString('en-IN')}</strong></span>
          ) : null}
        </div>
        {o.rank !== null && summary.rankRange ? (
          <p className="text-xs text-[#94A3B8] mt-2">
            This prediction said AIR {fmtRank(summary.rankRange[0])} – {fmtRank(summary.rankRange[1])}{' '}
            · your pair is saved to calibrate future ranges.
          </p>
        ) : (
          <p className="text-xs text-[#94A3B8] mt-2">
            Linked to this prediction — the pair is saved to calibrate future ranges.
          </p>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button type="button" onClick={() => openForm(record)} className="btn btn-outline text-xs px-3 py-1.5">
            Edit
          </button>
          {confirmWithdraw ? (
            <>
              <button
                type="button"
                onClick={withdraw}
                disabled={withdrawing}
                className="text-xs text-rose-300 border border-rose-500/40 rounded-full px-3 py-1.5 hover:bg-rose-500/10"
              >
                {withdrawing ? 'Withdrawing…' : 'Confirm withdraw'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmWithdraw(false)}
                className="text-xs text-[#94A3B8] hover:text-[#CBD5E1]"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmWithdraw(true)}
              className="text-xs text-[#94A3B8] hover:text-rose-300 inline-flex items-center gap-1.5"
            >
              <Trash2 size={12} /> Withdraw
            </button>
          )}
        </div>
      </div>
    );
  }

  if (formOpen) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mt-6">
        <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
          <CheckCircle2 size={16} className="text-[#4DD7C8]" />
          {editing ? 'Edit your actual result' : 'Share your actual result (optional)'}
        </h3>
        {renderForm()}
      </div>
    );
  }

  // Collapsed intro (nothing recorded yet).
  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mt-6">
      <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
        <CheckCircle2 size={16} className="text-[#4DD7C8]" /> Result out? Make the next prediction better
      </h3>
      <p className="text-xs text-[#94A3B8] mt-2 mb-4">{OUTCOME_INTRO_NOTE}</p>
      <button type="button" onClick={() => openForm()} className="btn btn-outline text-sm px-4 py-2">
        <Plus size={14} className="mr-1.5" /> Add my actual result
      </button>
    </div>
  );
};

export default Predictor;
