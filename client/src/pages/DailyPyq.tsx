import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CalendarCheck, ChevronLeft, Flame, Loader2, Send,
} from 'lucide-react';
import { appErrorMessage, dailyPyqApi, isAppUnavailable } from '../lib/appClient';
import type { DailyPyqQuestion, DailyPyqStreak, DailyPyqSubmitPayload, DailyPyqTodayPayload } from '../types/app';
import DailyPyqReview from '../components/app/DailyPyqReview';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const dateLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function StreakBadge({ streak }: { streak: DailyPyqStreak }) {
  if (streak.current <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-full px-2.5 py-1">
      <Flame size={12} /> {streak.current}-day streak
    </span>
  );
}

/** Single-choice question body (mcq_single / image_based / assertion_reason). */
function QuestionBody({
  question, selected, onSelect,
}: {
  question: DailyPyqQuestion;
  selected: number | null;
  onSelect: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-[#F8FAFC] text-sm sm:text-base whitespace-pre-line">{question.question}</p>
      {question.questionImage && (
        <img src={question.questionImage} alt="" className="mt-3 rounded-xl border border-white/[0.06] max-h-72 object-contain" />
      )}
      {question.assertion && (
        <p className="mt-3 text-xs sm:text-sm text-[#94A3B8]"><span className="text-[#CBD5E1]">Assertion:</span> {question.assertion}</p>
      )}
      {question.reason && (
        <p className="mt-1 text-xs sm:text-sm text-[#94A3B8]"><span className="text-[#CBD5E1]">Reason:</span> {question.reason}</p>
      )}
      <div className="mt-4 space-y-2.5">
        {(question.options ?? []).map((option, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={isSelected}
              className={`w-full flex items-center gap-3 text-left rounded-xl border px-4 py-3 transition-colors ${
                isSelected
                  ? 'border-[#18B6A4] bg-[#18B6A4]/10 text-[#F8FAFC]'
                  : 'border-white/[0.06] bg-[#151E29] text-[#CBD5E1] hover:border-[#18B6A4]/40'
              }`}
            >
              <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold ${
                isSelected ? 'bg-[#18B6A4] text-[#0A0F14]' : 'bg-[#0A0F14] text-[#94A3B8]'
              }`}>
                {LETTERS[i] ?? i + 1}
              </span>
              <span className="text-sm">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Daily PYQ — 10 past questions per day from the Eyeconic question bank.
 * The set, the grading and the streak are all server-authoritative; this
 * page only collects the student's choices and renders the server's result.
 */
const DailyPyq: React.FC = () => {
  const [payload, setPayload] = useState<DailyPyqTodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  // Player state (one question at a time, answers kept in memory).
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confirming, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const startedAt = useRef<number>(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    setPlaying(false);
    setAnswers({});
    setIndex(0);
    try {
      const data = await dailyPyqApi.today();
      setPayload(data);
      if (data.status !== 'completed') startedAt.current = Date.now();
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load Daily PYQ.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Guard against accidental loss of answers while playing.
  useEffect(() => {
    if (!playing || Object.keys(answers).length === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [playing, answers]);

  const questions = payload?.questions ?? [];
  const answeredCount = Object.keys(answers).length;

  const startPlaying = () => {
    startedAt.current = Date.now();
    setPlaying(true);
  };

  const select = (questionId: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const doSubmit = async () => {
    if (submitting || !payload) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const timeTakenSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      const body = payload.questions.map((q) => ({
        questionId: q._id,
        selectedAnswer: answers[q._id] ?? null,
      }));
      const result: DailyPyqSubmitPayload = await dailyPyqApi.submit(payload.date, body, timeTakenSeconds);
      // Refresh authoritative state (status flips to completed server-side).
      await load();
      setConfirmOpen(false);
      setPayload((prev) => (prev ? { ...prev, attempt: result.attempt } : prev));
    } catch (err) {
      const status = (err as { response?: { status?: number; data?: { appCode?: string } } })?.response;
      if (status?.status === 409 && status.data?.appCode === 'DAILY_PYQ_DATE_MISMATCH') {
        // The calendar day rolled over mid-attempt — load the new day.
        setConfirmOpen(false);
        await load();
        return;
      }
      setSubmitError(appErrorMessage(err, 'Could not submit Daily PYQ. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
          <div className="h-8 w-44 bg-[#18222E] rounded-xl animate-pulse mb-6" />
          <div className="h-64 bg-[#18222E] rounded-2xl animate-pulse" />
        </div>
      </section>
    );
  }

  if (error && !payload) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
          <div className="dark-banner-error text-sm">
            <p>{error}</p>
            {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
            <button onClick={load} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
          </div>
        </div>
      </section>
    );
  }

  if (!payload) return null;

  // ── Completed: authoritative result ───────────────────────────────────────
  if (payload.status === 'completed' && payload.attempt) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Link to="/dashboard" className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1">
              <ChevronLeft size={16} /> Dashboard
            </Link>
            <StreakBadge streak={payload.streak} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] mb-2">Daily PYQ — completed today ✓</h1>
          <p className="text-sm text-[#94A3B8] mb-6">{dateLabel(payload.date)}</p>
          <DailyPyqReview attempt={payload.attempt} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/daily-pyq/history" className="btn btn-outline text-sm px-4 py-2">View history</Link>
            <Link to="/tests" className="btn btn-outline text-sm px-4 py-2">My Tests</Link>
          </div>
        </div>
      </section>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (!playing) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <Link to="/dashboard" className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1">
              <ChevronLeft size={16} /> Dashboard
            </Link>
            <StreakBadge streak={payload.streak} />
          </div>
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 sm:p-8 text-center">
            <CalendarCheck className="w-10 h-10 text-[#18B6A4] mx-auto mb-4" />
            <h1 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">Daily PYQ</h1>
            <p className="text-sm text-[#94A3B8] mt-2">
              {payload.totalQuestions} Questions · Today's Challenge · {dateLabel(payload.date)}
            </p>
            <p className="text-xs text-[#94A3B8] mt-4 max-w-md mx-auto">
              10 past questions from the Eyeconic question bank, refreshed every day.
              NEET PG marking: +4 correct, −1 incorrect, skipped questions are never penalised.
            </p>
            <button onClick={startPlaying} className="btn btn-primary mt-6">Start Daily PYQ</button>
            {payload.streak.best > 0 && (
              <p className="text-xs text-[#94A3B8] mt-4">Best streak: {payload.streak.best} days</p>
            )}
          </div>
          <div className="mt-4 text-center">
            <Link to="/daily-pyq/history" className="text-sm text-[#18B6A4] hover:text-[#1CC8B5]">Past attempts →</Link>
          </div>
        </div>
      </section>
    );
  }

  // ── Player ────────────────────────────────────────────────────────────────
  const question = questions[index];
  const isLast = index === questions.length - 1;

  return (
    <section className="py-8 md:py-12 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-[#F8FAFC]">
            Question {index + 1} <span className="text-[#94A3B8]">of {questions.length}</span>
          </span>
          <span className="text-xs text-[#94A3B8]">{answeredCount}/{questions.length} answered</span>
        </div>

        {/* Palette */}
        <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Questions">
          {questions.map((q, i) => {
            const answered = answers[q._id] !== undefined;
            const current = i === index;
            return (
              <button
                key={q._id}
                type="button"
                role="tab"
                aria-selected={current}
                onClick={() => setIndex(i)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                  current
                    ? 'bg-[#18B6A4] text-[#0A0F14]'
                    : answered
                      ? 'bg-[#18B6A4]/20 text-[#4DD7C8] border border-[#18B6A4]/40'
                      : 'bg-[#151E29] text-[#94A3B8] border border-white/[0.06] hover:border-[#18B6A4]/40'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
          {question && (
            <QuestionBody
              question={question}
              selected={answers[question._id] ?? null}
              onSelect={(value) => select(question._id, value)}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-5">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="btn btn-outline text-sm px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={14} className="mr-2" /> Previous
          </button>

          {isLast ? (
            <button type="button" onClick={() => setConfirmOpen(true)} className="btn btn-primary text-sm px-5 py-2">
              <Send size={14} className="mr-2" /> Submit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="btn btn-primary text-sm px-4 py-2"
            >
              Next <ArrowRight size={14} className="ml-2" />
            </button>
          )}
        </div>

        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" aria-label="Confirm submission">
            <div className="bg-[#18222E] border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold text-[#F8FAFC] mb-2">Submit Daily PYQ?</h3>
              <p className="text-sm text-[#94A3B8] mb-1">
                You answered <span className="text-[#F8FAFC] font-medium">{answeredCount}</span> of {questions.length} questions.
              </p>
              <p className="text-xs text-[#94A3B8] mb-5">
                Unanswered questions count as skipped (no negative marks). You can submit only once per day.
              </p>
              {submitError && <div className="dark-banner-error text-xs mb-4">{submitError}</div>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={submitting}
                  className="btn btn-outline text-sm px-4 py-2 flex-1"
                >
                  Keep answering
                </button>
                <button type="button" onClick={doSubmit} disabled={submitting} className="btn btn-primary text-sm px-4 py-2 flex-1">
                  {submitting ? <><Loader2 size={14} className="mr-2 animate-spin" /> Submitting…</> : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default DailyPyq;
