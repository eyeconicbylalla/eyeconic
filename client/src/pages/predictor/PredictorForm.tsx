import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { errorRowIndices, predictorEndpoints, predictorErrorMessage } from '../../lib/predictorClient';
import type { PredictResponse, PredictorExam, PredictorExamId } from '../../types/predictor';
import { CATEGORIES } from './constants';
import ExamPicker from './ExamPicker';
import GtInputSection from './GtInputSection';
import { useGtInput } from './useGtInput';

/**
 * The predictor input experience (spec §3/§13): exam → Grand Tests → category,
 * with auto-fill from Eyeconic attempts (provenance-tagged). P0 de-cluttered:
 * plain-language copy everywhere, at most three "last time" chips, no dev
 * notes; P3: Enter submits (real form), history link; P4: live validation,
 * 44px remove targets, focus-visible rings (scoped CSS).
 *
 * Phase 5 (Desired Branch Predictor): the GT rows and the exam cards moved to
 * shared modules (useGtInput + GtInputSection + ExamPicker) — this form is a
 * byte-identical composition of them.
 */

const PredictorForm: React.FC<{ onPredicted: (res: PredictResponse) => void }> = ({ onPredicted }) => {
  const [exams, setExams] = useState<PredictorExam[]>([
    { id: 'NEET_PG', label: 'NEET PG', available: true, milestone: 'M1', patternVersion: '800-scale (+4/-1)' },
  ]);
  const [examId, setExamId] = useState<PredictorExamId>('NEET_PG');
  const [category, setCategory] = useState('');
  const [pwd, setPwd] = useState(false);

  const gt = useGtInput();
  const [predicting, setPredicting] = useState(false);
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

  const predict = async () => {
    setFormError('');
    if (!gt.markInvalidRows()) {
      setFormError('Fix the highlighted Grand Test scores first.');
      return;
    }
    setPredicting(true);
    try {
      const data = await predictorEndpoints.predict({
        exam: examId,
        gts: gt.buildGtsPayload(),
        ...(category ? { category, pwd } : {}),
      });
      onPredicted(data);
    } catch (err) {
      setFormError(predictorErrorMessage(err, 'Could not generate the prediction. Please try again.'));
      const serverRows = errorRowIndices(err);
      if (serverRows.size > 0) gt.markRowErrors(serverRows);
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
      <ExamPicker exams={exams} examId={examId} onSelect={setExamId} />

      <GtInputSection
        gt={gt}
        title="Your Grand Test scores"
        subtitle="Correct answers per Grand Test (out of 200). Add as many as you have — more GTs give a narrower, more reliable range."
      />

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

      <button type="submit" disabled={predicting || !gt.validation.valid} className="btn btn-primary w-full text-base py-3">
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
