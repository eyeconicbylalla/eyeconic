import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, History, Loader2, PlayCircle, RefreshCw, Zap } from 'lucide-react';
import { appErrorMessage, isAppUnavailable, miniCctApi } from '../../lib/appClient';
import type { MiniCctLatestPayload } from '../../types/app';

/**
 * Student Dashboard Mini CCT card (Feature 04): surfaces the latest Mini CCT —
 * 30 questions, 10 each from Psychiatry, Dermatology and Orthopaedics — with
 * start/resume/analysis actions. The attempt itself runs through the normal
 * /tests flow; after submission the results page embeds the Mini CCT analysis.
 *
 * Renders nothing when no Mini CCT is available to this student; load errors
 * stay inside the card and never hide the rest of the dashboard.
 */
const MiniCctCard: React.FC = () => {
  const [payload, setPayload] = useState<MiniCctLatestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      setPayload(await miniCctApi.latest());
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load the Mini CCT.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6 mb-8 h-28 animate-pulse flex items-center justify-center">
        <Loader2 size={20} className="text-[#18B6A4] animate-spin" />
      </div>
    );
  }

  // A load failure shows a compact inline banner — the rest of the dashboard
  // must stay usable.
  if (error) {
    return (
      <div className="dark-banner-error flex items-center gap-3 text-sm mb-8">
        <AlertTriangle size={16} className="shrink-0" />
        <span className="flex-1">{error}
          {unavailable && <span className="block text-xs mt-0.5 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</span>}
        </span>
        <button onClick={() => load()} className="btn btn-outline text-xs px-3 py-1.5 shrink-0">
          <RefreshCw size={13} className="mr-1.5" /> Retry
        </button>
      </div>
    );
  }

  const quiz = payload?.quiz;
  if (!quiz) return null; // No Mini CCT available to this student — hide the card.

  const status = quiz.attemptStatus;
  const completed = status.hasAttempted && status.status !== 'in_progress';
  const resumable = status.hasAttempted && status.status === 'in_progress';
  const notOpenYet = quiz.scheduledDate && new Date(quiz.scheduledDate) > new Date();
  const expired = quiz.expiryDate && new Date(quiz.expiryDate) < new Date();

  return (
    <div className="bg-[#18222E] border border-[#18B6A4]/25 rounded-2xl p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2 text-lg">
            <Zap size={18} className="text-[#4DD7C8]" /> Mini CCT
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8] border border-[#18B6A4]/25">
              Mini Grand Test
            </span>
          </h3>
          <p className="text-sm text-[#94A3B8] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-[#CBD5E1]">{quiz.title}</span>
            <span className="inline-flex items-center gap-1"><Clock size={12} /> {quiz.duration} min</span>
            <span>{quiz.questionCount} questions · {quiz.totalMarks} marks</span>
            <span>{quiz.subjectNames.join(' · ')}</span>
          </p>
          {completed && (
            <p className="text-sm text-[#94A3B8] mt-1">
              Completed · <span className="text-[#4DD7C8] font-medium">{status.marksObtained ?? '—'}/{status.totalMarks ?? quiz.totalMarks}</span> marks
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link to="/mini-cct/history" className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] hidden sm:inline-flex items-center gap-1.5">
            <History size={14} /> History
          </Link>
          {completed ? (
            status.attemptId ? (
              <Link to={`/tests/${quiz._id}/results/${status.attemptId}`} className="btn btn-primary text-sm px-4 py-2">
                View Analysis
              </Link>
            ) : null
          ) : resumable ? (
            <Link to={`/tests/${quiz._id}?resume=1`} className="btn btn-primary text-sm px-4 py-2">
              <PlayCircle size={15} className="mr-2" /> Resume
            </Link>
          ) : expired ? (
            <span className="text-sm text-rose-300 border border-rose-400/30 bg-rose-400/10 rounded-lg px-3 py-2">Expired</span>
          ) : notOpenYet ? (
            <span className="text-sm text-[#94A3B8] border border-white/10 bg-white/[0.04] rounded-lg px-3 py-2">
              Opens {quiz.scheduledDate ? new Date(quiz.scheduledDate).toLocaleDateString() : 'soon'}
            </span>
          ) : (
            <Link to={`/tests/${quiz._id}?start=1`} className="btn btn-primary text-sm px-4 py-2">
              <PlayCircle size={15} className="mr-2" /> Start Mini CCT
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default MiniCctCard;
