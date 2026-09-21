import React, { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { useAppAuth } from '../context/AppAuthContext';
import type { PredictResponse, PredictionResult } from '../types/predictor';
import PredictorForm from './predictor/PredictorForm';
import ResultView from './predictor/ResultView';

/**
 * Rank & Branch Predictor (spec §13/§14 UI). Everything this page shows comes
 * from the persisted /api/predictor responses: ranges (never points), data
 * coverage, methodology + limitation notes, and §12 banding with explicit
 * extreme-range states. The legacy visitor GT predictor is retired — this is
 * the only predictor (§1).
 *
 * Thin orchestrator: the input experience lives in PredictorForm, the result
 * experience in ResultView (shared with /predictor/history), both under the
 * scoped `.ec-predictor` surface (motion + focus utilities in index.css).
 */
const Predictor: React.FC = () => {
  const { user } = useAppAuth();
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);
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

  const firstName = user?.name?.split(' ')[0];

  return (
    <section className="ec-predictor py-10 md:py-14 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-4 max-w-4xl">
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>

        {result ? (
          <div key="result" data-anim="fade-up">
            <ResultView
              result={result}
              predictionId={predictionId ?? undefined}
              onBack={handleBack}
            />
          </div>
        ) : (
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
        )}
      </div>
    </section>
  );
};

export default Predictor;
