import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { mentorDashboardApi, mentorErrorMessage } from '../../lib/mentorDashboardClient';
import type { MentorUserDetail } from '../../types/mentorDashboard';

const fmtDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value}%`;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5">
      <h4 className="text-sm font-semibold text-[#4DD7C8] uppercase tracking-wide mb-3">{title}</h4>
      {children}
    </div>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left text-[#94A3B8] border-b border-white/[0.06]">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.03] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-[#CBD5E1] whitespace-nowrap">{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EmptyNote = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-[#94A3B8] py-2">{children}</p>
);

/**
 * Drilldown modal for one free user (Feature 08 §B): profile, Mini CCT
 * history, Daily PYQ history + streaks, predictor usage incl. GT corrects,
 * and the merged last-active date.
 */
const UserDrilldown: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const [detail, setDetail] = useState<MentorUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await mentorDashboardApi.user(userId));
    } catch (err) {
      setError(mentorErrorMessage(err, 'Could not load this user.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="User detail">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0F1720] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#F8FAFC] truncate">
              {detail ? detail.user.name : 'Loading user…'}
            </h3>
            {detail && (
              <p className="text-xs text-[#94A3B8] mt-0.5 truncate">
                {detail.user.email}
                {detail.user.phone ? ` · ${detail.user.phone}` : ''} · registered {fmtDate(detail.user.registeredAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} className="btn btn-outline !px-2.5 !py-1.5" aria-label="Reload">
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="btn btn-outline !px-2.5 !py-1.5" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="py-10 flex items-center justify-center" role="status">
              <Loader2 className="w-6 h-6 text-[#18B6A4] animate-spin" />
            </div>
          )}
          {!loading && error && (
            <div className="dark-banner-error text-sm">
              <p>{error}</p>
              <button onClick={load} className="btn btn-outline text-xs px-3 py-1.5 mt-3">Try Again</button>
            </div>
          )}
          {!loading && detail && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Panel title="Last active">
                  <p className="text-sm text-[#F8FAFC]">{fmtDate(detail.lastActiveAt)}</p>
                </Panel>
                <Panel title="Exam selected">
                  <p className="text-sm text-[#F8FAFC]">
                    {detail.predictor.predictions[0]?.exam
                      ?? detail.predictor.desiredBranchQueries[0]?.exam
                      ?? 'Not set'}
                  </p>
                </Panel>
                <Panel title="Desired branch">
                  <p className="text-sm text-[#F8FAFC] truncate">
                    {detail.predictor.desiredBranchQueries[0]?.branch ?? 'Not set'}
                  </p>
                </Panel>
                <Panel title="Daily PYQ streak">
                  <p className="text-sm text-[#F8FAFC]">
                    {detail.dailyPyq.streaks.current}d <span className="text-[#94A3B8]">(best {detail.dailyPyq.streaks.best}d)</span>
                  </p>
                </Panel>
              </div>

              <Panel title="Profile (free-user onboarding)">
                {detail.user.freeUserProfile ? (
                  <MiniTable
                    head={['Year', 'Platforms', 'Ready to transform', 'Issues']}
                    rows={[[
                      detail.user.freeUserProfile.year || '—',
                      (detail.user.freeUserProfile.resources || []).join(', ') || '—',
                      detail.user.freeUserProfile.isReadyToTransform ? 'Yes' : 'No',
                      detail.user.freeUserProfile.issues || '—',
                    ]]}
                  />
                ) : (
                  <EmptyNote>Onboarding profile not completed yet.</EmptyNote>
                )}
              </Panel>

              <Panel title={`Mini CCT history (${detail.miniCct.summary.totalAttempts} attempts · avg ${pct(detail.miniCct.summary.avgScorePercentage)} · best ${pct(detail.miniCct.summary.bestScorePercentage)})`}>
                {detail.miniCct.attempts.length > 0 ? (
                  <>
                    <MiniTable
                      head={['Test', 'Subject', 'Score', 'Marks', 'Date']}
                      rows={detail.miniCct.attempts.map((a) => [
                        a.quizTitle,
                        a.subjectName ?? '—',
                        pct(a.scorePercentage),
                        `${a.marksObtained}/${a.totalMarks}`,
                        fmtDate(a.endTime),
                      ])}
                    />
                    {detail.miniCct.capped && (
                      <EmptyNote>Showing the {detail.miniCct.attempts.length} most recent attempts.</EmptyNote>
                    )}
                  </>
                ) : (
                  <EmptyNote>No Mini CCT attempts yet.</EmptyNote>
                )}
              </Panel>

              <Panel title={`Daily PYQ history (${detail.dailyPyq.totalAttempts} attempts · avg score ${detail.dailyPyq.averageScore ?? '—'})`}>
                {detail.dailyPyq.attempts.length > 0 ? (
                  <MiniTable
                    head={['Date', 'Score', 'Correct', 'Skipped', 'Submitted']}
                    rows={detail.dailyPyq.attempts.map((a) => [
                      a.date,
                      `${a.score}/${a.maxScore}`,
                      `${a.correctCount}/${a.totalQuestions}`,
                      a.skippedCount,
                      fmtDate(a.submittedAt),
                    ])}
                  />
                ) : (
                  <EmptyNote>No Daily PYQ attempts yet.</EmptyNote>
                )}
              </Panel>

              <Panel title={`Rank Predictor (${detail.predictor.totals.predictions} predictions · ${detail.predictor.totals.desiredBranchQueries} desired-branch queries)`}>
                {detail.predictor.gtCorrects.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-[#94A3B8] mb-1.5">GT corrects entered (latest prediction)</p>
                    <MiniTable
                      head={['Grand Test', 'Corrects', 'Provenance']}
                      rows={detail.predictor.gtCorrects.map((g, i) => [
                        g.gtTitle ?? `GT ${i + 1}`,
                        g.totalQuestions !== null ? `${g.corrects}/${g.totalQuestions}` : g.corrects,
                        g.provenance ?? '—',
                      ])}
                    />
                  </div>
                )}
                {detail.predictor.predictions.length > 0 ? (
                  <MiniTable
                    head={['Prediction', 'Exam', 'When']}
                    rows={detail.predictor.predictions.map((p, i) => [`#${detail.predictor.totals.predictions - i}`, p.exam ?? '—', fmtDate(p.createdAt)])}
                  />
                ) : (
                  <EmptyNote>No predictor usage yet.</EmptyNote>
                )}
                {detail.predictor.desiredBranchQueries.length > 0 && (
                  <div className="mt-3">
                    <MiniTable
                      head={['Desired branch', 'Exam', 'When']}
                      rows={detail.predictor.desiredBranchQueries.map((d) => [
                        d.branch ?? '—', d.exam ?? '—', fmtDate(d.createdAt),
                      ])}
                    />
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDrilldown;
