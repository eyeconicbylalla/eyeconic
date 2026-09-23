/**
 * Copy + display constants for the predictor surfaces.
 *
 * P0 rule: everything a student reads here is plain language. Engine
 * vocabulary (transfer tiers, dataset snapshot ids, milestones) never reaches
 * the screen — the API keeps sending it (spec §18 Phase 7 response contract)
 * and this layer translates.
 */

import type { BranchBand, PredictionResult } from '../../types/predictor';

/**
 * BranchSummary.coverage is a wide string, so TypeScript cannot narrow the
 * CATEGORY_REQUIRED member by discrimination — exclude it explicitly (same
 * guard the pre-decomposition page used).
 */
export function isBranchSummary(
  branches: PredictionResult['branches']
): branches is Exclude<PredictionResult['branches'], { coverage: 'CATEGORY_REQUIRED' }> {
  return branches.coverage !== 'CATEGORY_REQUIRED';
}

export const NO_SKIP_NOTE =
  'Prediction assumes you attempted all questions and did not skip any questions in these Grand Tests.';
export const LOW_GT_NOTE =
  'Based on few Grand Tests. Add more GTs for a narrower, more reliable estimate.';
export const DISCLAIMER_NOTE =
  'Estimate based on historical data. Actual results may vary.';

export const CATEGORIES = ['UR', 'EWS', 'OBC', 'SC', 'ST'] as const;

/**
 * Per-exam correct-answer bounds. These mirror the server's pattern config
 * (single source of truth: GET /exams carries `pattern`); the map is the
 * pre-API fallback so the form is correct before the list loads — and so a
 * future exam never inherits another exam's question count.
 */
export const EXAM_MAX_CORRECTS: Record<string, number> = { NEET_PG: 180, INI_CET: 200 };

/** Bound for the selected exam, preferring the live exam-list pattern. */
export function maxCorrectsFor(
  exams: Array<{ id: string; pattern?: { totalQuestions: number } }> | undefined,
  examId: string
): number {
  const fromApi = exams?.find((e) => e.id === examId)?.pattern?.totalQuestions;
  return fromApi ?? EXAM_MAX_CORRECTS[examId] ?? 200;
}

/** Cap on "from your last prediction" echo chips — they were unbounded clutter. */
export const SUGGESTION_CHIPS_MAX = 3;

export const EXAM_LABELS: Record<string, string> = {
  NEET_PG: 'NEET PG',
  INI_CET: 'INI-CET',
};

/** Plain-language pattern lines (units consistent across exams). */
export const EXAM_PATTERN_LABELS: Record<string, string> = {
  NEET_PG: '180 questions · +4 / −1 marking · max 720',
  INI_CET: '200 questions · +1 / −⅓ marking · max 200',
};

/**
 * Outcome-capture score bounds follow the exam's pattern (server enforces
 * too). The prediction's own pattern echo is preferred when present, so a
 * stored pre-migration (800-scale) result still shows its true /800 scale.
 */
export const OUTCOME_MAX_SCORE: Record<string, number> = { NEET_PG: 720, INI_CET: 200 };

