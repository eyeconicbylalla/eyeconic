import React, { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useAppAuth } from '../../context/AppAuthContext';
import type { ReadinessResponse } from '../../types/readiness';
import ReadinessForm from './ReadinessForm';
import ReadinessResult from './ReadinessResult';

/**
 * Readiness Score page (Feature 09, spec §17.2) — route /readiness, behind
 * RequireAuth. One question: given current Grand Test performance and the time
 * left before the target exam, how ready are you? The form collects raw
 * inputs; the server computes everything else (state, bar, gap, budget, exam
 * date) and the result view renders its response verbatim.
 *
 * Scoped under .ec-predictor so the shared predictor surface utilities
 * (data-anim, stagger, focus rings) apply to the reused ExamPicker/GtInputSection.
 */
const Readiness: React.FC = () => {
  const { user } = useAppAuth();
  const [result, setResult] = useState<ReadinessResponse | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    document.title = 'Readiness Score | EyeConic NEET PG';
    return () => {
      document.title = 'EyeConic NEET PG';
    };
  }, []);

  const handleResult = (res: ReadinessResponse) => {
    setResult(res);
    setAnnounce('Readiness result ready.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setResult(null);
    setAnnounce('Back to the readiness form.');
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
            <ReadinessResult res={result} onBack={handleBack} />
          </div>
        ) : (
          <div key="form" data-anim="fade-up">
            <div className="mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-3">
                <Gauge size={26} className="text-[#4DD7C8]" /> Readiness Score
              </h2>
              <p className="text-[#94A3B8] text-sm mt-2">
                {firstName ? `${firstName}, see` : 'See'} how your Grand Test performance stacks up
                against what NEET PG or INI-CET historically took — and whether the time left is enough
                to close the gap. Ready, moderately ready, or barely ready: one honest answer with every
                number behind it.
              </p>
            </div>
            <ReadinessForm onResult={handleResult} />
          </div>
        )}
      </div>
    </section>
  );
};

export default Readiness;
