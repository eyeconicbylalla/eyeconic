import React, { useEffect, useState } from 'react';
import { Sparkles, Target } from 'lucide-react';
import { useAppAuth } from '../context/AppAuthContext';
import type { DesiredBranchResponse, PredictResponse, PredictionResult } from '../types/predictor';
import DesiredBranchForm from './predictor/DesiredBranchForm';
import PredictorForm from './predictor/PredictorForm';
import ResultView from './predictor/ResultView';

/**
 * Rank & Branch Predictor + Desired Branch Predictor (Feature 02) — one page,
 * two modes (decision D3: a mode toggle inside /predictor, not a new page):
 *
 *   "Predict my outcome" — the forward flow (GTs → rank range → branches)
 *   "Plan for a branch"  — the reverse flow (branch → target rank → required
 *                          corrects → optional gap)
 *
 * Everything this page shows comes from persisted /api/predictor responses:
 * ranges (never points), data coverage, methodology + limitation notes.
 *
 * Thin orchestrator: input experiences live in PredictorForm /
 * DesiredBranchForm, the forward result in ResultView (shared with
 * /predictor/history), the reverse result in a provisional summary panel
 * until Phase 6 lands the designed view. All under the scoped `.ec-predictor`
 * surface (motion + focus utilities in index.css).
 */
type PredictorMode = 'predict' | 'desired';

const Predictor: React.FC = () => {
  const { user } = useAppAuth();
  const [mode, setMode] = useState<PredictorMode>('predict');
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [desired, setDesired] = useState<DesiredBranchResponse | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    document.title = 'Rank & Branch Predictor | EyeConic NEET PG';
    return () => {
      document.title = 'EyeConic NEET PG';
    };
  }, []);

  const handlePredicted = (data: PredictResponse) => {
    setResult(data.prediction);
    setPredictionId(data.predictionId);
    setAnnounce('Prediction ready.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setResult(null);
    setPredictionId(null);
    setAnnounce('Back to the input form.');
    window.scrollTo({ top: 0 });
  };

  const handleDesired = (data: DesiredBranchResponse) => {
    setDesired(data);
    setAnnounce('Target ready.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackDesired = () => {
    setDesired(null);
    setAnnounce('Back to the input form.');
    window.scrollTo({ top: 0 });
  };

  const switchMode = (next: PredictorMode) => {
    // Leaving a result view resets it — each mode starts from its own form.
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setPredictionId(null);
    setDesired(null);
    setAnnounce(next === 'desired' ? 'Planning mode: pick your branch.' : 'Prediction mode.');
  };

  const firstName = user?.name?.split(' ')[0];

  return (
    <section className="ec-predictor py-10 md:py-14 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-4 max-w-4xl">
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>

        {/* mode toggle (D3): the two directions of the same counselling data */}
        <div
          role="group"
          aria-label="Predictor mode"
          className="mb-8 flex p-1 bg-[#18222E] border border-white/[0.06] rounded-2xl"
          data-anim="fade-up"
        >
          <button
            type="button"
            aria-pressed={mode === 'predict'}
            onClick={() => switchMode('predict')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              mode === 'predict'
                ? 'bg-[#18B6A4]/15 text-[#4DD7C8]'
                : 'text-[#94A3B8] hover:text-[#CBD5E1]'
            }`}
          >
            <Sparkles size={15} /> Predict my outcome
          </button>
          <button
            type="button"
            aria-pressed={mode === 'desired'}
            onClick={() => switchMode('desired')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              mode === 'desired'
                ? 'bg-[#18B6A4]/15 text-[#4DD7C8]'
                : 'text-[#94A3B8] hover:text-[#CBD5E1]'
            }`}
          >
            <Target size={15} /> Plan for a branch
          </button>
        </div>

        {mode === 'predict' && result ? (
          <div key="result" data-anim="fade-up">
            <ResultView
              result={result}
              predictionId={predictionId ?? undefined}
              onBack={handleBack}
            />
          </div>
        ) : mode === 'predict' ? (
          <div key="form" data-anim="fade-up">
            <div className="mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-3">
                <Target size={26} className="text-[#4DD7C8]" /> Rank &amp; Branch Predictor
              </h2>
              <p className="text-[#94A3B8] text-sm mt-2">
                {firstName ? `${firstName}, see` : 'See'} where your Grand Test performance could land
                you in NEET PG or INI-CET — as an honest range, not a promise.
              </p>
            </div>
            <PredictorForm onPredicted={handlePredicted} />
          </div>
        ) : mode === 'desired' && desired ? (
          <div key="desired-result" data-anim="fade-up">
            {/* PHASE-5 PROVISIONAL SUMMARY — replaced by the designed result
                view (DBP §8 Phase 6: target table, required-corrects hero,
                gap panel, chips, methodology). */}
            <DesiredSummary res={desired} onBack={handleBackDesired} />
          </div>
        ) : (
          <div key="desired-form" data-anim="fade-up">
            <div className="mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-3">
                <Target size={26} className="text-[#4DD7C8]" /> Desired Branch Predictor
              </h2>
              <p className="text-[#94A3B8] text-sm mt-2">
                Name the branch you want — see the rank it historically took and roughly how many
                corrects that means. A planning target, not a promise.
              </p>
            </div>
            <DesiredBranchForm onResult={handleDesired} />
          </div>
        )}
      </div>
    </section>
  );
};

