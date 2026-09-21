'use strict';

/**
 * Rank & Branch Predictor — engine configuration and method version.
 *
 * Spec: docs/RANK_AND_BRANCH_PREDICTOR.md (§3.5–§3.6 inputs, §5.3 formula
 * provenance, §5.4 tier ladder, §10 pattern versioning, §11 range width).
 *
 * Every numeric constant in this file is either (a) copied from a verified
 * source (spec decision, Phase 2 snapshot), or (b) explicitly marked
 * `provisional`. Provisional constants exist because Phase 3 must produce a
 * percentile RANGE while no Eyeconic GT data exists to calibrate against
 * (Phase 1 audit: zero grand tests, zero attempts). They are recorded here —
 * and echoed into every prediction's method block — so Phase 4/5 calibration
 * and Phase 11 recalibration have an exact baseline to adjust, and so nothing
 * numeric is ever silently invented inside the algorithm modules.
 */

/** Bump on ANY methodology change (assumption, formula, constant, threshold). */
const METHOD_VERSION = 'neetpg-branch-p6.v1';

/**
 * Exam registry (spec §2, §9, §10). Adding an exam = config + a strategy
 * module; the pipeline itself is exam-agnostic. INI-CET is registered so the
 * interface/registry shape is real, but marked unavailable until Phase 5 (M2).
 */
const EXAMS = {
  NEET_PG: {
    id: 'NEET_PG',
    label: 'NEET PG',
    available: true,
    milestone: 'M1',
    strategy: 'neetPg', // server/predictor/strategies/neetPg.js
    patternVersion: '800-scale (+4/-1)', // spec §10: MVP targets the 800-scale pattern
    pattern: { totalQuestions: 200, positive: 4, negative: 1, maxMarks: 800 },
    quotaScope: {
      supported: ['AIQ'], // MVP: All India Quota only (spec §3.6)
      label: 'All India Quota',
    },
    distribution: {
      // Phase 2 snapshot store — score↔rank bands over all 242,493 rows
      dir: 'distribution/neet-pg-2025/v1',
      snapshotId: 'DS-NEETPG-DISTRIBUTION-2025-v1',
      examYear: 2025,
    },
    counselling: [
      // Rank→branch inputs (consumed from Phase 6; listed for metadata echo)
      { dir: 'counselling/neet-pg-2024/v1', snapshotId: 'DS-NEETPG-COUNSELLING-2024-v1', examYear: 2024 },
      { dir: 'counselling/neet-pg-2025/v1', snapshotId: 'DS-NEETPG-COUNSELLING-2025-v1', examYear: 2025 },
    ],
  },
  INI_CET: {
    id: 'INI_CET',
    label: 'INI-CET',
    // LIVE since the M2 UI step (data Phase 1 + strategy Phase 5 + branches
    // Phase 6 all shipped; §13 INI-CET notes rendered by the client).
    available: true,
    milestone: 'M2',
    strategy: 'iniCet',
    methodVersion: 'inicet-branch-p6.v1',
    patternVersion: '200 marks (+1/-1/3)',
    pattern: { totalQuestions: 200, positive: 1, negative: 1 / 3, maxMarks: 200 },
    quotaScope: {
      supported: ['INI'], // §3.6: single counselling pool — no quota selection
      label: 'Single INI counselling pool',
    },
    distribution: {
      // M2 Phase 1 snapshot anchor — the SAME session the crowd prior's
      // runtime points were compiled for (2025-07), so prior↔official stay
      // session-coherent.
      dir: 'distribution/ini-cet-2025-07/v1',
      snapshotId: 'DS-INICET-DISTRIBUTION-202507-v1',
      session: '2025-07',
      examYear: 2025,
    },
    counselling: [
      // Final-state closing ranks per session (M2 Phase 1; complete round
      // sets only). Sessions are the counselling "years" for INI-CET — the
      // shared matcher tags them YYYYMM so Jan/Jul stay distinct.
      // 2026-01 added 2026-09-21 (manual-grab round set, Notifications
      // 327/2025 + 02/2026 + 69/2026). The distribution ANCHOR stays
      // 2025-07 (Option A) — only the branch-matching coverage extends.
      { session: '2023-01', snapshotId: 'DS-INICET-COUNSELLING-202301-v1', examYear: 2023 },
      { session: '2024-01', snapshotId: 'DS-INICET-COUNSELLING-202401-v1', examYear: 2024 },
      { session: '2024-07', snapshotId: 'DS-INICET-COUNSELLING-202407-v1', examYear: 2024 },
      { session: '2025-01', snapshotId: 'DS-INICET-COUNSELLING-202501-v1', examYear: 2025 },
      { session: '2025-07', snapshotId: 'DS-INICET-COUNSELLING-202507-v1', examYear: 2025 },
      { session: '2026-01', snapshotId: 'DS-INICET-COUNSELLING-202601-v1', examYear: 2026 },
    ],
    prior: {
      id: 'PR-INICET-HAZRA-CORRECTS-AIR-v1',
      file: 'priors/inicet/v1/hazra-corrects-air.json',
    },
  },
};

