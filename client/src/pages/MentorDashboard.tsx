import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import {
  BookOpen, CalendarDays, ChevronLeft, ChevronRight, Download, FileSpreadsheet,
  Flame, Loader2, RefreshCw, Search, TrendingUp, Users,
} from 'lucide-react';
import {
  isMentorUnavailable, mentorDashboardApi, mentorErrorMessage, type MentorUsersQuery,
} from '../lib/mentorDashboardClient';
import type { MentorOverview, MentorPerformance, MentorUsersPage } from '../types/mentorDashboard';
import UserDrilldown from '../components/mentor/UserDrilldown';

/**
 * Free Login User Dashboard — mentor/admin view (Feature 08).
 *
 * Rendered as the "Free Users" tab of the Admin Portal (RequireMentor wraps
 * it there); the standalone route is retired.
 *
 * Overview, population analytics and the user table come from the website's
 * /api/mentor-dashboard surface, which merges the App backend (free users,
 * Mini CCT, Daily PYQ, platform choice) with the website's own predictor
 * collections. Every metric's definition is documented on the server routes.
 */

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const CHART_GRID = 'rgba(148, 163, 184, 0.12)';
const CHART_TEXT = '#94A3B8';
const SERIES_COLORS = ['#18B6A4', '#4DD7C8', '#F59E0B', '#8B5CF6', '#38BDF8', '#FB7185', '#A3E635', '#F97316'];

const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: CHART_TEXT } } },
  scales: {
    x: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID } },
    y: { ticks: { color: CHART_TEXT, precision: 0 }, grid: { color: CHART_GRID }, beginAtZero: true },
  },
};

const fmtDay = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { dateStyle: 'medium' });
};

const daysSince = (value: string | null | undefined) => {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
};

