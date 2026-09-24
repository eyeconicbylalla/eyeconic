import React from 'react';
import { BarChart3, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ComparisonPayload, ComparisonSubjectRow } from '../../types/app';

/**
 * "Individual Rank vs. Average Score of All" dashboard card.
 *
 * Renders the App backend's anonymous cohort comparison for the student's
 * most recent finalized GT/test: own score, cohort average, percentile and
 * a subject-wise my-vs-average table. Every number arrives pre-aggregated
 * from the server — this component only formats.
 */

const TEST_TYPE_LABELS: Record<string, string> = {
  daily: 'Daily Test',
  weekly: 'Weekly Test',
  grand: 'Grand Test',
};

/** Marks with a sane precision (whole numbers stay whole, halves show .0/.5). */
const fmtMarks = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
};

const clampPercent = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.min(100, Math.max(0, Number(value)));
};

const dateLabel = (value?: string) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

interface CardProps {
  payload: ComparisonPayload | null;
  loading: boolean;
  error: string;
  unavailable: boolean;
  onRetry: () => void;
}

const CohortComparisonCard: React.FC<CardProps> = ({ payload, loading, error, unavailable, onRetry }) => {
  const attempt = payload?.attempt;
  const cohort = payload?.cohort;

  const myPercent = clampPercent(attempt?.scorePercentage);
  const sufficient = cohort?.sufficient === true;
  const subjectRows = sufficient ? cohort?.subjectWise ?? [] : [];
  const marksPerQuestion =
    attempt && attempt.totalQuestions > 0 ? attempt.totalMarks / attempt.totalQuestions : null;

  const renderBody = () => {
    if (loading) {
      return (
        <div className="space-y-4 animate-pulse" aria-label="Loading comparison">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-[#151E29] rounded-xl" />)}
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-[#151E29] rounded" />
            <div className="h-2.5 bg-[#151E29] rounded" />
            <div className="h-2.5 bg-[#151E29] rounded" />
          </div>
          <div className="h-9 bg-[#151E29] rounded" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="dark-banner-error text-sm">
          <p>{error}</p>
          {unavailable && <p className="text-xs mt-1 opacity-80">The Eyeconic service may be waking up — this can take up to a minute.</p>}
          <button onClick={onRetry} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
        </div>
      );
    }

    if (!payload || !payload.hasEligibleAttempt || !attempt) {
      return (
        <div className="text-center py-10">
          <BookOpen className="w-9 h-9 text-[#18B6A4] mx-auto mb-3" />
          <p className="text-[#CBD5E1] text-sm">
            Complete a GT or Mini CCT to see how your performance compares with other students.
          </p>
          <Link to="/tests" className="btn btn-primary text-sm mt-4">Browse My Tests</Link>
        </div>
      );
    }

    const myBarWidth = clampPercent(myPercent === null && attempt.totalMarks > 0
      ? (attempt.marksObtained / attempt.totalMarks) * 100
      : myPercent);
    const avgBarWidth = clampPercent(cohort?.averageScorePercentage);

    return (
      <div>
        {/* Test identity */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-5">
          <span className="text-base font-medium text-[#F8FAFC]">{payload.quiz?.title || 'Test'}</span>
          {payload.quiz?.testType && (
            <span className="text-xs text-[#4DD7C8] bg-[#18B6A4]/10 border border-[#18B6A4]/25 rounded-full px-2.5 py-0.5">
              {TEST_TYPE_LABELS[payload.quiz.testType] || payload.quiz.testType}
            </span>
          )}
          <span className="text-xs text-[#94A3B8]">{dateLabel(attempt.endTime)}</span>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5">
            <div className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">My score</div>
            <div className="text-xl font-bold text-[#F8FAFC]">
              {fmtMarks(attempt.marksObtained)}<span className="text-sm font-medium text-[#94A3B8]">/{fmtMarks(attempt.totalMarks)}</span>
            </div>
            {myPercent !== null && (
              <div className="text-xs text-[#94A3B8] mt-0.5">{Math.round(myPercent)}%</div>
            )}
          </div>
          {sufficient ? (
            <>
              <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">All-students average</div>
                <div className="text-xl font-bold text-[#F8FAFC]">
                  {fmtMarks(cohort?.averageMarks)}<span className="text-sm font-medium text-[#94A3B8]">/{fmtMarks(attempt.totalMarks)}</span>
                </div>
                <div className="text-xs mt-0.5 flex items-center gap-1">
                  {cohort?.averageMarks != null && attempt.marksObtained !== cohort.averageMarks && (
                    <span className={attempt.marksObtained > cohort.averageMarks ? 'text-emerald-400' : 'text-rose-400'}>
                      {attempt.marksObtained > cohort.averageMarks ? '+' : '−'}
                      {fmtMarks(Math.abs(attempt.marksObtained - cohort.averageMarks))} vs average
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wide mb-1">Relative position</div>
                {cohort?.topPercent !== null && cohort?.topPercent !== undefined ? (
                  <>
                    <div className="text-xl font-bold text-[#4DD7C8]">Top {Math.round(cohort.topPercent)}%</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5">of {cohort?.totalStudents} students</div>
                  </>
                ) : (
                  <div className="text-sm text-[#94A3B8] mt-1">—</div>
                )}
              </div>
            </>
          ) : (
            <div className="col-span-2 bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5 flex items-center">
              <p className="text-sm text-[#94A3B8]">
                Not enough students have taken this test yet to show an anonymous comparison
                {cohort?.totalStudents ? ` (${cohort.totalStudents} so far, needs ${cohort.minCohortSize})` : ''}.
              </p>
            </div>
          )}
        </div>

        {sufficient && (
          <>
            {/* Score comparison bars — direct labels carry identity (You / All students) */}
            <div className="space-y-2.5 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-24 sm:w-28 text-xs text-[#CBD5E1] text-right shrink-0">You</div>
                <div className="flex-1 h-2.5 bg-[#0A0F14] rounded-r-[4px] overflow-hidden">
                  <div
                    className="h-full bg-[#18B6A4] rounded-r-[4px]"
                    style={{ width: `${myBarWidth ?? 0}%` }}
                    role="img"
                    aria-label={`Your score ${fmtMarks(attempt.marksObtained)} of ${fmtMarks(attempt.totalMarks)} marks`}
                  />
                </div>
                <div className="w-14 text-xs font-medium text-[#F8FAFC] tabular-nums shrink-0">{fmtMarks(attempt.marksObtained)}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 sm:w-28 text-xs text-[#CBD5E1] text-right shrink-0">All students</div>
                <div className="flex-1 h-2.5 bg-[#0A0F14] rounded-r-[4px] overflow-hidden">
                  <div
                    className="h-full bg-[#64748B] rounded-r-[4px]"
                    style={{ width: `${avgBarWidth ?? 0}%` }}
                    role="img"
                    aria-label={`All-students average ${fmtMarks(cohort?.averageMarks)} of ${fmtMarks(attempt.totalMarks)} marks`}
                  />
                </div>
                <div className="w-14 text-xs font-medium text-[#F8FAFC] tabular-nums shrink-0">{fmtMarks(cohort?.averageMarks)}</div>
              </div>
            </div>

            {/* Score distribution — one hue, opacity steps with magnitude; the
                student's own bucket carries the emphasis ring + marker. */}
            {Array.isArray(cohort?.scoreDistribution) && cohort.scoreDistribution.length > 0 && (
              <div className="mb-6">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wide mb-2">
                  Score distribution · {cohort?.totalStudents} students
                </div>
                <div className="flex gap-[2px] h-9">
                  {cohort.scoreDistribution.map((bucket) => {
                    const maxCount = Math.max(...cohort.scoreDistribution.map((b) => b.count), 1);
                    const intensity = bucket.count > 0 ? 0.25 + 0.75 * (bucket.count / maxCount) : 0.08;
                    const isMine =
                      myPercent !== null && myPercent >= bucket.min && myPercent <= bucket.max;
                    return (
                      <div
                        key={bucket.label}
                        className="flex-1 rounded-[4px] relative"
                        style={{
                          backgroundColor: `rgba(24, 182, 164, ${intensity.toFixed(2)})`,
                          ...(isMine ? { outline: '2px solid #4DD7C8', outlineOffset: '-2px' } : {}),
                        }}
                        title={`${bucket.label}: ${bucket.count} ${bucket.count === 1 ? 'student' : 'students'}${isMine ? ' · you are here' : ''}`}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] tabular-nums text-[#F8FAFC]">
                          {bucket.count > 0 ? bucket.count : ''}
                        </span>
                        {isMine && (
                          <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 text-[9px] font-semibold text-[#4DD7C8] bg-[#18222E] px-1 rounded">
                            You
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-[#94A3B8] mt-1 tabular-nums">
                  <span>0%</span><span>100%</span>
                </div>
              </div>
            )}

            {/* Subject-wise my vs average */}
            {subjectRows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wide">Subject-wise comparison</div>
                  <div className="flex items-center gap-3 text-[11px] text-[#94A3B8]">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#18B6A4]" /> You</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#64748B]" /> Average</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-left text-[11px] text-[#94A3B8] uppercase tracking-wide">
                        <th className="font-medium pb-2">Subject</th>
                        <th className="font-medium pb-2 w-24 text-right">You</th>
                        <th className="font-medium pb-2 w-24 text-right">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectRows.map((row) => (
                        <SubjectRow key={row.subjectName} row={row} marksPerQuestion={marksPerQuestion} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#94A3B8] mt-5">
              Compared anonymously with {cohort?.totalStudents} students who took this test. Individual scores of other students are never shown.
            </p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#4DD7C8] flex items-center gap-2">
          <BarChart3 size={16} /> Individual Rank vs. Average Score of All
        </h3>
        <Link to="/tests" className="text-sm text-[#18B6A4] hover:text-[#1CC8B5]">View all tests →</Link>
      </div>
      {renderBody()}
    </div>
  );
};

/** One subject row: name + my-vs-average bar (my fill, average tick), numbers right-aligned. */
const SubjectRow: React.FC<{ row: ComparisonSubjectRow; marksPerQuestion: number | null }> = ({ row, marksPerQuestion }) => {
  const maxMarks = marksPerQuestion && marksPerQuestion > 0 ? row.questionCount * marksPerQuestion : Math.max(row.myMarks ?? 0, row.avgMarks, 1);
  const myWidth = Math.min(100, Math.max(0, ((row.myMarks ?? 0) / maxMarks) * 100));
  const avgLeft = Math.min(100, Math.max(0, (row.avgMarks / maxMarks) * 100));
  const above = row.myMarks !== null && row.myMarks > row.avgMarks;

  return (
    <tr className="border-t border-white/[0.05]">
      <td className="py-2.5 pr-3">
        <div className="text-sm text-[#F8FAFC] truncate max-w-[220px]">{row.subjectName}</div>
        <div className="mt-1.5 h-1.5 bg-[#0A0F14] rounded-r-[4px] relative max-w-[280px]">
          <div className="h-full bg-[#18B6A4] rounded-r-[4px]" style={{ width: `${myWidth}%` }} />
          <div
            className="absolute top-[-2px] h-[10px] w-[2px] bg-[#CBD5E1] rounded-full"
            style={{ left: `calc(${avgLeft}% - 1px)` }}
            aria-hidden="true"
          />
        </div>
        <div className="text-[10px] text-[#94A3B8] mt-1">{row.questionCount} questions</div>
      </td>
      <td className="py-2.5 text-right tabular-nums">
        <span className={above ? 'text-emerald-400 font-medium' : 'text-[#F8FAFC]'}>
          {row.myMarks === null ? '—' : fmtMarks(row.myMarks)}
        </span>
      </td>
      <td className="py-2.5 text-right tabular-nums text-[#94A3B8]">{fmtMarks(row.avgMarks)}</td>
    </tr>
  );
};

export default CohortComparisonCard;
