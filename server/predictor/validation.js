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
 * Exam resolution shared by both directions (forward §3.5–§3.6 and the
 * Desired Branch reverse flow, DBP §6.1). Extracted verbatim from
 * validateRequest — same errors, same order.
 * @returns {object} EXAMS entry
 */
function resolveExam(request) {
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
  return exam;
}

/**
 * GT-list validation shared by both directions (§3.5 rules). In the reverse
 * flow the list is OPTIONAL — callers invoke this only when `gts` is present,
 * and the same rules then apply unchanged (an empty array is an error in both
 * directions, never a silent no-current-data).
 * @returns {Array} normalized GT entries
 */
function validateGts(request, exam) {
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
  return gts.map((gt, gtIndex) => validateGtEntry(gt, gtIndex, patternTotal));
}

/**
 * @param {object} request raw prediction request
 * @param {object} [patternOverride] legacy pattern profile (config
 *   EXAMS.*.patternHistory entry's pattern) — used ONLY when re-deriving a
 *   stored prediction/query under the method version that served it; new
 *   requests always validate against the exam's CURRENT pattern.
 * @returns {{exam: object, category: {value: string, pwd: boolean}|null,
 *            quota: string, quotaDefaulted: boolean, gts: Array}} normalized context
 * @throws {PredictorError} INVALID_INPUT / EXAM_NOT_AVAILABLE
 */
function validateRequest(request, patternOverride) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw invalidInput('Prediction request must be an object.', { field: 'request' });
  }

  // --- exam (§2: registry-driven; unavailable exams fail explicitly) ---
  const resolved = resolveExam(request);
  // Pattern override (§10 pattern history): same exam identity/rules, the
  // pattern that was in force when the stored record was served.
  const exam = patternOverride ? { ...resolved, pattern: patternOverride } : resolved;

  // --- GT list (§3.5) ---
  const normalizedGts = validateGts(request, exam);

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

/**
 * Desired Branch Predictor request validation (DBP §6.1; D1–D7 approved).
 *
 * Reverse-direction differences from the forward contract:
 *  - branchKey is required (normalized defensively later by the resolver);
 *  - category is REQUIRED here — closing ranks are category-specific (§3.6's
 *    never-defaulted rule applies from the start, not just at the branch
 *    stage);
 *  - gts is OPTIONAL (only the optional gap stage needs a current average);
 *    when present, the exact forward §3.5 rules apply;
 *  - quota is NOT an input: the exam's single counselling pool is echoed.
 *
 * @returns {{exam: object, branchKey: string, category: {value, pwd},
 *            quota: string, gts: Array|null}}
 * @throws {PredictorError} INVALID_INPUT / EXAM_NOT_AVAILABLE
 */
function validateDesiredBranchRequest(request, patternOverride) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw invalidInput('Prediction request must be an object.', { field: 'request' });
  }

  const resolved = resolveExam(request);
  // Pattern override (§10 pattern history) — stored reverse queries only.
  const exam = patternOverride ? { ...resolved, pattern: patternOverride } : resolved;

  // --- branch (catalog key; whitespace tolerated, then trimmed) ---
  if (typeof request.branchKey !== 'string' || !request.branchKey.trim()) {
    throw invalidInput('Select the branch you are targeting.', { field: 'branchKey' });
  }
  const branchKey = request.branchKey.trim();

  // --- category / PwD (required — never defaulted) ---
  if (request.category === undefined || request.category === null || request.category === '') {
    throw invalidInput(
      'Category is required to target a branch (UR / EWS / OBC / SC / ST).',
      { field: 'category' }
    );
  }
  if (!CATEGORIES.includes(request.category)) {
    throw invalidInput(
      `Category must be one of ${CATEGORIES.join(', ')} (got '${request.category}').`,
      { field: 'category' }
    );
  }
  if (request.pwd !== undefined && typeof request.pwd !== 'boolean') {
    throw invalidInput('pwd must be true or false.', { field: 'pwd' });
  }
  const category = { value: request.category, pwd: request.pwd === true };

  // --- optional current GTs: absent/null means no gap; present means the
  //     exact forward §3.5 rules (empty array rejected, same message) ---
  const gts = request.gts === undefined || request.gts === null
    ? null
    : validateGts(request, exam);

  // --- quota: echo only; a conflicting explicit quota is rejected with the
  //     forward feature's scope message (never silently ignored) ---
  const quota = exam.quotaScope.supported[0];
  if (request.quota !== undefined && request.quota !== null && request.quota !== quota) {
    throw invalidInput(
      `${exam.label} predictions currently cover ${exam.quotaScope.label} only (${exam.quotaScope.supported.join(', ')}).`,
      { field: 'quota', quota: request.quota }
    );
  }

  return { exam, branchKey, category, quota, gts };
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
  validateDesiredBranchRequest,
  validateForBranches,
  resolveExam,
  toEpochMs,
};
