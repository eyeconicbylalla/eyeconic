import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS, Filler, Legend, LineElement, PointElement, RadialLinearScale, Tooltip,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Flame, Lightbulb, Loader2, Lock,
  MessageCircle, RefreshCw, Target, TrendingUp, XCircle,
} from 'lucide-react';
import { appErrorMessage, isAppUnavailable, miniCctApi } from '../../lib/appClient';
import type { MiniCctAnalysis as MiniCctAnalysisType, MiniCctHeatmapCell } from '../../types/app';

/**
 * Mini CCT analysis dashboard — rendered after every Mini CCT submission and
 * from attempt history (/tests/:quizId/results/:attemptId embeds it).
 *
 * Every number comes from the App API's /mini-cct/attempts/:id/analysis:
 * scoring, subject comparison against the database average, percentile,
 * topic & concept-tag breakdowns and the free-user gating are computed
 * server-side — this component only renders them. Gated sections never reach
 * the browser; their placeholders carry the upgrade message.
 */

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// Categorical series — validated pair on the #18222E card surface (dataviz
// checks: lightness band, chroma, CVD separation, contrast all pass).
const SERIES_YOU = '#0D9488';
const SERIES_AVERAGE = '#D97706';
const CHART_TEXT = '#94A3B8';
const CHART_GRID = 'rgba(148, 163, 184, 0.14)';

const HEATMAP_STATUS_STYLES: Record<MiniCctHeatmapCell['status'], string> = {
  correct: 'bg-emerald-500/75 border-emerald-300/30',
  incorrect: 'bg-rose-500/75 border-rose-300/30',
  skipped: 'bg-slate-600/70 border-slate-400/30',
};

