import React from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { DailyPyqAnswer, DailyPyqAttempt } from '../../types/app';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 'B' for option index 1, 'Skipped' for unanswered, raw string otherwise. */
export function answerLabel(answer: unknown): string {
  if (answer === null || answer === undefined) return 'Skipped';
  if (typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < LETTERS.length) {
    return LETTERS[answer];
  }
  return String(answer);
}

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const dateLabel = (dateKey: string) => {
  const d = new Date(`${dateKey}T12:00:00`); // midday avoids TZ day-flip
  return isNaN(d.getTime())
    ? dateKey
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function AnswerRow({ attemptAnswer, index }: { attemptAnswer: DailyPyqAnswer; index: number }) {
  const { answered, isCorrect } = attemptAnswer;
  const status = !answered ? 'skipped' : isCorrect ? 'correct' : 'incorrect';

  return (
    <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-medium text-[#F8FAFC] whitespace-pre-line">
          <span className="text-[#94A3B8] mr-2">Q{index + 1}.</span>
          {attemptAnswer.questionText}
        </p>
        {status === 'correct' && (
          <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
            <CheckCircle2 size={14} /> Correct
          </span>
        )}
        {status === 'incorrect' && (
          <span className="flex items-center gap-1 text-xs text-rose-400 shrink-0">
            <XCircle size={14} /> Incorrect
          </span>
        )}
        {status === 'skipped' && (
          <span className="flex items-center gap-1 text-xs text-[#94A3B8] shrink-0">
            <MinusCircle size={14} /> Skipped
          </span>
        )}
      </div>

      {(attemptAnswer.assertion || attemptAnswer.reason) && (
        <div className="text-xs text-[#94A3B8] mb-2 space-y-1">
          {attemptAnswer.assertion && <p><span className="text-[#CBD5E1]">Assertion:</span> {attemptAnswer.assertion}</p>}
          {attemptAnswer.reason && <p><span className="text-[#CBD5E1]">Reason:</span> {attemptAnswer.reason}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs mb-3">
        <span className={`px-2.5 py-1 rounded-lg border ${answered && isCorrect ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-[#0A0F14] text-[#CBD5E1]'}`}>
          Your answer: {answerLabel(attemptAnswer.selectedAnswer)}
        </span>
        <span className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          Correct answer: {answerLabel(attemptAnswer.correctAnswer)}
        </span>
      </div>

      {attemptAnswer.explanation && (
        <div className="text-xs text-[#CBD5E1] bg-[#0A0F14] border border-white/[0.06] rounded-lg px-3 py-2.5">
          <span className="text-[#4DD7C8] font-medium">Explanation: </span>
          {attemptAnswer.explanation}
        </div>
      )}
    </div>
  );
}

/**
 * Authoritative result view for a Daily PYQ attempt — the server's graded
 * snapshot, shared by today's page and the history detail.
 */
const DailyPyqReview: React.FC<{ attempt: DailyPyqAttempt }> = ({ attempt }) => {
  const answers = attempt.answers ?? [];
  const pct = attempt.maxScore > 0 ? Math.max(0, Math.round((attempt.score / attempt.maxScore) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div className="bg-[#151E29] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#94A3B8] mb-1">{dateLabel(attempt.date)}</div>
            <div className="text-3xl font-bold text-[#F8FAFC]">
              {attempt.correctCount}/{attempt.totalQuestions}
              <span className="text-base font-medium text-[#94A3B8] ml-2">correct · {attempt.score}/{attempt.maxScore} marks · {pct}%</span>
            </div>
          </div>
          <div className="text-sm text-[#94A3B8]">Time taken: <span className="text-[#CBD5E1]">{formatDuration(attempt.timeTakenSeconds)}</span></div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-[#0A0F14] border border-white/[0.06] rounded-xl px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-emerald-400">{attempt.correctCount}</div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Correct</div>
          </div>
          <div className="bg-[#0A0F14] border border-white/[0.06] rounded-xl px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-rose-400">{attempt.incorrectCount}</div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Incorrect</div>
          </div>
          <div className="bg-[#0A0F14] border border-white/[0.06] rounded-xl px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-[#94A3B8]">{attempt.skippedCount}</div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Skipped</div>
          </div>
        </div>
      </div>

      {answers.length > 0 && (
        <div className="space-y-3">
          {answers.map((a, i) => (
            <AnswerRow key={`${a.question}-${i}`} attemptAnswer={a} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyPyqReview;