/** Canonical counselling categories (dictionary category-v1; spec §3.6 — never defaulted). */
const CATEGORIES = Object.freeze(['UR', 'EWS', 'OBC', 'SC', 'ST']);

/** GT input provenance tags (spec §6A). */
const PROVENANCE = Object.freeze({
  AUTO: 'auto-captured', // from app QuizAttempt records
  MANUAL: 'self-reported', // typed by the student
});

/**
 * Input rules (spec §3.5). No minimum and no maximum GT count — enforced as
 * `minGts: 1` + no upper bound, kept as config per §3.1, not hardcoded checks.
 */
const INPUT_RULES = Object.freeze({
  minGts: 1,
  maxGts: null, // unlimited
  requireFullLength: true, // §3.4 Assumption 2: GTs must match the exam pattern
  COMPLETED_ATTEMPT_STATUSES: ['completed', 'auto_submitted'], // Phase 1 audit §4
});

/**
 * GT aggregation (spec §3.3 — confirmed product default: mean of corrects).
 *
 * Robust-alternatives evaluation (spec §18 Phase 3 requirement): inspected
 * data has ZERO grand-test attempts (Phase 1 audit, 2026-09-19), so there is
 * no empirical basis to overturn the confirmed mean. Median and trimmed mean
 * are implemented in aggregation.js and reported with every prediction;
 * switching is a one-line config change. Decision recorded in
 * docs/RANK_PREDICTOR_PHASE3_REPORT.md; revisit at Phase 11 calibration.
 */
const AGGREGATION = Object.freeze({
  method: 'mean',
  alternativesImplemented: ['median', 'trimmedMean'],
  /** One value per GT (spec §3.3); versioned with the method (Phase 1 audit G3). */
  DEDUP_RULE_ID: 'one-per-gt-v1',
  DEDUP_RULE: 'latest completed attempt per GT, preferring an approved-and-used retest',
  /** Trimmed mean drops one min and one max; first defined at n >= 3. */
  TRIM_MIN_N: 3,
});

/**
 * Tier ladder (spec §5.4). Tier 1 is the launch mode — the Phase 1 audit
 * found zero GT attempts, so no cohort percentiles can exist yet.
 *
 * TIER2_MIN_COHORT is provisional: the spec's only anchor is "40 attempts do
 * not make a percentile" (§5.4), i.e. the threshold must sit comfortably
 * above 40. 100 is the documented default (a within-cohort percentile at
 * n=100 has ~±5pp binomial noise before any transfer error); configurable so
 * it can be re-set from inspected cohort sizes once GTs actually run.
 * APPROVED as the calibration baseline 2026-09-20 (product owner); re-set
 * only with inspected cohort evidence, never for launch reasons.
 */