function Card({ label, value, icon, hint }: { label: string; value: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[#94A3B8] text-[11px] uppercase tracking-wide mb-2">
        {icon} {label}
      </div>
      <div className="text-xl sm:text-2xl font-bold text-[#F8FAFC]">{value}</div>
      {hint && <div className="text-[11px] text-[#94A3B8] mt-1">{hint}</div>}
    </div>
  );
}

function Section({ title, subtitle, children, right }: {
  title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC]">{title}</h3>
          {subtitle && <p className="text-xs text-[#94A3B8] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const ErrorBanner = ({ message, unavailable, onRetry }: {
  message: string; unavailable: boolean; onRetry: () => void;
}) => (
  <div className="dark-banner-error text-sm mb-6">
    <p>{message}</p>
    {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
    <button onClick={onRetry} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
  </div>
);

const MentorDashboard: React.FC = () => {
  const [overview, setOverview] = useState<MentorOverview | null>(null);
  const [performance, setPerformance] = useState<MentorPerformance | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');
  const [overviewUnavailable, setOverviewUnavailable] = useState(false);

  const [page, setPage] = useState<MentorUsersPage | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');

  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounced(searchText, 400);
  const [examFilter, setExamFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name'>('newest');

  const [dropOffDays, setDropOffDays] = useState(7);
  const [drilldownId, setDrilldownId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportQueryRef = useRef<MentorUsersQuery>({});

  const usersQuery = useMemo<MentorUsersQuery>(() => {
    const query: MentorUsersQuery = { page: pageNum, limit: 20, sort };
    if (debouncedSearch.trim()) query.q = debouncedSearch.trim();
    if (fromDate) query.from = fromDate;
    if (toDate) query.to = toDate;
    if (examFilter) query.exam = examFilter as MentorUsersQuery['exam'];
    return query;
  }, [debouncedSearch, examFilter, fromDate, toDate, pageNum, sort]);

  exportQueryRef.current = { ...usersQuery, page: undefined, limit: undefined };

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');
    setOverviewUnavailable(false);
    try {
      const [o, p] = await Promise.all([
        mentorDashboardApi.overview(),
        mentorDashboardApi.performance(dropOffDays),
      ]);
      setOverview(o);
      setPerformance(p);
    } catch (err) {
      setOverviewError(mentorErrorMessage(err, 'Could not load dashboard analytics.'));
      setOverviewUnavailable(isMentorUnavailable(err));
    } finally {
      setOverviewLoading(false);
    }
  }, [dropOffDays]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    setUsersError('');
    mentorDashboardApi.users(usersQuery)
      .then((data) => { if (!cancelled) setPage(data); })
      .catch((err) => { if (!cancelled) setUsersError(mentorErrorMessage(err, 'Could not load users.')); })
      .finally(() => { if (!cancelled) setUsersLoading(false); });
    return () => { cancelled = true; };
  }, [usersQuery]);

  const resetFilters = () => {
    setSearchText('');
    setExamFilter('');
    setFromDate('');
    setToDate('');
    setPageNum(1);
    setSort('newest');
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await mentorDashboardApi.exportCsv(exportQueryRef.current);
    } catch (err) {
      setUsersError(mentorErrorMessage(err, 'Export failed.'));
    } finally {
      setExporting(false);
    }
  };

  const handleExportXlsx = async () => {
    setExporting(true);
    try {
      const { rows } = await mentorDashboardApi.exportRows(exportQueryRef.current);
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Free Users');
      XLSX.writeFile(workbook, 'eyeconic-free-users.xlsx');
    } catch (err) {
      setUsersError(mentorErrorMessage(err, 'Export failed.'));
    } finally {
      setExporting(false);
    }
  };

  const kpi = overview ? [
    { icon: <Users size={15} />, label: 'Free users', value: String(overview.totals.freeUsers), hint: 'cumulative registrations' },
    { icon: <CalendarDays size={15} />, label: 'This month', value: String(overview.totals.freeUsersThisMonth), hint: 'IST calendar month' },
    { icon: <TrendingUp size={15} />, label: 'DAU', value: String(overview.active.dau), hint: 'active today (IST)' },
    { icon: <TrendingUp size={15} />, label: 'WAU', value: String(overview.active.wau), hint: 'active last 7 days' },
    { icon: <TrendingUp size={15} />, label: 'MAU', value: String(overview.active.mau), hint: 'active last 30 days' },
    { icon: <BookOpen size={15} />, label: 'Mini CCTs attempted', value: String(overview.miniCct.attemptsTotal), hint: `${overview.miniCct.attemptingUsers} users` },
    { icon: <CalendarDays size={15} />, label: 'Daily PYQs attempted', value: String(overview.dailyPyq.attemptsTotal), hint: `${overview.dailyPyq.attemptsToday} today` },
    { icon: <Flame size={15} />, label: 'Predictor users', value: String(overview.rankPredictor.usingUsers), hint: `${overview.rankPredictor.predictionsTotal} predictions` },
  ] : [];

  const platformData = overview && overview.platformChoice.length > 0 ? {
    labels: overview.platformChoice.map((p) => p.platform),
    datasets: [{
      label: 'Users',
      data: overview.platformChoice.map((p) => p.count),
      backgroundColor: SERIES_COLORS,
      borderRadius: 6,
      maxBarThickness: 36,
    }],
  } : null;

  const examData = overview && overview.rankPredictor.examDistribution.length > 0 ? {
    labels: overview.rankPredictor.examDistribution.map((e) => e.exam),
    datasets: [{
      data: overview.rankPredictor.examDistribution.map((e) => e.count),
      backgroundColor: overview.rankPredictor.examDistribution.map(
        (_, i) => SERIES_COLORS[i % SERIES_COLORS.length]
      ),
      borderColor: '#0F1720',
      borderWidth: 2,
    }],
  } : null;

  const branchData = performance && performance.desiredBranchTop.length > 0 ? {
    labels: performance.desiredBranchTop.map((b) => b.branch),
    datasets: [{
      label: 'Users',
      data: performance.desiredBranchTop.map((b) => b.count),
      backgroundColor: '#18B6A4',
      borderRadius: 6,
      maxBarThickness: 26,
    }],
  } : null;

  const heatmapMax = useMemo(() => {
    if (!performance) return 0;
    return Math.max(0, ...performance.featureUsage.rows.flatMap((r) => r.counts));
  }, [performance]);

  const heat = (count: number) => {
    if (count <= 0) return 'bg-white/[0.03] text-[#64748B]';
    const ratio = heatmapMax > 0 ? count / heatmapMax : 0;
    if (ratio > 0.66) return 'bg-[#18B6A4]/80 text-[#0A0F14] font-semibold';
    if (ratio > 0.33) return 'bg-[#18B6A4]/50 text-[#F8FAFC]';
    return 'bg-[#18B6A4]/25 text-[#F8FAFC]';
  };

  return (
    <div>
      {/* Header — compact: the Admin Portal tab provides the page chrome */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#4DD7C8] mb-1">Mentor view · Feature 08</p>
          <h3 className="text-xl md:text-2xl font-bold text-[#F8FAFC]">Free Login User Dashboard</h3>
          <p className="text-[#94A3B8] text-sm mt-1">
            Monitoring free registered Eyeconic users — tests, Daily PYQ, predictor and engagement.
          </p>
        </div>
        <button onClick={loadOverview} className="btn btn-outline text-sm px-4 py-2" aria-label="Refresh analytics">
          <RefreshCw size={14} className="mr-2" /> Refresh
        </button>
      </div>

        {overviewLoading && (
          <div className="py-14 flex items-center justify-center" role="status">
            <Loader2 className="w-7 h-7 text-[#18B6A4] animate-spin" />
          </div>
        )}
        {!overviewLoading && overviewError && (
          <ErrorBanner message={overviewError} unavailable={overviewUnavailable} onRetry={loadOverview} />
        )}

        {!overviewLoading && overview && (
          <>
            {/* A. Summary KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
              {kpi.map((item) => (
                <Card key={item.label} label={item.label} value={item.value} icon={item.icon} hint={item.hint} />
              ))}
            </div>

            {/* Platform choice + Exam distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="font-semibold text-[#F8FAFC] mb-1">Platform Choice</h3>
                <p className="text-xs text-[#94A3B8] mb-4">
                  Platforms free users report using (onboarding question). The recommender does not exist yet —
                  these are the selections students entered themselves.
                </p>
                {platformData ? (
                  <div className="h-56"><Bar data={platformData} options={chartBaseOptions} /></div>
                ) : (
                  <p className="text-sm text-[#94A3B8] py-8 text-center">No platform selections recorded yet.</p>
                )}
              </div>
              <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="font-semibold text-[#F8FAFC] mb-1">Exam distribution</h3>
                <p className="text-xs text-[#94A3B8] mb-4">
                  Derived from each user's most recent predictor usage. FMGE and UPSC CMS are not yet
                  selectable anywhere in Eyeconic, so they cannot appear in this data.
                </p>
                {examData ? (
                  <div className="h-56 flex items-center justify-center">
                    <Doughnut
                      data={examData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '58%',
                        plugins: { legend: { position: 'right', labels: { color: CHART_TEXT } } },
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-[#94A3B8] py-8 text-center">No free users yet.</p>
                )}
              </div>
            </div>

            {/* C. Performance + D. Desired branches */}
            {performance && (
              <>
                <Section
                  title="Free-user performance"
                  subtitle="Mini CCT scores and Daily PYQ completion across the free-user population only."
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <Card
                          label="Avg Mini CCT score"
                          value={performance.miniCct.avgScorePercentage !== null ? `${performance.miniCct.avgScorePercentage}%` : '—'}
                          icon={<BookOpen size={15} />}
                        />
                        <Card
                          label="Daily PYQ completion"
                          value={performance.dailyPyq.completionRate !== null ? `${performance.dailyPyq.completionRate}%` : '—'}
                          icon={<CalendarDays size={15} />}
                          hint={`${performance.dailyPyq.usersWithAttempt} users ever attempted`}
                        />
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="text-left text-[#94A3B8] border-b border-white/[0.06]">
                              <th className="py-2 pr-4 font-medium">Subject</th>
                              <th className="py-2 pr-4 font-medium">Attempts</th>
                              <th className="py-2 font-medium">Avg score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {performance.miniCct.subjectWise.length > 0 ? performance.miniCct.subjectWise.map((row) => (
                              <tr key={row.subjectName} className="border-b border-white/[0.03] last:border-0">
                                <td className="py-2 pr-4 text-[#CBD5E1]">{row.subjectName}</td>
                                <td className="py-2 pr-4 text-[#CBD5E1]">{row.attempts}</td>
                                <td className="py-2 text-[#CBD5E1]">
                                  {row.avgScorePercentage !== null ? `${row.avgScorePercentage}%` : '—'}
                                </td>
                              </tr>
                            )) : (
                              <tr><td colSpan={3} className="py-4 text-[#94A3B8]">No Mini CCT attempts yet.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="lg:col-span-2 bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
                      <h4 className="font-semibold text-[#F8FAFC] mb-1">Top desired branches</h4>
                      <p className="text-xs text-[#94A3B8] mb-4">
                        From Desired Branch Predictor queries. Rank Predictor used{' '}
                        {performance.rankPredictor.predictionsTotal} times ·{' '}
                        {performance.rankPredictor.desiredBranchQueriesTotal} desired-branch queries.
                      </p>
                      {branchData ? (
                        <div className="h-72"><Bar data={branchData} options={chartBaseOptions} /></div>
                      ) : (
                        <p className="text-sm text-[#94A3B8] py-10 text-center">No desired-branch queries yet.</p>
                      )}
                    </div>
                  </div>
                </Section>

                {/* E. Engagement metrics */}
                <Section
                  title="Engagement"
                  subtitle="Daily PYQ streak leaderboard, drop-off analysis and weekly feature usage."
                  right={(
                    <label className="flex items-center gap-2 text-xs text-[#94A3B8]">
                      Drop-off after
                      <select
                        value={dropOffDays}
                        onChange={(e) => setDropOffDays(Number(e.target.value))}
                        className="bg-[#151E29] border border-white/10 rounded-lg px-2 py-1.5 text-[#CBD5E1]"
                        aria-label="Drop-off threshold in days"
                      >
                        {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
                      </select>
                      of inactivity
                    </label>
                  )}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Streak leaderboard */}
                    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
                      <h4 className="font-semibold text-[#4DD7C8] text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                        <Flame size={14} /> Daily PYQ streak leaderboard
                      </h4>
                      {performance.streakLeaderboard.length > 0 ? (
                        <ol className="space-y-1.5">
                          {performance.streakLeaderboard.map((row, i) => (
                            <li
                              key={row.userId}
                              className="flex items-center justify-between gap-3 bg-[#151E29] border border-white/[0.05] rounded-xl px-3 py-2 cursor-pointer hover:border-[#18B6A4]/30"
                              onClick={() => setDrilldownId(row.userId)}
                            >
                              <span className="text-sm text-[#CBD5E1] truncate">
                                <span className="text-[#94A3B8] mr-2">{i + 1}.</span>{row.name}
                              </span>
                              <span className="text-sm font-semibold text-orange-300 shrink-0">
                                {row.currentStreak}d <span className="text-[#64748B] font-normal">(best {row.bestStreak}d)</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-[#94A3B8] py-4">No Daily PYQ attempts yet.</p>
                      )}
                    </div>

                    {/* Drop-off analysis */}
                    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
                      <h4 className="font-semibold text-[#4DD7C8] text-sm uppercase tracking-wide mb-3">
                        Drop-off analysis
                      </h4>
                      <p className="text-xs text-[#94A3B8] mb-3">
                        {performance.dropoff.totalDropoffUsers} free users with no activity in the last{' '}
                        {performance.dropoff.thresholdDays} days (across tests, Daily PYQ and predictors).
                      </p>
                      {performance.dropoff.users.length > 0 ? (
                        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                          {performance.dropoff.users.map((row) => (
                            <button
                              key={row.userId}
                              onClick={() => setDrilldownId(row.userId)}
                              className="w-full flex items-center justify-between gap-3 bg-[#151E29] border border-white/[0.05] rounded-xl px-3 py-2 text-left hover:border-[#18B6A4]/30"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm text-[#CBD5E1] truncate">{row.name}</span>
                                <span className="block text-[11px] text-[#94A3B8] truncate">{row.email}</span>
                              </span>
                              <span className="text-xs text-[#94A3B8] shrink-0">
                                {row.neverActive ? 'Never active' : `${daysSince(row.lastActiveAt)}d ago`}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[#94A3B8] py-4">No dropped-off users — everyone was active recently.</p>
                      )}
                    </div>
                  </div>

                  {/* Feature usage heatmap */}
                  <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 mt-6">
                    <h4 className="font-semibold text-[#4DD7C8] text-sm uppercase tracking-wide mb-3">
                      Feature usage — last {performance.featureUsage.weekLabels.length} weeks
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="text-xs sm:text-sm border-separate border-spacing-1">
                        <thead>
                          <tr className="text-[#94A3B8]">
                            <th className="text-left pr-3 font-medium">Feature</th>
                            {performance.featureUsage.weekLabels.map((label, i, all) => (
                              <th key={label} className="font-medium px-1 whitespace-nowrap">
                                {label.slice(5)}{i === all.length - 1 ? ' →now' : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {performance.featureUsage.rows.map((row) => (
                            <tr key={row.feature}>
                              <td className="pr-3 text-[#CBD5E1] whitespace-nowrap">{row.feature}</td>
                              {row.counts.map((count, i) => (
                                <td
                                  key={i}
                                  className={`text-center rounded-lg px-2 py-1.5 min-w-[3rem] ${heat(count)}`}
                                  title={`${row.feature}: ${count} uses (week of ${performance.featureUsage.weekLabels[i]})`}
                                >
                                  {count}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] mt-3">
                      Weeks start on the labelled IST date. Counts are attempt/query totals per feature.
                    </p>
                  </div>
                </Section>
              </>
            )}
          </>
        )}

        {/* B. User table */}
        <Section
          title="Free users"
          subtitle="Server-side search, filters and pagination. Click a row for the full drilldown."
          right={(
            <div className="flex items-center gap-2">
              <button onClick={handleExportCsv} disabled={exporting} className="btn btn-outline text-xs px-3 py-1.5">
                <Download size={13} className="mr-1.5" /> CSV
              </button>
              <button onClick={handleExportXlsx} disabled={exporting} className="btn btn-outline text-xs px-3 py-1.5">
                <FileSpreadsheet size={13} className="mr-1.5" /> Excel
              </button>
            </div>
          )}
        >
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <div className="relative sm:col-span-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  value={searchText}
                  onChange={(e) => { setSearchText(e.target.value); setPageNum(1); }}
                  placeholder="Search by name or email…"
                  className="w-full bg-[#151E29] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#18B6A4]/50"
                  aria-label="Search users"
                />
              </div>
              <select
                value={examFilter}
                onChange={(e) => { setExamFilter(e.target.value); setPageNum(1); }}
                className="bg-[#151E29] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#CBD5E1] focus:outline-none focus:border-[#18B6A4]/50"
                aria-label="Filter by exam"
              >
                <option value="">All exams</option>
                <option value="NEET_PG">NEET PG</option>
                <option value="INI_CET">INI-CET</option>
                <option value="none">Not set</option>
              </select>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPageNum(1); }}
                className="bg-[#151E29] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#CBD5E1] focus:outline-none focus:border-[#18B6A4]/50"
                aria-label="Registered from"
              />
              <div className="flex gap-3">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setPageNum(1); }}
                  className="w-full bg-[#151E29] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#CBD5E1] focus:outline-none focus:border-[#18B6A4]/50"
                  aria-label="Registered to"
                />
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value as 'newest' | 'oldest' | 'name'); setPageNum(1); }}
                  className="bg-[#151E29] border border-white/10 rounded-xl px-2 py-2 text-sm text-[#CBD5E1] focus:outline-none focus:border-[#18B6A4]/50"
                  aria-label="Sort"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>

            {usersError && <ErrorBanner message={usersError} unavailable={false} onRetry={() => setPageNum((p) => p)} />}

            {usersLoading ? (
              <div className="py-10 flex items-center justify-center" role="status">
                <Loader2 className="w-6 h-6 text-[#18B6A4] animate-spin" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm min-w-[52rem]">
                    <thead>
                      <tr className="text-left text-[#94A3B8] border-b border-white/[0.06]">
                        <th className="py-2 pr-4 font-medium">User</th>
                        <th className="py-2 pr-4 font-medium">Registered</th>
                        <th className="py-2 pr-4 font-medium">Exam</th>
                        <th className="py-2 pr-4 font-medium">Mini CCT</th>
                        <th className="py-2 pr-4 font-medium">Daily PYQ</th>
                        <th className="py-2 pr-4 font-medium">Streak</th>
                        <th className="py-2 pr-4 font-medium">Predictor</th>
                        <th className="py-2 pr-4 font-medium">Last active</th>
                        <th className="py-2 font-medium sr-only">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page && page.users.length > 0 ? page.users.map((row) => (
                        <tr
                          key={row._id}
                          className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] cursor-pointer"
                          onClick={() => setDrilldownId(row._id)}
                        >
                          <td className="py-2.5 pr-4">
                            <span className="block text-[#F8FAFC] truncate max-w-[12rem]">{row.name}</span>
                            <span className="block text-[11px] text-[#94A3B8] truncate max-w-[12rem]">{row.email}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1] whitespace-nowrap">{fmtDay(row.registeredAt)}</td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1]">{row.examSelected ?? 'Not set'}</td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1]">
                            {row.miniCct.attempts > 0
                              ? `${row.miniCct.attempts} · ${row.miniCct.avgScorePercentage !== null ? `${row.miniCct.avgScorePercentage}%` : '—'}`
                              : '—'}
                          </td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1]">{row.dailyPyq.attempts || '—'}</td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1]">{row.dailyPyq.currentStreak > 0 ? `${row.dailyPyq.currentStreak}d` : '—'}</td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1]">
                            {row.predictions + row.desiredBranchQueries > 0
                              ? `${row.predictions}P · ${row.desiredBranchQueries}B`
                              : '—'}
                          </td>
                          <td className="py-2.5 pr-4 text-[#CBD5E1] whitespace-nowrap">
                            {row.lastActiveAt
                              ? `${fmtDay(row.lastActiveAt)} (${daysSince(row.lastActiveAt) ?? '?'}d)`
                              : 'Never'}
                          </td>
                          <td className="py-2.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDrilldownId(row._id); }}
                              className="text-xs text-[#4DD7C8] hover:text-[#18B6A4]"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-[#94A3B8]">
                            No free users match these filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {page && page.users.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                    <p className="text-xs text-[#94A3B8]">
                      {page.total} user{page.total === 1 ? '' : 's'} · page {page.page} of {Math.max(1, page.pages)}
                      {exporting && <span className="ml-2">exporting…</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={resetFilters} className="text-xs text-[#94A3B8] hover:text-[#F8FAFC]">
                        Clear filters
                      </button>
                      <button
                        onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                        disabled={page.page <= 1}
                        className="btn btn-outline !px-2.5 !py-1.5 disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        onClick={() => setPageNum((p) => Math.min(page.pages, p + 1))}
                        disabled={page.page >= page.pages}
                        className="btn btn-outline !px-2.5 !py-1.5 disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Section>

        <p className="text-[11px] text-[#64748B] leading-relaxed max-w-3xl">
          Metric definitions: a free user is a student account created through free sign-up (mentors, admins and
          paid students are excluded). DAU/WAU/MAU count distinct free users with any activity — Mini CCT
          attempts, Daily PYQ submissions or predictor usage — inside the IST-day window. Mini CCT averages use
          marks obtained ÷ total marks. Streaks follow the Daily PYQ IST-day rules. Drop-off = no activity for the
          selected number of days. Exam selection is inferred from predictor usage; FMGE and UPSC CMS cannot be
          captured yet.
        </p>

      {drilldownId && <UserDrilldown userId={drilldownId} onClose={() => setDrilldownId(null)} />}
    </div>
  );
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default MentorDashboard;
