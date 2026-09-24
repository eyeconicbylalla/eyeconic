import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Clock, FileText, RefreshCw,
} from 'lucide-react';
import { appErrorMessage, isAppUnavailable, miniCctApi } from '../lib/appClient';
import type { MiniCctHistoryPayload } from '../types/app';

/**
 * Mini CCT attempt history — every finalized Mini CCT attempt with a jump into
 * its (recomputable) analysis dashboard. Data comes from the App API through
 * the website's authenticated proxy; a student only ever sees their own rows.
 */
const MiniCctHistory: React.FC = () => {
  const [payload, setPayload] = useState<MiniCctHistoryPayload | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      setPayload(await miniCctApi.history({ page: targetPage, limit: 10 }));
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load your Mini CCT history.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const attempts = payload?.attempts ?? [];
  const pages = payload?.pages ?? 1;

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#4DD7C8] mb-6">
          <ArrowLeft size={15} /> Dashboard
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">Mini CCT History</h2>
            <p className="text-[#94A3B8] text-sm mt-1">Every Mini CCT you have taken, with its full analysis.</p>
          </div>
          <button onClick={() => load(page)} className="btn btn-outline text-sm px-4 py-2" aria-label="Refresh">
            <RefreshCw size={14} className="mr-2" /> Refresh
          </button>
        </div>

        {loading && !payload && (
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
            <button onClick={() => load(page)} className="btn btn-outline text-sm px-4 py-2 shrink-0">Try Again</button>
          </div>
        )}

        {!loading && !error && attempts.length === 0 && (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-10 text-center">
            <FileText className="w-10 h-10 text-[#18B6A4] mx-auto mb-3" />
            <p className="text-[#CBD5E1] font-medium">No Mini CCT attempts yet</p>
            <p className="text-[#94A3B8] text-sm mt-1">Your completed Mini CCTs will appear here with their analysis.</p>
            <Link to="/dashboard" className="btn btn-primary text-sm mt-4">Back to Dashboard</Link>
          </div>
        )}

        <div className="space-y-3">
          {attempts.map((attempt) => {
            const pct = attempt.totalMarks > 0 ? Math.round((attempt.marksObtained / attempt.totalMarks) * 100) : null;
            return (
              <Link
                key={attempt._id}
                to={`/tests/${attempt.quizId}/results/${attempt._id}`}
                className="block bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 hover:border-[#18B6A4]/30 hover:shadow-card-dark transition-all group"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8]">
                        Mini CCT
                      </span>
                      {attempt.status === 'auto_submitted' && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20">
                          auto-submitted
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-[#F8FAFC] group-hover:text-[#4DD7C8] transition-colors truncate">
                      {attempt.quizTitle}
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-1 flex items-center gap-1.5">
                      <Clock size={12} />
                      {attempt.endTime ? new Date(attempt.endTime).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-[#4DD7C8]">
                      {attempt.marksObtained}
                      <span className="text-sm text-[#94A3B8]"> / {attempt.totalMarks}</span>
                    </div>
                    <div className="text-xs text-[#94A3B8]">
                      {attempt.score}/{attempt.totalQuestions} correct{pct !== null ? ` · ${pct}%` : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium text-[#4DD7C8] inline-flex items-center gap-1.5">
                  <BarChart3 size={13} /> View full analysis
                </div>
              </Link>
            );
          })}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-outline text-sm px-3 py-2 disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm text-[#94A3B8]">Page {page} of {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="btn btn-outline text-sm px-3 py-2 disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default MiniCctHistory;