const TRANSFER = Object.freeze({
  TIER1_RULE_ID: 'tier1-fraction-correct-parity-v1',
  TIER2_RULE_ID: 'tier2-gt-cohort-percentile-v1',
  TIER2_MIN_COHORT: 100,
  TIER2_MIN_COHORT_PROVISIONAL: true,
  /** Mid-rank percentile within a GT's completed-attempt cohort (documented definition). */
  COHORT_PERCENTILE_DEF: '(strictly-below + 0.5 * ties) / cohort-size',
});

/**
 * Range-width model (spec §11): width = f(GT count, GT dispersion).
 *
 *   halfWidth(n, sd) = min(MAX,
 *                           FLOOR + (SINGLE_GT − FLOOR)/√n + SPREAD_K × sd)
 *
 *  - 1/√n decay is the standard-error scaling of averaging n noisy
 *    measurements — the shape is statistics, not invention.
 *  - Provisional constants (corrects units, 200-question pattern):
 *      SINGLE_GT = 15 (±7.5pp on one noisy measurement + unknown parity error)
 *      FLOOR     = 5  (parity-transfer error is unknown even with many GTs;
 *                      the floor stays wide on purpose — spec §11)
 *      SPREAD_K  = 0.5 (a scattered GT set widens the range by half its SD —
 *                      makes consistency visible per §11)
 *      MAX       = 40 (guard so pathological dispersion cannot produce
 *                      absurd ranges; still ±20pp)
 *  - Inspected-data evidence for these values:
 *      scripts/phase3/calibration_report.js prints the percentile windows
 *      they produce across the official NBEMS 2025 distribution.
 *  - These are PROVISIONAL by design: exact widths are a Phase 4/5
 *    calibration deliverable (spec §11) and a Phase 11 recalibration target.
 *    They must never be narrowed for product/launch reasons (spec §18).
 *  - APPROVED as the calibration baseline 2026-09-20 (product owner);
 *    calibration with real Eyeconic data follows once GTs and outcome
 *    capture exist.
 */
const WIDTH_MODEL = Object.freeze({
  id: 'sqrt-decay-v1',
  provisional: true,
  params: Object.freeze({
    singleGtHalfWidthCorrects: 15,
    floorHalfWidthCorrects: 5,
    spreadCoefficient: 0.5,
    maxHalfWidthCorrects: 40,
  }),
});

/**
 * Branch possibility banding (spec §12 — "exact banding is an implementation
 * decision validated against the data"; validated here from the imported
 * counselling years).
 *
 * A seat-group is banded against the predicted rank range by its historical
 * closing rank CR (ranks: smaller = better):
 *
 *   COMFORTABLE   worst predicted rank ≤ CR        (even the pessimistic end
 *                                                  clears the historical close)
 *   WITHIN_RANGE  best ≤ CR < worst                (part of the range clears)
 *   BORDERLINE    CR < best ≤ CR×(1+BORDERLINE_MARGIN)
 *   ASPIRATIONAL  …            ≤ CR×(1+ASPIRATIONAL_CAP)
 *   (beyond)      excluded
 *
 * Margins are ratios grounded in observed 2024→2025 closing-rank drift over
 * the 5,872 exactly-keyed matched groups (evidence:
 * scripts/phase6/compute_band_margins.py): drift median 0.192, p75 0.324,
 * p95 0.668 — BORDERLINE_MARGIN 0.35 sits just above p75 ("3/4 of matched
 * groups historically moved less"); ASPIRATIONAL_CAP 0.75 sits beyond p95
 * (extreme-tail drift territory). Per-category drift is homogeneous
 * (p75 0.28–0.34), so one global margin set is used.
 *
 * Provisional like every constant here (matched subset = stable-string
 * programs; recalibrate at Phase 11 with real outcome data). Never widen or
 * narrow for launch reasons (spec §18).
 */
const BRANCH_BANDS = Object.freeze({
  BORDERLINE_MARGIN: 0.35,
  ASPIRATIONAL_CAP: 0.75,
  provisional: true,
  evidence: 'scripts/phase6/compute_band_margins.py (5,872 exactly-keyed 2024↔2025 groups: p75=0.324, p95=0.668)',
});

