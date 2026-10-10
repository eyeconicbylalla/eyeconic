import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, Flame, LogOut, RefreshCw, Target, TrendingUp, Trophy } from 'lucide-react';
import { appErrorMessage, appQuizApi, dailyPyqApi, isAppUnavailable } from '../lib/appClient';
import {
  decideTransitionStart,
  getConnectionHint,
  isPlainActivation,
  prefersReducedMotion,
  shouldPrefetchIntro,
  warmIntroVideo,
} from '../lib/rankPredictorIntro';
import { useAppAuth } from '../context/AppAuthContext';
import type { AnalyticsMe, ComparisonPayload, DailyPyqTodayPayload } from '../types/app';
import CohortComparisonCard from '../components/app/CohortComparisonCard';
import MiniGtCard from '../components/app/MiniGtCard';
import OpenInAppButton from '../components/app/OpenInAppButton';
import PlatformChoiceCard from '../components/app/PlatformChoiceCard';
import RankPredictorIntro from '../components/app/RankPredictorIntro';
import ReadinessCard from '../components/app/ReadinessCard';
import rankPredictorIntroMp4 from '../assets/rank-predictor-intro.mp4';

/**
 * Integrated student dashboard: identity, tests and results come from the
 * Eyeconic App backend (same data as the mobile app), served through the
 * website's authenticated proxy.
 *
 * The primary card is the anonymous "Individual Rank vs. Average Score of
 * All" comparison (own latest finalized test vs the same test's cohort).
 * The former "Recent results" list was replaced by it — per-attempt history
 * still lives on /tests and the results pages.
 */
const Dashboard: React.FC = () => {
  const { user, logout } = useAppAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  // Daily PYQ and the cohort comparison load independently — their failure
  // must never hide the rest of the dashboard.
  const [daily, setDaily] = useState<DailyPyqTodayPayload | null>(null);
  const [comparison, setComparison] = useState<ComparisonPayload | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [comparisonError, setComparisonError] = useState('');
  const [comparisonUnavailable, setComparisonUnavailable] = useState(false);

  // Rank Predictor entry flourish: state lives here (not in the overlay) so a
  // duplicate click while it plays is swallowed and navigation on completion
  // unmounts everything in one step. Re-entering the dashboard resets it, so
  // the animation plays on every visit.
  const [introActive, setIntroActive] = useState(false);
  const goPredictor = useCallback(() => navigate('/predictor'), [navigate]);
  const reduceMotionQuery = useMemo(
    () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null),
    [],
  );
  const introPrefetchAllowed = useCallback(
    () =>
      shouldPrefetchIntro({
        reducedMotion: prefersReducedMotion(reduceMotionQuery),
        connection: getConnectionHint(),
      }),
    [reduceMotionQuery],
  );

  // Hover/focus on the CTA is a strong intent signal — warm immediately.
  const warmIntroIfAllowed = useCallback(() => {
    if (introPrefetchAllowed()) warmIntroVideo(rankPredictorIntroMp4);
  }, [introPrefetchAllowed]);

  const handleRankPredictorClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Modified/middle clicks keep the browser's native open-in-new-tab etc.
    if (!isPlainActivation(event)) return;
    event.preventDefault();
    const decision = decideTransitionStart({
      active: introActive,
      reducedMotion: prefersReducedMotion(reduceMotionQuery),
    });
    if (decision === 'start') {
      setIntroActive(true);
    } else if (decision === 'navigate-now') {
      goPredictor();
    }
    // 'ignore' — a transition is already playing; swallow the repeat click.
  };

  // Warm the intro clip once the dashboard settles so the transition can
  // start without a visible stall. Deferred to idle and skipped entirely on
  // metered/2g connections and for reduced-motion students (they skip the
  // animation); hovering/focusing the button warms it immediately.
  useEffect(() => {
    if (!introPrefetchAllowed()) return;
    let cancelled = false;
    const warm = () => {
      if (!cancelled) warmIntroVideo(rankPredictorIntroMp4);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(warm, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [introPrefetchAllowed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    setComparisonLoading(true);
    setComparisonError('');
    setComparisonUnavailable(false);
    const dailyLoad = dailyPyqApi.today().then(setDaily).catch(() => setDaily(null));
    const comparisonLoad = appQuizApi.analyticsMeComparison()
      .then(setComparison)
      .catch((err) => {
        setComparison(null);
        setComparisonError(appErrorMessage(err, 'Could not load your comparison.'));
        setComparisonUnavailable(isAppUnavailable(err));
      })
      .finally(() => setComparisonLoading(false));
    try {
      setAnalytics(await appQuizApi.analyticsMe({ limit: 10 }));
    } catch (err) {
      setError(appErrorMessage(err, 'Could not load your performance data.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      await Promise.all([dailyLoad, comparisonLoad]);
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
            <Link
              to="/predictor"
              className="btn btn-primary text-sm px-4 py-2"
              onClick={handleRankPredictorClick}
              onMouseEnter={warmIntroIfAllowed}
              onFocus={warmIntroIfAllowed}
            >
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

        <MiniGtCard />

        <PlatformChoiceCard />

        <ReadinessCard />

        {!loading && error && (
          <div className="dark-banner-error text-sm mb-6">
            <p>{error}</p>
            {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
            <button onClick={load} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
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
          <div className="lg:col-span-2">
            <CohortComparisonCard
              payload={comparison}
              loading={comparisonLoading}
              error={comparisonError}
              unavailable={comparisonUnavailable}
              onRetry={load}
            />
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
                <Link to="/platform-choice" className="block bg-[#151E29] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-[#CBD5E1] hover:border-[#18B6A4]/30 hover:text-[#F8FAFC] transition-colors">
                  🧭 Platform Finder — which prep platform fits you
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

      {/* Rank Predictor entry flourish — fixed overlay, above the navbar. */}
      {introActive && <RankPredictorIntro videoUrl={rankPredictorIntroMp4} onComplete={goPredictor} />}
    </section>
  );
};

export default Dashboard;