const fmtAccuracy = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Math.round(value)}%`;

const fmtDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label, value, tone = 'text-[#F8FAFC]',
}) => (
  <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5">
    <div className="text-xs text-[#94A3B8] mb-1">{label}</div>
    <div className={`text-lg font-bold ${tone}`}>{value}</div>
  </div>
);

const Section: React.FC<{
  title: string; icon: React.ReactNode; children: React.ReactNode; hint?: string;
}> = ({ title, icon, children, hint }) => (
  <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="font-semibold text-[#4DD7C8] flex items-center gap-2">{icon} {title}</h3>
      {hint && <span className="text-[11px] text-[#94A3B8]">{hint}</span>}
    </div>
    {children}
  </div>
);

/** Placeholder for the sections the server withheld from free users. */
const GatedSection: React.FC<{ title: string; icon: React.ReactNode; message: string }> = ({
  title, icon, message,
}) => (
  <div className="bg-[#18222E] border border-dashed border-[#18B6A4]/30 rounded-2xl p-6 text-center">
    <div className="w-11 h-11 rounded-xl bg-[#18B6A4]/10 border border-[#18B6A4]/25 flex items-center justify-center mx-auto mb-3">
      <Lock size={18} className="text-[#4DD7C8]" />
    </div>
    <h3 className="font-semibold text-[#F8FAFC] mb-1.5 flex items-center justify-center gap-2">{icon} {title}</h3>
    <p className="text-sm text-[#94A3B8] max-w-md mx-auto">{message}</p>
    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
      <a
        href="https://wa.me/919116303037?text=Hey!%20I%20want%20to%20unlock%20the%20full%20Mini%20CCT%20analysis."
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary text-sm px-4 py-2"
      >
        <MessageCircle size={15} className="mr-2" /> Unlock full analysis
      </a>
    </div>
  </div>
);

const SUBJECT_FILTER_ALL = 'All';

interface MiniCctAnalysisProps {
  attemptId: string;
}

const MiniCctAnalysis: React.FC<MiniCctAnalysisProps> = ({ attemptId }) => {
  const [analysis, setAnalysis] = useState<MiniCctAnalysisType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>(SUBJECT_FILTER_ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      setAnalysis(await miniCctApi.analysis(attemptId));
    } catch (err) {
      setError(appErrorMessage(err, 'This analysis could not be loaded.'));
      setUnavailable(isAppUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    load();
  }, [load]);

  const subjectNames = useMemo(
    () => (analysis ? analysis.subjects.map((s) => s.subjectName) : []),
    [analysis]
  );

  const filteredTopics = useMemo(() => {
    if (!analysis?.topics) return [];
    return subjectFilter === SUBJECT_FILTER_ALL
      ? analysis.topics
      : analysis.topics.filter((t) => t.subjectName === subjectFilter);
  }, [analysis, subjectFilter]);

  const filteredTags = useMemo(() => {
    if (!analysis?.tags) return [];
    return subjectFilter === SUBJECT_FILTER_ALL
      ? analysis.tags
      : analysis.tags.filter((t) => t.subjects.includes(subjectFilter));
  }, [analysis, subjectFilter]);

  const weakTags = useMemo(
    () => (analysis?.tags || []).filter((t) => t.status === 'weak'),
    [analysis]
  );
  const strongTags = useMemo(
    () => (analysis?.tags || []).filter((t) => t.status === 'strong'),
    [analysis]
  );

  // All hooks run before the early returns below (rules-of-hooks).
  const limited = analysis?.access.level === 'limited';

  const radarData = useMemo(() => {
    if (!analysis || limited || !analysis.subjects.some((s) => s.cohortAvgAccuracy !== null)) return null;
    return {
      labels: analysis.subjects.map((s) => s.subjectName),
      datasets: [
        {
          label: 'You',
          data: analysis.subjects.map((s) => s.accuracy ?? 0),
          backgroundColor: 'rgba(13, 148, 136, 0.22)',
          borderColor: SERIES_YOU,
          pointBackgroundColor: SERIES_YOU,
          pointRadius: 4,
          borderWidth: 2,
        },
        {
          label: 'Database average',
          data: analysis.subjects.map((s) => s.cohortAvgAccuracy ?? 0),
          backgroundColor: 'rgba(217, 119, 6, 0.16)',
          borderColor: SERIES_AVERAGE,
          pointBackgroundColor: SERIES_AVERAGE,
          pointRadius: 4,
          borderWidth: 2,
        },
      ],
    };
  }, [analysis, limited]);

  const radarOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, color: CHART_TEXT, backdropColor: 'transparent', font: { size: 10 } },
        grid: { color: CHART_GRID },
        angleLines: { color: CHART_GRID },
        pointLabels: { color: '#CBD5E1', font: { size: 11 } },
      },
    },
    plugins: {
      legend: { labels: { color: CHART_TEXT, usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { label: (ctx: { dataset: { label?: string }; parsed: { r: number } }) => `${ctx.dataset.label}: ${Math.round(ctx.parsed.r)}%` } },
    },
  }), []);

  if (loading && !analysis) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin mb-3" />
        <span className="text-sm text-[#94A3B8]">Crunching your Mini CCT analysis…</span>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-8 text-center">
        <AlertTriangle className="w-9 h-9 text-amber-400 mx-auto mb-3" />
        <p className="text-[#CBD5E1] mb-1">{error || 'Analysis not available.'}</p>
        {unavailable && (
          <p className="text-xs text-[#94A3B8] mt-1">
            The Eyeconic service may be waking up — this can take up to a minute.
          </p>
        )}
        <button onClick={load} className="btn btn-outline text-sm mt-4">
          <RefreshCw size={14} className="mr-2" /> Try Again
        </button>
      </div>
    );
  }

  const { summary, cohort, insight, access } = analysis;

  const tierTone: Record<string, string> = {
    excellent: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    strong: 'border-[#18B6A4]/40 bg-[#18B6A4]/10 text-[#4DD7C8]',
    developing: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    needs_focus: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  };

  return (
    <div className="space-y-6">
      {/* ---- Score summary ------------------------------------------------ */}
      <Section title="Score Summary" icon={<Target size={16} />}>
        <div className="text-center mb-5">
          <div className="text-4xl sm:text-5xl font-bold text-[#4DD7C8]">
            {summary.marksObtained}
            <span className="text-xl text-[#94A3B8]"> / {summary.totalMarks}</span>
          </div>
          <div className="text-sm text-[#94A3B8] mt-1">
            {summary.scorePercentage !== null ? `${summary.scorePercentage}% score` : '—'} · {fmtAccuracy(summary.accuracy)} accuracy
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Correct" value={summary.correct} tone="text-emerald-300" />
          <Stat label="Incorrect" value={summary.incorrect} tone="text-rose-300" />
          <Stat label="Skipped" value={summary.skipped} tone="text-[#94A3B8]" />
          <Stat label="Attempted" value={`${summary.attempted}/${summary.totalQuestions}`} />
          <Stat label="Time taken" value={fmtDuration(summary.timeTakenSeconds)} />
          <Stat
            label="Percentile"
            value={cohort.percentile !== null ? `${cohort.percentile}` : '—'}
            tone={cohort.percentile !== null && cohort.percentile >= 50 ? 'text-[#4DD7C8]' : 'text-[#F8FAFC]'}
          />
        </div>
        {cohort.percentile === null && !limited && (
          <p className="text-xs text-[#94A3B8] mt-3">
            {cohort.sufficient
              ? null
              : `Percentile and database averages appear once at least ${cohort.minCohortSize} students have taken this test (${cohort.totalStudents} so far).`}
          </p>
        )}
      </Section>

      {/* ---- Performance tier / insight ----------------------------------- */}
      <Section title="Performance Insight" icon={<Lightbulb size={16} />}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {insight.tier ? (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${tierTone[insight.tier.key] || tierTone.developing}`}>
              <TrendingUp size={13} /> {insight.tier.label}
            </span>
          ) : (
            <span className="text-xs text-[#94A3B8]">No tier — nothing attempted.</span>
          )}
          {insight.strongestSubject && insight.strongestSubject.accuracy !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <CheckCircle2 size={13} /> Strongest: {insight.strongestSubject.subjectName} ({fmtAccuracy(insight.strongestSubject.accuracy)})
            </span>
          )}
          {insight.weakestSubject && insight.weakestSubject.accuracy !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <AlertTriangle size={13} /> Needs work: {insight.weakestSubject.subjectName} ({fmtAccuracy(insight.weakestSubject.accuracy)})
            </span>
          )}
        </div>
        <p className="text-sm text-[#CBD5E1]">{insight.message}</p>
      </Section>

      {/* ---- Subject comparison + radar ------------------------------------ */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <Section title="Subject Comparison" icon={<TrendingUp size={16} />} hint={limited ? 'Your performance' : 'You vs database average'}>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-xs text-[#94A3B8] uppercase tracking-wide">
                    <th className="py-2 pr-3 font-medium">Subject</th>
                    <th className="py-2 px-2 font-medium text-center">C / W / S</th>
                    <th className="py-2 px-2 font-medium text-center">Accuracy</th>
                    <th className="py-2 px-2 font-medium text-right">Marks</th>
                    {!limited && <th className="py-2 pl-3 font-medium text-right">DB avg marks</th>}
                    {!limited && <th className="py-2 pl-2 font-medium text-right">DB avg accuracy</th>}
                  </tr>
                </thead>
                <tbody>
                  {analysis.subjects.map((row) => (
                    <tr key={row.subjectName} className="border-t border-white/[0.05]">
                      <td className="py-2.5 pr-3 text-[#CBD5E1] font-medium">{row.subjectName}</td>
                      <td className="py-2.5 px-2 text-center text-[#94A3B8] whitespace-nowrap">
                        <span className="text-emerald-300">{row.correct}</span> / <span className="text-rose-300">{row.incorrect}</span> / <span>{row.skipped}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-[#F8FAFC]">{fmtAccuracy(row.accuracy)}</td>
                      <td className="py-2.5 px-2 text-right text-[#F8FAFC]">{row.marks}</td>
                      {!limited && (
                        <td className="py-2.5 pl-3 text-right text-[#F59E0B]">{row.cohortAvgMarks !== null ? row.cohortAvgMarks : '—'}</td>
                      )}
                      {!limited && (
                        <td className="py-2.5 pl-2 text-right text-[#F59E0B]">{fmtAccuracy(row.cohortAvgAccuracy)}</td>
                      )}
                    </tr>
                  ))}
                  <tr className="border-t border-white/[0.1]">
                    <td className="py-2.5 pr-3 text-[#F8FAFC] font-semibold">Overall</td>
                    <td className="py-2.5 px-2 text-center text-[#94A3B8]">
                      <span className="text-emerald-300">{summary.correct}</span> / <span className="text-rose-300">{summary.incorrect}</span> / <span>{summary.skipped}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center text-[#F8FAFC] font-semibold">{fmtAccuracy(analysis.overall.accuracy)}</td>
                    <td className="py-2.5 px-2 text-right text-[#F8FAFC] font-semibold">{summary.marksObtained}</td>
                    {!limited && (
                      <td className="py-2.5 pl-3 text-right text-[#F59E0B] font-semibold">
                        {cohort.averageMarks !== null ? cohort.averageMarks : '—'}
                      </td>
                    )}
                    {!limited && (
                      <td className="py-2.5 pl-2 text-right text-[#F59E0B] font-semibold">
                        {fmtAccuracy(analysis.overall.cohortAvgAccuracy)}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            {!limited && cohort.averageScorePercentage !== null && (
              <p className="text-xs text-[#94A3B8] mt-3">
                Across {cohort.totalStudents} student{cohort.totalStudents === 1 ? '' : 's'} on this test · average score {cohort.averageScorePercentage}% · top score {cohort.highestMarks ?? '—'} marks.
              </p>
            )}
          </Section>
        </div>

        <div className="xl:col-span-2">
          {limited ? (
            <GatedSection title="You vs Database Average" icon={<Target size={16} />} message={access.message || 'The radar comparison with the database average is part of the full analysis.'} />
          ) : radarData ? (
            <Section title="You vs Database Average" icon={<Target size={16} />} hint="Accuracy by subject">
              <div className="h-72 relative">
                <Radar data={radarData} options={radarOptions} />
              </div>
            </Section>
          ) : (
            <Section title="You vs Database Average" icon={<Target size={16} />} hint="Accuracy by subject">
              <div className="h-72 flex flex-col items-center justify-center text-center px-4">
                <AlertTriangle size={22} className="text-[#4A5568] mb-2" />
                <p className="text-sm text-[#94A3B8]">
                  The radar appears once at least {cohort.minCohortSize} students have taken this test
                  ({cohort.totalStudents} so far).
                </p>
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* ---- Question heatmap ---------------------------------------------- */}
      {limited ? (
        <GatedSection title="Question Heatmap" icon={<CheckCircle2 size={16} />} message={access.message || 'The question-by-question heatmap is part of the full analysis.'} />
      ) : (
        <Section title="Question Heatmap" icon={<CheckCircle2 size={16} />} hint={`${summary.totalQuestions} questions`}>
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
              <span className="w-3.5 h-3.5 rounded bg-emerald-500/75 border border-emerald-300/30" /> Correct · {summary.correct}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
              <span className="w-3.5 h-3.5 rounded bg-rose-500/75 border border-rose-300/30" /> Incorrect · {summary.incorrect}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
              <span className="w-3.5 h-3.5 rounded bg-slate-600/70 border border-slate-400/30" /> Skipped · {summary.skipped}
            </span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
            {(analysis.heatmap || []).map((cell) => (
              <div
                key={cell.questionIndex}
                title={`Q${cell.questionIndex + 1} · ${cell.subjectName}${cell.topicName ? ` · ${cell.topicName}` : ''} · ${cell.status}`}
                className={`aspect-square rounded-lg border flex items-center justify-center text-[11px] font-bold text-white/90 ${HEATMAP_STATUS_STYLES[cell.status]}`}
              >
                {cell.questionIndex + 1}
              </div>
            ))}
          </div>
          <p className="text-xs text-[#94A3B8] mt-4">
            Hover any square for the subject and topic it tested.
          </p>
        </Section>
      )}

      {/* ---- Topic-wise analysis ------------------------------------------- */}
      {limited ? (
        <GatedSection title="Topic-wise Analysis" icon={<ArrowUpRight size={16} />} message={access.message || 'Topic-wise accuracy is part of the full analysis.'} />
      ) : (
        <Section title="Topic-wise Analysis" icon={<ArrowUpRight size={16} />} hint="Accuracy per topic">
          <div className="flex flex-wrap gap-2 mb-4">
            {[SUBJECT_FILTER_ALL, ...subjectNames].map((name) => (
              <button
                key={name}
                onClick={() => setSubjectFilter(name)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  subjectFilter === name
                    ? 'bg-[#18B6A4]/15 border-[#18B6A4]/40 text-[#4DD7C8]'
                    : 'bg-white/[0.03] border-white/[0.06] text-[#94A3B8] hover:text-[#CBD5E1]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          {filteredTopics.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-4 text-center">No topics under this filter.</p>
          ) : (
            <div className="space-y-2.5">
              {filteredTopics.map((topic) => {
                const accuracyPct = topic.accuracy === null ? null : Math.round(topic.accuracy);
                return (
                  <div key={`${topic.subjectName}-${topic.label}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm mb-1">
                      <span className="text-[#CBD5E1]">
                        {topic.label}
                        <span className="text-xs text-[#94A3B8] ml-2">{topic.subjectName}</span>
                      </span>
                      <span className="text-xs text-[#94A3B8]">
                        {topic.label} — {topic.correct}/{topic.attempted} correct → <span className="text-[#F8FAFC] font-semibold">{fmtAccuracy(topic.accuracy)}</span>
                        {topic.skipped > 0 && <span className="ml-1.5">({topic.skipped} skipped)</span>}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#151E29] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${accuracyPct === null ? 'bg-slate-600/60' : accuracyPct >= 67 ? 'bg-emerald-400/70' : accuracyPct >= 40 ? 'bg-amber-400/70' : 'bg-rose-400/70'}`}
                        style={{ width: `${accuracyPct === null ? 100 : accuracyPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ---- Concept-tag analysis ------------------------------------------ */}
      {limited ? (
        <GatedSection title="Concept Tags — Revise These" icon={<Flame size={16} />} message={access.message || 'Concept-tag strengths and weaknesses are part of the full analysis.'} />
      ) : (
        <Section title="Concept Tags" icon={<Flame size={16} />} hint="1–3 concept tags per question">
          <div className="flex flex-wrap gap-2 mb-4">
            {[SUBJECT_FILTER_ALL, ...subjectNames].map((name) => (
              <button
                key={name}
                onClick={() => setSubjectFilter(name)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  subjectFilter === name
                    ? 'bg-[#18B6A4]/15 border-[#18B6A4]/40 text-[#4DD7C8]'
                    : 'bg-white/[0.03] border-white/[0.06] text-[#94A3B8] hover:text-[#CBD5E1]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {filteredTags.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-4 text-center">
              No concept tags under this filter{subjectFilter !== SUBJECT_FILTER_ALL ? ' — questions may carry no tags for this subject.' : '.'}
            </p>
          ) : (
            <>
              {weakTags.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-300 mb-2 flex items-center gap-1.5">
                    <XCircle size={13} /> Revise These — below your own average
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {weakTags
                      .filter((tag) => subjectFilter === SUBJECT_FILTER_ALL || tag.subjects.includes(subjectFilter))
                      .slice(0, 8)
                      .map((tag) => (
                        <span key={tag.label} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-200">
                          {tag.label} · {tag.correct}/{tag.attempted} · {fmtAccuracy(tag.accuracy)}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {strongTags.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-300 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Your Strengths — keep reinforcing these
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {strongTags
                      .filter((tag) => subjectFilter === SUBJECT_FILTER_ALL || tag.subjects.includes(subjectFilter))
                      .slice(0, 8)
                      .map((tag) => (
                        <span key={tag.label} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
                          {tag.label} · {tag.correct}/{tag.attempted} · {fmtAccuracy(tag.accuracy)}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-left text-xs text-[#94A3B8] uppercase tracking-wide">
                      <th className="py-2 pr-3 font-medium">Concept tag</th>
                      <th className="py-2 px-2 font-medium text-center">Correct</th>
                      <th className="py-2 px-2 font-medium text-center">Attempted</th>
                      <th className="py-2 px-2 font-medium text-center">Accuracy</th>
                      <th className="py-2 pl-2 font-medium text-left">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTags.map((tag) => (
                      <tr key={tag.label} className="border-t border-white/[0.05]">
                        <td className="py-2 pr-3 text-[#CBD5E1]">{tag.label}</td>
                        <td className="py-2 px-2 text-center text-[#94A3B8]">{tag.correct}</td>
                        <td className="py-2 px-2 text-center text-[#94A3B8]">{tag.attempted}</td>
                        <td className="py-2 px-2 text-center text-[#F8FAFC]">{fmtAccuracy(tag.accuracy)}</td>
                        <td className="py-2 pl-2 text-xs">
                          {tag.status === 'weak' && <span className="text-rose-300">Revise this</span>}
                          {tag.status === 'strong' && <span className="text-emerald-300">Strength</span>}
                          {tag.status === 'neutral' && <span className="text-[#4A5568]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[#94A3B8] mt-3">
                “Revise These” tags fall below your own overall accuracy ({fmtAccuracy(summary.accuracy)}); strengths sit at or above max(67%, your average).
              </p>
            </>
          )}
        </Section>
      )}
    </div>
  );
};

export default MiniCctAnalysis;