/** Soft, non-blocking low-data caution (spec §14). */
const LOW_GT_COUNT = Object.freeze({
  max: 2,
  note: 'Based on few Grand Tests. Add more GTs for a narrower, more reliable estimate.',
});

/**
 * Desired Branch Predictor (Feature 02 — docs/DESIRED_BRANCH_PREDICTOR.md).
 * Reverse-direction constants. Decisions D1–D7 APPROVED 2026-09-21.
 *
 * Method versions are separate from the forward feature's: the reverse
 * pipeline (branch → historical closing range → required corrects) must be
 * independently versioned so a stored reverse query can be re-derived exactly,
 * the same way forward predictions are.
 */
const DESIRED_BRANCH = Object.freeze({
  METHOD_VERSION_NEET_PG: 'desired-neetpg-v1',
  METHOD_VERSION_INI_CET: 'desired-inicet-v1',
  /**
   * Rule ids for the reverse rank→required-corrects step (versioned like the
   * tier rule ids in TRANSFER — part of every stored reverse result).
   */
  RULES: Object.freeze({
    NEET_PG_REQUIRED: 'neetpg-required-strict-tie-band-v1',
    INI_CET_REQUIRED: 'inicet-required-inverse-ladder-v1',
  }),
  /**
   * HIGH_VARIABILITY_RATIO flags target ranges whose loosest historical
   * closing is ≥ this multiple of the tightest (D1: ranges stay range-based;
   * this only drives an emphasis flag, never a state rule — see the D7
   * normative rules in the DBP spec).
   *
   * PROVISIONAL: with D2 (branch-only V1) the range spans the branch's
   * institutes as well as years, so institute spread dominates; 2× means the
   * two ends imply materially different required-corrects targets (the
   * matched-group year-drift evidence — p75 0.324, BRANCH_BANDS above — is
   * per-institute-group and much tighter than a branch-wide spread).
   * Recalibrate when institute scoping lands or with real outcome data;
   * never tune for presentation reasons (spec §18 discipline).
   */
  HIGH_VARIABILITY_RATIO: 2,
  HIGH_VARIABILITY_RATIO_PROVISIONAL: true,
  HIGH_VARIABILITY_NOTE:
    'The historical closing-rank range for this branch is wide (loosest closing is at least twice the tightest): the two ends imply materially different required-corrects targets. Scope expectations accordingly.',
});

/** Assumption + methodology note strings (spec §3.4, §13, §14) — engine-echoed, rendered by Phase 8 UI. */
const NOTES = Object.freeze({
  NO_SKIP:
    'Prediction assumes you attempted all questions and did not skip any questions in these Grand Tests.',
  FULL_LENGTH:
    'Entered scores are treated as full-length Grand Tests matching the NEET PG pattern (200 questions, +4/−1).',
  DIFFICULTY_PARITY:
    'Grand Tests are assumed comparable in difficulty to the actual exam; this estimate has no Eyeconic-specific calibration yet.',
  ESTIMATE_DISCLAIMER:
    'Estimate based on historical data. Actual exam performance and counselling outcomes may vary.',
  PROVISIONAL_WIDTHS:
    'Range widths are provisional until calibrated against real Eyeconic outcomes.',
  PERCENTILE_DEF:
    'Percentile = 100 × (1 − rank / 230,096 scored candidates), per the official NBEMS 2025 result distribution (DS-NEETPG-DISTRIBUTION-2025-v1).',
});

module.exports = {
  METHOD_VERSION,
  EXAMS,
  CATEGORIES,
  PROVENANCE,
  INPUT_RULES,
  AGGREGATION,
  TRANSFER,
  WIDTH_MODEL,
  BRANCH_BANDS,
  LOW_GT_COUNT,
  DESIRED_BRANCH,
  NOTES,
};
