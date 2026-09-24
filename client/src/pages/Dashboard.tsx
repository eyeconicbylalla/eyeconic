import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Activity, BookOpen, CheckCircle2, Flame, LogOut, RefreshCw, Target, TrendingUp, Trophy } from 'lucide-react';
import { appErrorMessage, appQuizApi, dailyPyqApi, isAppUnavailable } from '../lib/appClient';
import { useAppAuth } from '../context/AppAuthContext';
import type { AnalyticsMe, DailyPyqTodayPayload } from '../types/app';
import OpenInAppButton from '../components/app/OpenInAppButton';

const dateLabel = (value?: string) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';

/**
 * Integrated student dashboard: identity, tests and results come from the
 * Eyeconic App backend (same data as the mobile app), served through the
 * website's authenticated proxy.
 */
const Dashboard: React.FC = () => {
  const { user, logout } = useAppAuth();
  const [analytics, setAnalytics] = useState<AnalyticsMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  // Daily PYQ loads independently — its failure must never hide the rest of
  // the dashboard.
  const [daily, setDaily] = useState<DailyPyqTodayPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    const dailyLoad = dailyPyqApi.today().then(setDaily).catch(() => setDaily(null));
    try {
      setAnalytics(await appQuizApi.analyticsMe({ limit: 10 }));
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load your performance data.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      await dailyLoad;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const attempts = useMemo(() => analytics?.attempts ?? [], [analytics]);

  const summaryCards = useMemo(() => {
    const total = attempts.length;
    const avgPercent = total
      ? Math.round(attempts.reduce((acc, a) => acc + (a.scorePercentage ?? 0), 0) / total)
      : null;
    const best = total ? Math.max(...attempts.map((a) => a.scorePercentage ?? 0)) : null;
    return [
      { icon: <BookOpen size={16} />, label: 'Recent tests', value: total > 0 ? String(total) : '—' },
      { icon: <TrendingUp size={16} />, label: 'Average score', value: avgPercent !== null ? `${avgPercent}%` : '—' },
      { icon: <Trophy size={16} />, label: 'Best recent', value: best !== null ? `${best}%` : '—' },
    ];
  }, [attempts]);

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">Hi, {user?.name?.split(' ')[0] || 'there'} 👋</h2>
            <p className="text-[#94A3B8] text-sm mt-1">
              Signed in with your Eyeconic Mentorship account · same data as your mobile app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/predictor" className="btn btn-primary text-sm px-4 py-2">
              <Target size={14} className="mr-2" /> Rank Predictor
            </Link>
            <OpenInAppButton destination={{ screen: 'dashboard' }} />
            <button onClick={load} className="btn btn-outline text-sm px-4 py-2" aria-label="Refresh">
              <RefreshCw size={14} className="mr-2" /> Refresh
            </button>
            <button onClick={logout} className="btn btn-outline text-sm px-4 py-2">
              <LogOut size={14} className="mr-2" /> Logout
            </button>
          </div>
        </div>

        {daily && (
          <div className="bg-[#18222E] border border-[#18B6A4]/25 rounded-2xl p-5 sm:p-6 mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2 text-lg">
                Daily PYQ
                {daily.streak.current > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-full px-2.5 py-1">
                    <Flame size={12} /> {daily.streak.current}-day streak
                  </span>
                )}
              </h3>
              {daily.status === 'completed' && daily.attempt ? (
                <p className="text-sm text-[#94A3B8] mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  Completed today · <span className="text-[#4DD7C8] font-medium">{daily.attempt.correctCount}/{daily.attempt.totalQuestions}</span> correct
                  · {daily.attempt.score}/{daily.attempt.maxScore} marks
                </p>
              ) : (
                <p className="text-sm text-[#94A3B8] mt-1.5">{daily.totalQuestions} Questions · Today's Challenge</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link to="/daily-pyq/history" className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] hidden sm:block">History</Link>
              <Link
                to="/daily-pyq"
                className={daily.status === 'completed' ? 'btn btn-outline text-sm px-4 py-2' : 'btn btn-primary text-sm px-4 py-2'}
              >
                {daily.status === 'completed' ? 'Review' : 'Start Daily PYQ'}
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {summaryCards.map((card) => (
            <div key={card.label} className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 text-[#94A3B8] text-xs uppercase tracking-wide mb-2">
                {card.icon} {card.label}
              </div>
              <div className="text-2xl font-bold text-[#F8FAFC]">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#4DD7C8] flex items-center gap-2"><Activity size={16} /> Recent results</h3>
              <Link to="/tests" className="text-sm text-[#18B6A4] hover:text-[#1CC8B5]">View all tests →</Link>
            </div>

            {loading && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-[#151E29] rounded-xl animate-pulse" />)}
              </div>
            )}

            {!loading && error && (
              <div className="dark-banner-error text-sm">
                <p>{error}</p>
                {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
                <button onClick={load} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
              </div>
            )}

            {!loading && !error && attempts.length === 0 && (
              <div className="text-center py-10">
                <BookOpen className="w-9 h-9 text-[#18B6A4] mx-auto mb-3" />
                <p className="text-[#CBD5E1] text-sm">No test results yet.</p>
                <Link to="/tests" className="btn btn-primary text-sm mt-4">Browse My Tests</Link>
              </div>
            )}

            {!loading && !error && attempts.length > 0 && (
              <div className="space-y-2">
                {attempts.map((attempt) => {
                  const quizTitle = typeof attempt.quiz === 'object' && attempt.quiz ? attempt.quiz.title : 'Test';
                  const quizId = typeof attempt.quiz === 'object' && attempt.quiz ? attempt.quiz._id : '';
                  const percent = attempt.scorePercentage ?? 0;
                  return (
                    <Link
                      key={attempt._id}
                      to={quizId ? `/tests/${quizId}/results/${attempt._id}` : '/tests'}
                      className="flex items-center justify-between gap-4 bg-[#151E29] border border-white/[0.06] rounded-xl px-4 py-3 hover:border-[#18B6A4]/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F8FAFC] truncate">{quizTitle}</div>
                        <div className="text-xs text-[#94A3B8]">{dateLabel(attempt.endTime)}</div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-bold text-[#4DD7C8]">{attempt.marksObtained}/{attempt.totalMarks}</div>
                          <div className="text-xs text-[#94A3B8]">{percent}%</div>
                        </div>
                        <div className="w-20 h-1.5 rounded-full bg-[#0A0F14] overflow-hidden hidden sm:block">
                          <div className="h-full bg-[#18B6A4]" style={{ width: `${Math.min(100, percent)}%` }} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
              <h3 className="font-semibold text-[#4DD7C8] mb-4">Quick links</h3>
              <div className="space-y-2.5">
                <Link to="/tests" className="block bg-[#151E29] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-[#CBD5E1] hover:border-[#18B6A4]/30 hover:text-[#F8FAFC] transition-colors">
                  📝 My Tests — take or resume tests on the web
                </Link>
                <Link to="/blogs" className="block bg-[#151E29] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-[#CBD5E1] hover:border-[#18B6A4]/30 hover:text-[#F8FAFC] transition-colors">
                  📚 Eyeconic Blogs — NEET PG guides & insights
                </Link>
                <a
                  href="https://wa.me/919116303037?text=Hey!%20I%20have%20a%20question%20about%20my%20Eyeconic%20account."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-[#151E29] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-[#CBD5E1] hover:border-[#18B6A4]/30 hover:text-[#F8FAFC] transition-colors"
                >
                  💬 Talk to your mentor
                </a>
              </div>
            </div>

            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-sm text-[#94A3B8]">
              <h3 className="font-semibold text-[#4DD7C8] mb-2 flex items-center gap-2">
                <AlertTriangle size={14} /> Good to know
              </h3>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Proctored tests open in the mobile app only.</li>
                <li>Answers save automatically — refresh-safe.</li>
                <li>Starting on the web? Resume any time on the app, and vice versa.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
