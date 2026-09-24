import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flame, History } from 'lucide-react';
import { appErrorMessage, dailyPyqApi, isAppUnavailable } from '../lib/appClient';
import type { DailyPyqAttempt } from '../types/app';
import DailyPyqReview, { formatDuration } from '../components/app/DailyPyqReview';

const PAGE_SIZE = 10;

const dateLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Daily PYQ history — the signed-in student's own past attempts (the API
 * enforces ownership server-side). Rows expand into the full graded review.
 */
const DailyPyqHistory: React.FC = () => {
  const [attempts, setAttempts] = useState<DailyPyqAttempt[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DailyPyqAttempt | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      const data = await dailyPyqApi.history({ page: targetPage, limit: PAGE_SIZE });
      setAttempts(data.attempts);
      setPage(data.page);
      setPages(data.pages);
      setTotal(data.total);
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load Daily PYQ history.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  const openDetail = async (attempt: DailyPyqAttempt) => {
    if (expandedId === attempt._id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(attempt._id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await dailyPyqApi.attempt(attempt._id);
      setDetail(data.attempt);
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load this attempt.'));
      setExpandedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <Link to="/dashboard" className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1">
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <Link to="/daily-pyq" className="text-sm text-[#18B6A4] hover:text-[#1CC8B5]">Today's Daily PYQ →</Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <History className="w-7 h-7 text-[#18B6A4]" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">Daily PYQ history</h1>
            <p className="text-sm text-[#94A3B8]">{total > 0 ? `${total} completed ${total === 1 ? 'day' : 'days'}` : 'Your completed daily challenges appear here.'}</p>
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-[#18222E] rounded-xl animate-pulse" />)}
          </div>
        )}

        {!loading && error && (
          <div className="dark-banner-error text-sm">
            <p>{error}</p>
            {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
            <button onClick={() => load(page)} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
          </div>
        )}

        {!loading && !error && attempts.length === 0 && (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-10 text-center">
            <Flame className="w-9 h-9 text-[#18B6A4] mx-auto mb-3" />
            <p className="text-[#CBD5E1] text-sm">No Daily PYQ attempts yet.</p>
            <p className="text-xs text-[#94A3B8] mt-1">Complete today's challenge to start a streak.</p>
            <Link to="/daily-pyq" className="btn btn-primary text-sm mt-5">Start today's Daily PYQ</Link>
          </div>
        )}

        {!loading && !error && attempts.length > 0 && (
          <div className="space-y-3">
            {attempts.map((attempt) => {
              const pct = attempt.maxScore > 0 ? Math.max(0, Math.round((attempt.score / attempt.maxScore) * 100)) : 0;
              const isOpen = expandedId === attempt._id;
              return (
                <div key={attempt._id} className="bg-[#18222E] border border-white/[0.06] rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => openDetail(attempt)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:border-[#18B6A4]/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#F8FAFC]">{dateLabel(attempt.date)}</div>
                      <div className="text-xs text-[#94A3B8] mt-0.5">
                        {formatDuration(attempt.timeTakenSeconds)} · {attempt.incorrectCount} wrong · {attempt.skippedCount} skipped
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#4DD7C8]">{attempt.correctCount}/{attempt.totalQuestions}</div>
                        <div className="text-xs text-[#94A3B8]">{attempt.score}/{attempt.maxScore} · {pct}%</div>
                      </div>
                      <ChevronRight size={16} className={`text-[#94A3B8] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 border-t border-white/[0.06] pt-4">
                      {detailLoading && <div className="h-24 bg-[#151E29] rounded-xl animate-pulse" />}
                      {!detailLoading && detail && <DailyPyqReview attempt={detail} />}
                    </div>
                  )}
                </div>
              );
            })}

            {pages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="btn btn-outline text-sm px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} className="mr-1" /> Previous
                </button>
                <span className="text-xs text-[#94A3B8]">Page {page} of {pages}</span>
                <button
                  type="button"
                  onClick={() => load(page + 1)}
                  disabled={page >= pages}
                  className="btn btn-outline text-sm px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={14} className="ml-1" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default DailyPyqHistory;
