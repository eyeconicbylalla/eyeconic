import React from 'react';
import { Info } from 'lucide-react';
import type { PredictorExam, PredictorExamId } from '../../types/predictor';
import { EXAM_PATTERN_LABELS } from './constants';

/**
 * The exam selector (§13: functional, extensible, availability explicit) —
 * shared by the forward predictor form and the desired-branch form (extracted
 * from PredictorForm in Phase 5 of the Desired Branch Predictor).
 */

interface Props {
  exams: PredictorExam[];
  examId: PredictorExamId;
  onSelect: (id: PredictorExamId) => void;
}

const ExamPicker: React.FC<Props> = ({ exams, examId, onSelect }) => (
  <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
    <h3 className="font-semibold text-[#F8FAFC] mb-3">Exam</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {exams.map((exam) => (
        <button
          key={exam.id}
          type="button"
          disabled={!exam.available}
          onClick={() => onSelect(exam.id)}
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
);

export default ExamPicker;