/** Provisional reverse-result summary (Phase 5 scaffold; Phase 6 redesigns). */
const DesiredSummary: React.FC<{ res: DesiredBranchResponse; onBack: () => void }> = ({ res, onBack }) => {
  const r = res.result;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'));
  const safe = r.required?.perClosing[0];
  const likely = r.required?.perClosing[1];
  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <h2 className="text-xl font-bold text-[#F8FAFC] mb-1">{r.input.branch.display}</h2>
      <p className="text-sm text-[#94A3B8] mb-6">
        {r.examLabel} · {r.input.category.value}
        {r.input.category.pwd ? ' (PwD)' : ''} · historical target rank {fmt(r.target.targetRankRange?.[0])}–{fmt(r.target.targetRankRange?.[1])}
      </p>

      {r.required ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-[#94A3B8] mb-1">Aim for (safe end)</p>
            <p className="text-2xl font-bold text-[#F8FAFC]">
              {safe?.corrects !== null && safe?.corrects !== undefined ? `≈ ${safe.corrects} corrects` : 'beyond the data'}
            </p>
            <p className="text-xs text-[#94A3B8] mt-1">clears even the tightest closing on record</p>
          </div>
          <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-[#94A3B8] mb-1">Historically enough (likely end)</p>
            <p className="text-2xl font-bold text-[#F8FAFC]">
              {likely?.corrects !== null && likely?.corrects !== undefined ? `≈ ${likely.corrects} corrects` : 'beyond the data'}
            </p>
            <p className="text-xs text-[#94A3B8] mt-1">cleared the loosest closing on record</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-amber-300/90 mb-6">
          No historical closing ranks for this branch under your category selection.
        </p>
      )}

      {r.gap ? (
        <p className="text-sm text-[#CBD5E1] mb-6">
          Your current average {r.current ? r.current.meanCorrects.toLocaleString('en-IN') : '—'} corrects ·{' '}
          <span className={
            r.gap.status === 'ON_TRACK' ? 'text-emerald-300'
              : r.gap.status === 'WITHIN_REACH' ? 'text-amber-300'
              : 'text-rose-300'
          }>
            {r.gap.status === 'ON_TRACK' ? 'on track — clears the safest target'
              : r.gap.status === 'WITHIN_REACH' ? 'within the historical range'
              : r.gap.status === 'NO_CURRENT_DATA' ? 'add Grand Tests to see the gap'
              : 'below the historical range'}
          </span>
        </p>
      ) : null}

      <ul className="text-xs text-[#94A3B8] space-y-1 mb-6">
        {r.warnings.map((w) => (
          <li key={w.code}>⚠ {w.note}</li>
        ))}
      </ul>

      <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
        Pick another branch
      </button>
    </div>
  );
};

export default Predictor;
