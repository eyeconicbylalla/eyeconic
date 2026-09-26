import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Gauge, Sparkles } from 'lucide-react';
import { predictorEndpoints } from '../../lib/predictorClient';
import type { ReadinessCalendarResponse } from '../../types/readiness';
import { EXAM_LABELS, EXAM_PATTERN_LABELS } from '../../pages/predictor/constants';
import { examDateLabel, sessionLabel, timeRemainingLabel } from '../../pages/readiness/constants';

/**
 * Student Dashboard Readiness Score card (Feature 09, spec §17.1): the entry
 * point to /readiness with a countdown chip per exam, driven by the server's
 * exam calendar (the client never holds an exam date of its own). A calendar
 * load failure degrades silently — the card still links (§17.1).
 */
const ReadinessCard: React.FC = () => {
  const [calendar, setCalendar] = useState<ReadinessCalendarResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    predictorEndpoints
      .readinessCalendar()
      .then((data) => {
        if (!cancelled) setCalendar(data);
      })
      .catch(() => {
        // Silent by design: the countdown is a convenience, never a blocker.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chips = Object.entries(calendar?.exams ?? {})
    .map(([examId, entry]) => ({ examId, next: entry.next }))
    .filter((c): c is { examId: string; next: NonNullable<ReadinessCalendarResponse['exams'][string]['next']> } =>
      Boolean(c.next)
    );

  return (
    <div className="bg-[#18222E] border border-[#18B6A4]/25 rounded-2xl p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2 text-lg">
            <Gauge size={18} className="text-[#4DD7C8]" /> Readiness Score
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8] border border-[#18B6A4]/25">
              New
            </span>
          </h3>
          <p className="text-sm text-[#94A3B8] mt-1.5">
            How ready are you for NEET PG or INI-CET? Enter your latest Grand Test performance and see
            whether the time left closes the gap.
          </p>
          <p className="text-xs text-[#94A3B8]/80 mt-0.5">
            {EXAM_PATTERN_LABELS.NEET_PG} · {EXAM_PATTERN_LABELS.INI_CET}
          </p>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {chips.map(({ examId, next }) => (
                <span
                  key={examId}
                  className="inline-flex items-center gap-1.5 text-xs text-[#CBD5E1] bg-[#151E29] border border-white/[0.08] rounded-full px-3 py-1.5"
                  title={`${EXAM_LABELS[examId] ?? examId} ${sessionLabel(next.session)} · ${examDateLabel(next.examDate)}${
                    next.status === 'expected' ? ' (expected date)' : ''
                  }`}
                >
                  <CalendarClock size={12} className="text-[#4DD7C8]" />
                  {EXAM_LABELS[examId] ?? examId}: {timeRemainingLabel(next)} left
                  {next.status === 'expected' ? <span className="text-[#94A3B8]"> · expected</span> : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link to="/readiness" className="btn btn-primary text-sm px-4 py-2">
            <Sparkles size={15} className="mr-2" /> Check my readiness
            <ArrowRight size={14} className="ml-1.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ReadinessCard;
