/**
 * Copy + display constants for the Readiness Score surface (Feature 09).
 *
 * Same P0 rule as the predictor: everything a student reads is plain
 * language; engine vocabulary (method-version ids, snapshot ids, rule ids)
 * never reaches the screen. Every NUMBER shown in the result view comes from
 * the API response — nothing here duplicates a server computation. The only
 * arithmetic in this file is display formatting of server-provided values.
 */

import type { ReadinessCalendarEntry, ReadinessPattern, ReadinessState } from '../../types/readiness';

/**
 * The three states (§11) — exactly one per result, colored in the repo's
 * emerald/amber/rose convention (GAP_META tones). BARELY_READY is the
 * catch-all floor (R4); SIGNIFICANT_GAP rides as a badge, never a 4th state.
 */
export const STATE_META: Record<
  ReadinessState,
  { label: string; panel: string; chip: string; dot: string }
> = {
  READY: {
    label: 'Ready',
    panel: 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-100',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  MODERATELY_READY: {
    label: 'Moderately ready',
    panel: 'bg-amber-500/[0.08] border-amber-500/30 text-amber-100',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  BARELY_READY: {
    label: 'Barely ready',
    panel: 'bg-rose-500/[0.08] border-rose-500/30 text-rose-100',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
};

/** Plain names for the anchor ladder rows (rank/requiredCorrects come from the API). */
export const ANCHOR_META: Record<string, { label: string }> = {
  QUALIFY: { label: 'Qualifying bar' },
  ANY_SEAT: { label: 'Any seat' },
  STRONG: { label: 'Top clinical seat' },
};

/**
 * Per-exam pattern fallback while the exam list loads — same precedent as the
 * predictor's EXAM_MAX_CORRECTS (the live GET /exams list carries `pattern`
 * and wins once it arrives; the server validates regardless).
 */
export const EXAM_PATTERN_FALLBACK: Record<string, ReadinessPattern> = {
  NEET_PG: { totalQuestions: 180, positive: 4, negative: 1, maxMarks: 720 },
  INI_CET: { totalQuestions: 200, positive: 1, negative: 1 / 3, maxMarks: 200 },
};

/** The selected exam's pattern, preferring the live exam list. */
export function patternFor(
  exams: Array<{ id: string; pattern?: { totalQuestions: number; positive: number; negative: number; maxMarks: number } }>,
  examId: string
): ReadinessPattern {
  const live = exams.find((e) => e.id === examId)?.pattern;
  return live ?? EXAM_PATTERN_FALLBACK[examId] ?? EXAM_PATTERN_FALLBACK.NEET_PG;
}

/** Short in-context lines for known warnings; full server text lives in Methodology. */
export const READINESS_WARNING_SHORT: Record<string, string> = {
  DATE_EXPECTED:
    'Exam date not officially announced yet — this one is projected from the recent-year schedule and will be replaced on announcement.',
  CROWD_SOURCED_PRIOR:
    'The corrects → percentile step has no official data behind it — treat it as a rough estimate.',
  PRIOR_UR_ONLY:
    'Reserved category: the corrects → percentile step is weaker still (its priors cover UR only).',
  PROVISIONAL_WIDTHS: 'Range widths are provisional — they will sharpen as real outcomes are captured.',
};

// ---- display formatting (server values in, strings out) ---------------------------

/** Trim float noise from pattern-derived display numbers (−66.67, 1.33…). */
export const fmtNum = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);

/** '2027-01' → 'January 2027 session' · '2027' → '2027' (session keys are server data). */
export function sessionLabel(session: string): string {
  if (!session.includes('-')) return session;
  const [year, month] = session.split('-');
  const monthName =
    month === '01' ? 'January' : month === '07' ? 'July' : `${month}/${year}`;
  return `${monthName} ${year} session`;
}

/** '2026-11-01' (IST civil date) → 'Sun, 1 Nov 2026' — parsed as a date, never a timestamp. */
export function examDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * §8 display convention over server-provided values: under a month ⇒ days
 * only; otherwise months to 1 decimal plus days. The result view itself shows
 * the server-composed explanation.timeRemainingText verbatim; this formats
 * the calendar entry for the dashboard card and the form banner.
 */
export function timeRemainingLabel(entry: Pick<ReadinessCalendarEntry, 'daysRemaining' | 'monthsRemaining'>): string {
  if (entry.daysRemaining <= 0) return 'exam day';
  if (entry.daysRemaining < 30.44) return `${entry.daysRemaining} ${entry.daysRemaining === 1 ? 'day' : 'days'}`;
  return `${entry.monthsRemaining.toFixed(1)} months (${entry.daysRemaining} days)`;
}
