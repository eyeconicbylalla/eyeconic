'use strict';

const {
  EXAMS,
  CATEGORIES,
  PROVENANCE,
  INPUT_RULES,
} = require('./config');
const { invalidInput, examNotAvailable } = require('./errors');

/**
 * GT input validation — spec §3.5 (GT rules) and §3.6 (category/quota).
 *
 * Contract notes:
 *  - Values outside bounds are REJECTED with a clear message, never clamped
 *    (§3.5 "Impossible values").
 *  - No minimum beyond ≥1 GT and no maximum (§3.1) — driven by INPUT_RULES.
 *  - Category is optional at the percentile stage (AIR is category-agnostic,
 *    §3.6) and NEVER defaulted; validateForBranches() enforces presence for
 *    the branch stage (Phase 6).
 *  - Quota: MVP is AIQ-only. Absent quota is echoed as AIQ explicitly
 *    (spec §3.6 allows this default for quota — the no-default rule applies
 *    to category only).
 *
 * Input shape (Phase 7's API maps app QuizAttempt records into this):
 *  {
 *    exam: 'NEET_PG',
 *    gts: [{
 *      gtId?: string,                       // present for auto-captured GTs
 *      provenance: 'auto-captured' | 'self-reported',
 *      attempts: [{
 *        corrects: number,                  // integer, 0..totalQuestions
 *        totalQuestions?: number,           // default: exam pattern total
 *        status?: string,                   // dedup keeps completed statuses only
 *        endedAt?: number | string | Date,  // epoch ms | ISO | Date
 *        retestApprovedUsed?: boolean,
 *        skippedCount?: number,
 *      }]
 *    }],
 *    category?: 'UR'|'EWS'|'OBC'|'SC'|'ST', pwd?: boolean,
 *    quota?: 'AIQ',
 *  }
 */

const PROVENANCE_VALUES = Object.values(PROVENANCE);

function isInteger(n) {
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n);
}

/** Normalize endedAt to epoch-ms (null when absent/unparseable — dedup treats null as oldest). */
function toEpochMs(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (isInteger(value)) return value; // already epoch ms
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * @param {object} request raw prediction request
 * @returns {{exam: object, category: {value: string, pwd: boolean}|null,
 *            quota: string, quotaDefaulted: boolean, gts: Array}} normalized context
 * @throws {PredictorError} INVALID_INPUT / EXAM_NOT_AVAILABLE
 */
function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw invalidInput('Prediction request must be an object.', { field: 'request' });
  }

  // --- exam (§2: registry-driven; unavailable exams fail explicitly) ---
  const examId = request.exam;
  if (typeof examId !== 'string' || !EXAMS[examId]) {
    throw invalidInput(
      `Unknown exam '${String(examId)}'. Supported: ${Object.keys(EXAMS).join(', ')}.`,
      { field: 'exam' }
    );
  }
  const exam = EXAMS[examId];
  if (!exam.available) {
    throw examNotAvailable(
      `${exam.label} is scaffolded but not implemented yet — it lands in milestone ${exam.milestone} (spec §9, §18).`,
      { field: 'exam', exam: examId, milestone: exam.milestone }
    );
  }

  // --- GT list (§3.5) ---
  const gts = request.gts;
  if (!Array.isArray(gts)) {
    throw invalidInput('gts must be an array of Grand Test entries.', { field: 'gts' });
  }
  if (gts.length < INPUT_RULES.minGts) {
    throw invalidInput('Enter at least one Grand Test score.', { field: 'gts', count: gts.length });
  }
  if (INPUT_RULES.maxGts !== null && gts.length > INPUT_RULES.maxGts) {
    throw invalidInput(`At most ${INPUT_RULES.maxGts} Grand Tests per prediction.`, { field: 'gts' });
  }

  const patternTotal = exam.pattern.totalQuestions;
  const normalizedGts = gts.map((gt, gtIndex) => validateGtEntry(gt, gtIndex, patternTotal));

  // --- category / PwD (§3.6: optional here, never defaulted, enum-checked) ---
  let category = null;
  if (request.category !== undefined && request.category !== null) {
    if (!CATEGORIES.includes(request.category)) {
      throw invalidInput(
        `Category must be one of ${CATEGORIES.join(', ')} (got '${request.category}').`,
        { field: 'category' }
      );
    }
    if (request.pwd !== undefined && typeof request.pwd !== 'boolean') {
      throw invalidInput('pwd must be true or false.', { field: 'pwd' });
    }
    category = { value: request.category, pwd: request.pwd === true };
  } else if (request.pwd !== undefined) {
    throw invalidInput(
      'pwd was provided without a category — category is required to interpret PwD status.',
      { field: 'category' }
    );
  }

  // --- quota (§3.6: MVP AIQ-only; absence is an explicit AIQ echo, not a silent default) ---
  let quota = exam.quotaScope.supported[0];
  let quotaDefaulted = true;
  if (request.quota !== undefined && request.quota !== null) {
    if (!exam.quotaScope.supported.includes(request.quota)) {
      throw invalidInput(
        `${exam.label} predictions currently cover ${exam.quotaScope.label} only (${exam.quotaScope.supported.join(', ')}).`,
        { field: 'quota', quota: request.quota }
      );
    }
    quota = request.quota;
    quotaDefaulted = false;
  }

  return { exam, category, quota, quotaDefaulted, gts: normalizedGts };
}

