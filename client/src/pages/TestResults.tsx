import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { appErrorMessage, appQuizApi } from '../lib/appClient';
import type { ResultsPayload } from '../types/app';
import MiniCctAnalysis from '../components/app/MiniCctAnalysis';
import OpenInAppButton from '../components/app/OpenInAppButton';

const Metric: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-[#F8FAFC]' }) => (
  <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4">
    <div className="text-xs text-[#94A3B8] mb-1">{label}</div>
    <div className={`text-xl font-bold ${tone}`}>{value}</div>
  </div>
);

const TestResults: React.FC = () => {
  const { quizId = '', attemptId = '' } = useParams();
  const [payload, setPayload] = useState<ResultsPayload | null>(null);
  const [groupBy, setGroupBy] = useState<'section' | 'subject'>('section');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retestState, setRetestState] = useState<'idle' | 'sent' | 'error'>('idle');

  const load = useCallback(async (group: 'section' | 'subject' = 'section') => {
    setLoading(true);
    setError('');
    try {
      setPayload(await appQuizApi.results(quizId, attemptId, group));
    } catch (err) {
      setError(appErrorMessage(err, 'This result could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [quizId, attemptId]);

  useEffect(() => {
    load(groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy]);

  const requestRetest = async () => {
    setRetestState('idle');
    try {
      await appQuizApi.requestRetest(quizId, attemptId);
      setRetestState('sent');
    } catch (err) {
      const message = appErrorMessage(err, 'Could not request a retest.');
      setRetestState(/already requested/i.test(message) ? 'sent' : 'error');
    }
  };

  if (loading && !payload) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <section className="py-16 md:py-24 bg-[#0A0F14] min-h-[60vh]">
        <div className="container mx-auto px-4 max-w-lg text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
          <p className="text-[#CBD5E1] mb-6">{error || 'Result not available.'}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => load(groupBy)} className="btn btn-primary">Try Again</button>
            <Link to="/tests" className="btn btn-outline">Back to My Tests</Link>
          </div>
        </div>
      </section>
    );
  }

  const { summary, attempt, quiz } = payload;
  // Mini CCT results open the dedicated analysis dashboard (Features 04/05)
  // instead of the generic score/performance blocks — the analysis carries the
  // score summary, subject comparison, heatmap, topics and tags itself.
  const isMiniCct = quiz.testType === 'mini';

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-4xl">
        <Link to="/tests" className="inline-flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#4DD7C8] mb-6">
          <ArrowLeft size={15} /> My Tests
        </Link>

        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">{quiz.title}</h2>
              <p className="text-sm text-[#94A3B8] mt-1">
                Submitted {attempt.endTime ? new Date(attempt.endTime).toLocaleString() : ''}
                {attempt.status === 'auto_submitted' && ' · auto-submitted at time limit'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shrink-0">
              <CheckCircle2 size={14} /> Completed
            </span>
          </div>

          {!isMiniCct && (
            <>
              <div className="text-center mb-8">
                <div className="text-5xl font-bold text-[#4DD7C8]">
                  {summary.marksObtained}
                  <span className="text-xl text-[#94A3B8]"> / {summary.totalMarks}</span>
                </div>
                <div className="text-sm text-[#94A3B8] mt-1">{summary.scorePercentage}% · {summary.accuracy}% accuracy</div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label="Correct" value={summary.correct} tone="text-emerald-300" />
                <Metric label="Incorrect" value={summary.incorrect} tone="text-rose-300" />
                <Metric label="Skipped" value={summary.skipped} tone="text-[#94A3B8]" />
                <Metric label="Attempted" value={`${summary.attempted}/${summary.totalQuestions}`} />
              </div>
            </>
          )}
        </div>

        {isMiniCct && <MiniCctAnalysis attemptId={attemptId} />}

        {!isMiniCct && attempt.sectionPerformance.length > 0 && (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 md:p-8 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#4DD7C8]">Performance</h3>
              <div className="flex rounded-lg border border-white/[0.08] overflow-hidden text-xs">
                {(['section', 'subject'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setGroupBy(key)}
                    className={`px-3 py-1.5 capitalize transition-colors ${groupBy === key ? 'bg-[#18B6A4] text-[#0A0F14] font-semibold' : 'text-[#94A3B8] hover:text-[#CBD5E1]'}`}
                  >
                    by {key}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {attempt.sectionPerformance.map((row, index) => {
                const total = row.correct + row.incorrect + row.skipped || 1;
                const correctPct = (row.correct / total) * 100;
                const wrongPct = (row.incorrect / total) * 100;
                return (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#CBD5E1]">{row.sectionName}</span>
                      <span className="text-[#94A3B8] text-xs">
                        {row.correct}✓ · {row.incorrect}✗ · {row.skipped}○{row.accuracy !== undefined ? ` · ${row.accuracy}%` : ''}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#151E29] overflow-hidden flex">
                      <div className="bg-emerald-400/70" style={{ width: `${correctPct}%` }} />
                      <div className="bg-rose-400/60" style={{ width: `${wrongPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {payload.wrongQuestions && payload.wrongQuestions.length > 0 && (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 md:p-8 mb-6">
            <h3 className="font-semibold text-[#4DD7C8] mb-4">Review — incorrect answers</h3>
            <div className="space-y-4">
              {payload.wrongQuestions.map((question) => (
                <div key={question.questionId} className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4">
                  <div className="text-xs text-[#94A3B8] mb-2 flex flex-wrap gap-x-3">
                    <span>Q{question.displayNumber ?? question.questionIndex + 1}</span>
                    {question.subjectName && <span>{question.subjectName}</span>}
                    {question.topicName && <span>{question.topicName}</span>}
                  </div>
                  {question.questionImage && <img src={question.questionImage} alt="" className="mb-3 rounded-lg border border-white/[0.06] max-h-60" />}
                  <p className="text-sm text-[#CBD5E1] mb-3">{question.question}</p>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div className="bg-rose-400/10 border border-rose-400/25 rounded-lg px-3 py-2">
                      <span className="text-xs text-[#94A3B8] block">Your answer</span>
                      <span className="text-rose-200">{question.selectedAnswerLabel || '—'}</span>
                    </div>
                    <div className="bg-emerald-400/10 border border-emerald-400/25 rounded-lg px-3 py-2">
                      <span className="text-xs text-[#94A3B8] block">Correct answer</span>
                      <span className="text-emerald-200">{question.correctAnswerLabel || '—'}</span>
                    </div>
                  </div>
                  {question.explanation && (
                    <div className="mt-3 text-sm text-[#CBD5E1] bg-[#101720] border border-white/[0.06] rounded-lg p-3">
                      <span className="text-xs text-[#4DD7C8] font-semibold block mb-1">Explanation</span>
                      {question.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {attempt.canRequestRetest && retestState !== 'sent' && (
            <button onClick={requestRetest} className="btn btn-outline text-sm">
              <RotateCcw size={15} className="mr-2" /> Request Retest
            </button>
          )}
          {retestState === 'sent' && <span className="text-sm text-[#94A3B8]">Retest requested — your mentor will review it.</span>}
          {retestState === 'error' && <span className="text-sm text-rose-300">Could not request a retest — try again.</span>}
          <OpenInAppButton destination={{ screen: 'quiz', quizId }} label="Open in App" />
        </div>
      </div>
    </section>
  );
};

export default TestResults;
