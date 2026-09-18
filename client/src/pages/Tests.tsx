import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, Clock, FileText, PlayCircle, RefreshCw } from 'lucide-react';
import { appErrorMessage, appQuizApi, isAppUnavailable } from '../lib/appClient';
import type { QuizListItem } from '../types/app';
import OpenInAppButton from '../components/app/OpenInAppButton';

const TEST_TYPE_LABEL: Record<string, string> = {
  daily: 'Daily Test',
  weekly: 'Weekly Test',
  grand: 'Grand Test',
};

const statusOf = (quiz: QuizListItem): { label: string; tone: string; icon: React.ReactNode } => {
  const st = quiz.attemptStatus;
  if (st?.hasAttempted && st.status === 'in_progress') {
    return { label: 'In progress — resume', tone: 'text-[#4DD7C8] border-[#18B6A4]/40 bg-[#18B6A4]/10', icon: <PlayCircle size={14} /> };
  }
  if (st?.hasAttempted) {
    return { label: `Completed · ${st.marksObtained ?? '—'}/${quiz.totalMarks ?? '—'}`, tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', icon: <CheckCircle2 size={14} /> };
  }
  if (quiz.scheduledDate && new Date(quiz.scheduledDate) > new Date()) {
    return { label: 'Upcoming', tone: 'text-[#94A3B8] border-white/10 bg-white/[0.04]', icon: <Calendar size={14} /> };
  }
  if (quiz.expiryDate && new Date(quiz.expiryDate) < new Date()) {
    return { label: 'Expired', tone: 'text-rose-300 border-rose-400/30 bg-rose-400/10', icon: <AlertTriangle size={14} /> };
  }
  return { label: 'Not started', tone: 'text-[#CBD5E1] border-white/10 bg-white/[0.04]', icon: <FileText size={14} /> };
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

const Tests: React.FC = () => {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setQuizzes(null);
    setError('');
    setUnavailable(false);
    try {
      setQuizzes(await appQuizApi.list());
    } catch (err) {
      setError(appErrorMessage(err));
      setUnavailable(isAppUnavailable(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!quizzes) return null;
    if (filter === 'pending') return quizzes.filter((q) => !q.attemptStatus?.hasAttempted || q.attemptStatus?.status === 'in_progress');
    if (filter === 'completed') return quizzes.filter((q) => q.attemptStatus?.hasAttempted && q.attemptStatus?.status !== 'in_progress');
    return quizzes;
  }, [quizzes, filter]);

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">My Tests</h2>
            <p className="text-[#94A3B8] text-sm mt-1">Same tests as your Eyeconic app — progress stays in sync.</p>
          </div>
          <div className="flex items-center gap-3">
            <OpenInAppButton destination={{ screen: 'tests' }} />
            <button onClick={() => load()} className="btn btn-outline text-sm px-4 py-2" aria-label="Refresh">
              <RefreshCw size={14} className="mr-2" /> Refresh
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {(['all', 'pending', 'completed'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                filter === key
                  ? 'bg-[#18B6A4]/15 border-[#18B6A4]/40 text-[#4DD7C8]'
                  : 'bg-white/[0.03] border-white/[0.06] text-[#94A3B8] hover:text-[#CBD5E1]'
              }`}
            >
              {key === 'all' ? 'All' : key === 'pending' ? 'To Do' : 'Completed'}
            </button>
          ))}
        </div>

        {quizzes === null && !error && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-[#18222E] border border-white/[0.06] rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="dark-banner-error flex flex-col sm:flex-row sm:items-center gap-4">
            <AlertTriangle size={20} className="shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
            </div>
            <button onClick={() => load()} className="btn btn-outline text-sm px-4 py-2 shrink-0">Try Again</button>
          </div>
        )}

        {filtered && filtered.length === 0 && !error && (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-10 text-center">
            <FileText className="w-10 h-10 text-[#18B6A4] mx-auto mb-3" />
            <p className="text-[#CBD5E1] font-medium">No tests here yet</p>
            <p className="text-[#94A3B8] text-sm mt-1">
              {filter === 'all'
                ? 'Tests your mentors assign will appear here automatically.'
                : `Nothing under “${filter === 'pending' ? 'To Do' : 'Completed'}” right now.`}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {filtered?.map((quiz) => {
            const status = statusOf(quiz);
            const resumable = quiz.attemptStatus?.hasAttempted && quiz.attemptStatus?.status === 'in_progress';
            const detail = { pathname: `/tests/${quiz._id}`, search: resumable ? '?resume=1' : '' };
            return (
              <Link
                key={quiz._id}
                to={detail}
                className="block bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 hover:border-[#18B6A4]/30 hover:shadow-card-dark transition-all group"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8]">
                        {TEST_TYPE_LABEL[quiz.testType] || quiz.testType}
                      </span>
                      {quiz.subjectNames?.slice(0, 2).map((name) => (
                        <span key={name} className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.05] text-[#94A3B8]">{name}</span>
                      ))}
                    </div>
                    <h3 className="font-semibold text-[#F8FAFC] group-hover:text-[#4DD7C8] transition-colors truncate">{quiz.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94A3B8] mt-1.5">
                      {quiz.duration ? <span className="inline-flex items-center gap-1"><Clock size={12} /> {quiz.duration} min</span> : null}
                      {quiz.totalMarks ? <span>{quiz.totalMarks} marks</span> : null}
                      {formatDateTime(quiz.scheduledDate) && <span>Starts {formatDateTime(quiz.scheduledDate)}</span>}
                      {formatDateTime(quiz.expiryDate) && <span>Ends {formatDateTime(quiz.expiryDate)}</span>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border shrink-0 ${status.tone}`}>
                    {status.icon} {status.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Tests;