function validateGtEntry(gt, gtIndex, patternTotal) {
  const where = { field: `gts[${gtIndex}]` };
  if (!gt || typeof gt !== 'object' || Array.isArray(gt)) {
    throw invalidInput('Each Grand Test entry must be an object.', where);
  }
  if (!PROVENANCE_VALUES.includes(gt.provenance)) {
    throw invalidInput(
      `Each Grand Test must be tagged '${PROVENANCE.AUTO}' or '${PROVENANCE.MANUAL}'.`,
      { ...where, field: `gts[${gtIndex}].provenance` }
    );
  }
  if (gt.gtId !== undefined && gt.gtId !== null && typeof gt.gtId !== 'string') {
    throw invalidInput('gtId must be a string.', { ...where, field: `gts[${gtIndex}].gtId` });
  }
  if (gt.provenance === PROVENANCE.AUTO && (gt.gtId === undefined || gt.gtId === null)) {
    throw invalidInput(
      `Auto-captured Grand Tests must carry their gtId (needed for the one-value-per-GT rule and cohort lookup).`,
      where
    );
  }
  if (!Array.isArray(gt.attempts) || gt.attempts.length < 1) {
    throw invalidInput('Each Grand Test needs at least one attempt.', { ...where, field: `gts[${gtIndex}].attempts` });
  }

  const attempts = gt.attempts.map((a, aIndex) => validateAttempt(a, gtIndex, aIndex, patternTotal));

  // §3.5 consistency: prediction proceeds on completed attempts only — an
  // entry with none is unusable, not silently dropped (that would change n).
  const completed = attempts.filter((a) => INPUT_RULES.COMPLETED_ATTEMPT_STATUSES.includes(a.status));
  if (completed.length < 1) {
    throw invalidInput(
      `Grand Test ${gt.gtId || gtIndex + 1} has no completed attempt (statuses counted: ${INPUT_RULES.COMPLETED_ATTEMPT_STATUSES.join(', ')}).`,
      { ...where, field: `gts[${gtIndex}].attempts` }
    );
  }

  return {
    gtId: gt.gtId === undefined ? null : gt.gtId,
    provenance: gt.provenance,
    attempts,
  };
}

function validateAttempt(attempt, gtIndex, aIndex, patternTotal) {
  const field = (name) => ({ field: `gts[${gtIndex}].attempts[${aIndex}].${name}` });
  if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
    throw invalidInput('Each attempt must be an object.', field(''));
  }

  // totalQuestions first — it bounds corrects (§3.5 upper bound).
  let totalQuestions = patternTotal;
  if (attempt.totalQuestions !== undefined && attempt.totalQuestions !== null) {
    if (!isInteger(attempt.totalQuestions) || attempt.totalQuestions < 1) {
      throw invalidInput('totalQuestions must be a positive whole number.', field('totalQuestions'));
    }
    if (INPUT_RULES.requireFullLength && attempt.totalQuestions !== patternTotal) {
      throw invalidInput(
        `Grand Tests must be full-length, matching the selected exam's pattern (${patternTotal} questions). Got totalQuestions=${attempt.totalQuestions}.`,
        field('totalQuestions')
      );
    }
    totalQuestions = attempt.totalQuestions;
  }

  if (!isInteger(attempt.corrects)) {
    throw invalidInput(
      'Correct count must be a whole number (no text, no decimals).',
      field('corrects')
    );
  }
  if (attempt.corrects < 0) {
    throw invalidInput('Correct count cannot be negative.', field('corrects'));
  }
  if (attempt.corrects > totalQuestions) {
    throw invalidInput(
      `Correct count (${attempt.corrects}) cannot exceed the test's ${totalQuestions} questions.`,
      field('corrects')
    );
  }

  if (attempt.status !== undefined && attempt.status !== null && typeof attempt.status !== 'string') {
    throw invalidInput('status must be a string.', field('status'));
  }
  if (attempt.retestApprovedUsed !== undefined && typeof attempt.retestApprovedUsed !== 'boolean') {
    throw invalidInput('retestApprovedUsed must be true or false.', field('retestApprovedUsed'));
  }
  let skippedCount = 0;
  if (attempt.skippedCount !== undefined && attempt.skippedCount !== null) {
    if (!isInteger(attempt.skippedCount) || attempt.skippedCount < 0) {
      throw invalidInput('skippedCount must be a whole number ≥ 0.', field('skippedCount'));
    }
    skippedCount = attempt.skippedCount;
  }

  return {
    corrects: attempt.corrects,
    totalQuestions,
    status: attempt.status === undefined || attempt.status === null ? 'completed' : attempt.status,
    endedAt: toEpochMs(attempt.endedAt),
    retestApprovedUsed: attempt.retestApprovedUsed === true,
    skippedCount,
  };
}

/**
 * §3.6 branch-stage gate (consumed by Phase 6): category must be present and
 * canonical by the time branches are resolved — never defaulted.
 */
function validateForBranches(ctx) {
  if (!ctx.category) {
    throw invalidInput(
      'Category is required to predict possible branches (UR / EWS / OBC / SC / ST).',
      { field: 'category' }
    );
  }
  return ctx.category;
}

module.exports = {
  validateRequest,
  validateForBranches,
  toEpochMs,
};