export const BAND_META: Record<BranchBand, { label: string; hint: string; chip: string; dot: string }> = {
  COMFORTABLE: {
    label: 'Comfortable',
    hint: 'Even the cautious end of your range cleared this closing rank.',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  WITHIN_RANGE: {
    label: 'Within range',
    hint: 'Part of your predicted range clears this closing rank.',
    chip: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    dot: 'bg-teal-400',
  },
  BORDERLINE: {
    label: 'Borderline',
    hint: 'Just beyond the closing rank, within typical year-to-year cutoff movement.',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  ASPIRATIONAL: {
    label: 'Aspirational',
    hint: 'Needs cutoff movement at the extreme of what recent years show.',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
};

/** Plain-language coverage states (engine strings, rewritten for students). */
export const RANK_COVERAGE_TEXT: Record<string, string> = {
  full: 'Fully covered by the official result data.',
  'partial-top': 'The optimistic end goes past the top of the official result data.',
  'above-distribution': 'Above every recorded score in the official result data.',
  'partial-bottom': 'The cautious end goes past the recorded result data.',
  'below-distribution': 'Below every recorded score in the official result data.',
  // INI-CET (crowd-sourced corrects→rank ladder spans ~110–160 corrects)
  'above-prior': 'At the very top of the estimate — top-rank territory.',
  'below-prior': 'Below the range the estimate can speak to (under ~110 corrects).',
  'spans-prior': 'Spans the full width the estimate can speak to.',
};

/** Plain-language transfer-mode line for the result context strip. */
export const TRANSFER_PLAIN: Record<string, string> = {
  NEET_PG:
    'Your GT fraction is mapped directly onto the official exam distribution — no Eyeconic-specific calibration exists yet.',
  INI_CET:
    'Corrects → percentile uses a crowd-sourced estimate (AIIMS publishes no marks); percentile → rank is exact official AIIMS data.',
};

/** Engine note strings that are shown elsewhere — never render twice. */
export const DUPLICATED_ENGINE_NOTES = [
  'Prediction assumes you attempted all questions and did not skip any questions in these Grand Tests.',
  'Estimate based on historical data. Actual exam performance and counselling outcomes may vary.',
];

/** Short in-context lines for known engine warnings; full text lives in Methodology. */
export const WARNING_SHORT: Record<string, string> = {
  CROWD_SOURCED_PRIOR:
    'The corrects → percentile step has no official data behind it — treat it as a rough estimate.',
  PRIOR_UR_ONLY:
    'Reserved category: the corrects → percentile step is weaker still (its priors cover UR only).',
  PROVISIONAL_WIDTHS: 'Range widths are provisional — they will sharpen as real outcomes are captured.',
};

/** Human sentences for the engine's assumption ids (method.assumptions). */
export const ASSUMPTION_TEXT: Record<string, string> = {
  'no-skip': 'You attempted every question in the entered Grand Tests (none skipped).',
  'full-length-standard-pattern': 'Each Grand Test was full-length and matched the exam pattern.',
  'difficulty-parity': 'Grand Tests are treated as comparable in difficulty to the actual exam.',
};

/** Branches coverage states (§12) in plain language. */
export const BRANCH_COVERAGE_TEXT: Record<string, string> = {
  MATCHED: 'Branches your range has historically corresponded to:',
  PARTIAL:
    'Your optimistic end matches historical cutoffs; the cautious end is beyond the last recorded allotment. The overlapping portion is shown.',
  BEYOND_LAST_CLOSING:
    'Your estimated range is beyond the last rank historically allotted in the covered years. This reflects current GT performance, not fate — add more GTs and keep preparing.',
  NO_DATA_FOR_FILTER: 'No counselling data for this combination in the covered years.',
};

// ---- Desired Branch Predictor (Feature 02 — reverse direction) -----------------

/**
 * D7 gap states in plain language. Colors follow the band-chip convention
 * (emerald = clears, amber = in range, rose = below); NO_CURRENT_DATA is a
 * neutral invite, not a verdict.
 */
export const GAP_META: Record<string, { label: string; hint: string; panel: string; dot: string }> = {
  ON_TRACK: {
    label: 'On track',
    hint: 'Your current average already clears even the tightest closing on record for this branch. Keep consolidating.',
    panel: 'bg-emerald-500/[0.07] border-emerald-500/25 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  WITHIN_REACH: {
    label: 'Within the historical range',
    hint: 'Your current average clears the loosest closing on record but not the tightest — the gap below tells you how far the safe end is.',
    panel: 'bg-amber-500/[0.07] border-amber-500/25 text-amber-200',
    dot: 'bg-amber-400',
  },
  BELOW_TARGET: {
    label: 'Below the historical range',
    hint: 'Your current average is below even the loosest closing on record for this branch. The gap below tells you how much is missing.',
    panel: 'bg-rose-500/[0.08] border-rose-500/25 text-rose-200',
    dot: 'bg-rose-400',
  },
  NO_CURRENT_DATA: {
    label: 'No current scores compared',
    hint: 'Add your recent Grand Test corrects (tap the button above) to see the gap between where you are and this target.',
    panel: 'bg-[#151E29] border-white/[0.08] text-[#CBD5E1]',
    dot: 'bg-[#4DD7C8]',
  },
};

/** Target-resolver coverage states (reverse flow) in plain language. */
export const TARGET_COVERAGE_TEXT: Record<string, string> = {
  MATCHED: 'Every counselling cycle on record closed this branch somewhere inside this range.',
  SINGLE_YEAR:
    'This branch has closing data in only one of the covered cycles — the range rests on a single counselling round set.',
  NO_DATA_FOR_FILTER:
    'This branch exists in the records, but nothing closed under your category and PwD selection. Check the category — it is never assumed.',
};

/** Reverse-resolver per-closing states in plain language. */
export const REQUIRED_STATE_TEXT: Record<string, string> = {
  'in-distribution': 'Exact lookup over the official score↔rank data.',
  'above-distribution':
    'Closed inside the top recorded scores — beyond what the official data can state a target for.',
  'in-ladder': 'Resolved through the crowd-sourced rank→marks ladder.',
  'above-ladder':
    'Closed above (better than) the best rung the crowd ladder can resolve — more than its top corrects were needed.',
  'below-ladder':
    'Closed beyond the ladder’s last rung — its floor corrects already cleared this historically.',
};

/** Short in-context lines for reverse-flow warnings (full text in Methodology). */
export const DESIRED_WARNING_SHORT: Record<string, string> = {
  HIGH_VARIABILITY:
    'The historical range for this branch is wide (loosest closing ≥ 2× the tightest) — the two ends imply very different targets.',
  CROWD_SOURCED_PRIOR:
    'The rank → marks step has no official data behind it (AIIMS publishes no INI-CET marks) — treat the corrects numbers as a rough estimate.',
  PRIOR_UR_ONLY:
    'Reserved category: the rank → marks step is weaker still (its priors cover UR only).',
};
