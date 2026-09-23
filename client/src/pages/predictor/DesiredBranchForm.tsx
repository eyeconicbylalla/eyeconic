import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Target } from 'lucide-react';
import {
  branchSuggestions, errorField, errorRowIndices, predictorEndpoints, predictorErrorMessage,
} from '../../lib/predictorClient';
import type {
  BranchCatalog, DesiredBranchResponse, PredictorExam, PredictorExamId,
} from '../../types/predictor';
import { CATEGORIES } from './constants';
import ExamPicker from './ExamPicker';
import GtInputSection from './GtInputSection';
import { useGtInput } from './useGtInput';

/**
 * Desired Branch Predictor input experience (Feature 02, DBP §1.3/§6.1;
 * D2 branch-only, D3 mode inside /predictor): exam → desired branch →
 * category (REQUIRED — closing ranks are category-specific, §3.6) → optional
 * current Grand Tests (only the gap stage needs them).
 *
 * Reuses the forward form's shared pieces: ExamPicker, the GT card
 * (GtInputSection/useGtInput in optional mode — empty rows simply contribute
 * nothing), and the same validation/error conventions.
 */

const DesiredBranchForm: React.FC<{ onResult: (res: DesiredBranchResponse) => void }> = ({ onResult }) => {
  const [exams, setExams] = useState<PredictorExam[]>([
    { id: 'NEET_PG', label: 'NEET PG', available: true, milestone: 'M1', patternVersion: '800-scale (+4/-1)' },
  ]);
  const [examId, setExamId] = useState<PredictorExamId>('NEET_PG');

  const [catalog, setCatalog] = useState<BranchCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [branchKey, setBranchKey] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [category, setCategory] = useState('');
  const [pwd, setPwd] = useState(false);

  const gt = useGtInput({ optional: true });
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Branch catalog follows the exam; switching exams resets the selection.
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalog(null);
    setBranchKey('');
    setSuggestions([]);
    predictorEndpoints
      .branchCatalog(examId)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        // The picker stays empty; the submit attempt surfaces a clear error.
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const selectedBranch = useMemo(
    () => catalog?.branches.find((b) => b.key === branchKey) ?? null,
    [catalog, branchKey]
  );

  // Light context under the picker: where the branch existed (per counselling
  // year/session), so "no data for a year" never surprises later.
  const branchContext = useMemo(() => {
    if (!selectedBranch) return null;
    const years = Object.keys(selectedBranch.perYear);
    if (!years.length) return null;
    const latest = selectedBranch.perYear[years[years.length - 1]];
    return `Offered in ${years.length} counselling ${years.length === 1 ? 'cycle' : 'cycles'} on record · ${latest.instituteCount} institutes in the latest one.`;
  }, [selectedBranch]);

  const canSubmit = Boolean(branchKey && category) && !catalogLoading && gt.validation.valid;

  const submit = async () => {
    setFormError('');
    setSuggestions([]);
    if (!gt.markInvalidRows()) {
      setFormError('Fix the highlighted Grand Test scores first — or clear those rows to continue without them.');
      return;
    }
    setSubmitting(true);
    try {
      const gts = gt.buildGtsPayload();
      const data = await predictorEndpoints.desiredBranch({
        exam: examId,
        branchKey,
        category,
        pwd,
        ...(gts.length ? { gts } : {}),
      });
      onResult(data);
    } catch (err) {
      setFormError(predictorErrorMessage(err, 'Could not work out the target. Please try again.'));
      const serverRows = errorRowIndices(err);
      if (serverRows.size > 0) gt.markRowErrors(serverRows);
      if (errorField(err) === 'branchKey') setSuggestions(branchSuggestions(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting) submit();
      }}
      noValidate
    >
      <ExamPicker exams={exams} examId={examId} onSelect={setExamId} />

      {/* desired branch (D2: branch-only — no institute scoping in V1) */}
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
        <h3 className="font-semibold text-[#F8FAFC] mb-1">The branch you want</h3>
        <p className="text-xs text-[#94A3B8] mb-4">
          Pick the specialty you are aiming for. You will get the rank it historically took —
          and roughly how many corrects that means.
        </p>
        {catalogLoading ? (
          <p className="text-xs text-[#94A3B8] flex items-center gap-2" aria-live="polite">
            <Loader2 size={12} className="animate-spin" /> Loading branches…
          </p>
        ) : (
          <select
            value={branchKey}
            onChange={(e) => {
              setBranchKey(e.target.value);
              setSuggestions([]);
            }}
            aria-label="Desired branch"
            className="w-full bg-[#151E29] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-[#F8FAFC] outline-none focus:border-[#18B6A4]/60"
          >
            <option value="">Select a branch…</option>
            {(catalog?.branches ?? []).map((b) => (
              <option key={b.key} value={b.key}>
                {b.display}
              </option>
            ))}
          </select>
        )}
        {branchContext ? <p className="text-[11px] text-[#94A3B8] mt-2">{branchContext}</p> : null}
        {suggestions.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#94A3B8]">Did you mean:</span>
            {suggestions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setBranchKey(key);
                  setSuggestions([]);
                }}
                className="text-xs text-[#4DD7C8] hover:text-[#1CC8B5] border border-[#18B6A4]/30 rounded-full px-3 py-1.5"
              >
                {catalog?.branches.find((b) => b.key === key)?.display ?? key}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* category & quota — REQUIRED here (closing ranks are category-specific) */}
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
        <h3 className="font-semibold text-[#F8FAFC] mb-1">Your category</h3>
        <p className="text-xs text-[#94A3B8] mb-4">
          Closing ranks differ a lot by category, so this is required — it is never assumed
          for you.
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

      <GtInputSection
        gt={gt}
        title="Where you are now (optional)"
        subtitle="Add your recent Grand Test corrects to see the gap to the target. Leave this empty to see just the target."
      />

      {formError ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-rose-300 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl p-3" role="alert">
          <AlertTriangle size={15} /> {formError}
        </p>
      ) : null}

      <button type="submit" disabled={!canSubmit || submitting} className="btn btn-primary w-full text-base py-3">
        {submitting ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" /> Working out the target…
          </>
        ) : (
          <>
            <Target size={16} className="mr-2" /> What do I need?
          </>
        )}
      </button>
      <p className="text-center text-xs text-[#94A3B8] mt-3">
        Historical closing ranks as a range — actual cutoffs move every year.
      </p>
    </form>
  );
};

export default DesiredBranchForm;
