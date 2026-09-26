'use strict';

const store = require('./store');
const { EXAMS, READINESS, DESIRED_BRANCH, AGGREGATION, PROVENANCE } = require('./config');
const {
  invalidInput,
  dataIntegrity,
  inputModeConflict,
  scoreOutOfRange,
} = require('./errors');
const { resolveExam, toEpochMs } = require('./validation');
const { scoreForCorrects, correctsForScore } = require('./transfer');
const { buildStrategies } = require('./strategies');
const { buildDistributionModel } = require('./distributionModel');
const { buildPatternBridge } = require('./patternBridge');
const { buildPriorModel } = require('./inicetTransfer');
const {
  requiredCorrectsNeetPg,
  requiredCorrectsIniCet,
} = require('./desiredBranch');
const { deriveReadinessAnchors } = require('./readinessAnchors');
const readinessCalendar = require('./readinessCalendar');

/**
 * Readiness Score — domain engine (Feature 09, docs/READINESS_SCORE.md §9–§11;
 * decisions R1–R9 approved 2026-09-26 §25).
 *
 * The §10 pipeline, verbatim:
 *
 *   1. c̄       ← aggregate.mean(corrects of GT rows)          [aggregation.js]
 *                (score mode: each row converted FIRST via the exact inverse
 *                transfer.correctsForScore + nearest-corrects rounding, R5)
 *   2. standing ← existing strategy estimate for c̄             [strategies/*]
 *   3. session  ← calendar.resolve(exam, now [, session])       [readinessCalendar]
 *   4. months   ← daysRemaining / 30.44                         [§8; owned by the calendar]
 *   5. anchors  ← per anchor A: R_A from the Phase-1 golden derivation
 *                (readinessAnchors.js), req_A from the DBP reverse resolvers
 *                with degenerate closingRanks=[R_A, R_A]        [desiredBranch.js]
 *   6. target   ← anchors[READINESS.DEFAULT_ANCHOR]             [config, R1]
 *   7. G        ← req_default − c̄                               (may be ≤ 0)
 *   8. B        ← floor(RATE × min(months, CAP_MONTHS))         [§9.4, R3 provisional]
 *   9. state    ← G≤0 READY · G≤B MODERATELY_READY · else BARELY_READY
 *  10. annotate ← G > 2×B ⇒ SIGNIFICANT_GAP note (display-only, R4)
 *  11. assemble ← method block + explanation + merged warnings/notes
 *
 * Step 12 (persist-before-serve) is Phase 4's API layer — like the forward
 * predictor, resultHash is computed over the stored stages at the route, not
 * here. This module is pure engine layer: it imports config/errors and the
 * predictor data foundation only, NEVER routes or models (§14.2), and touches
 * no forward-predictor code (FR-8; the only permitted engine edit — the R9
 * null-AIR guard in inicetTransfer.js — landed separately with its own
 * regression test).
 *
 * REUSED SURFACES ONLY (§13, phase risk item): strategy.validate is NOT
 * re-implemented here — readiness normalizes its simpler rows into the exact
 * validated/aggregation shapes the strategies already consume, then calls
 * strategy.aggregate / estimatePercentileRange / resolveRankRange and the DBP
 * requiredCorrects* resolvers. Coupling is to those exported signatures only.
 *
 * Determinism (FR-10): the record contains no clock reads — every time
 * quantity derives from the caller-injected `now` (default: the real clock at
 * request time), so identical (request, calendar state, method version)
 * produce a byte-identical result.
 *
 * NEET PG 180-question pin (§5.3): every question count, mark bound, and
 * lattice step in this file is read from EXAMS.<exam>.pattern — the literal
 * string '180' (or 200/720) must never appear in a readiness computation.
 * Pinned by tests/predictor/readiness.test.js.
 */

/** Float tolerance for lattice comparisons (thirds of a mark etc.). */
const EPS = 1e-9;

const STATES = Object.freeze(['READY', 'MODERATELY_READY', 'BARELY_READY']);

const PROVENANCE_VALUES = Object.values(PROVENANCE);

// ---------------------------------------------------------------------------
// Input validation (§18.1) — typed, field-scoped, never clamped
// ---------------------------------------------------------------------------

/** A score input counts as "valued" only when it carries a usable value. */
function scoreIsValued(score) {
  if (score === undefined || score === null) return false;
  if (typeof score !== 'object') {
    throw invalidInput('score must be an object like { value } (or an array of such rows).', {
      field: 'score',
    });
  }
  const rows = Array.isArray(score) ? score : [score];
  return rows.some(
    (row) =>
      row &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      !(
        row.value === undefined ||
        row.value === null ||
        (typeof row.value === 'string' && !row.value.trim())
      )
  );
}

function parseNumeric(raw, field) {
  const v = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw invalidInput('Enter a number (no text).', { field });
  }
  return v;
}

/**
 * Corrects-mode rows → [{ corrects, provenance, attemptedAt, gtId }].
 * Empty/whitespace rows are skipped (predictor convention, §18.1); at least
 * one usable row must remain.
 */
function validateCorrectsRows(gts, exam) {
  if (!Array.isArray(gts)) {
    throw invalidInput('gts must be an array of Grand Test rows.', { field: 'gts' });
  }
  const pattern = exam.pattern;
  const usable = [];
  gts.forEach((row, i) => {
    if (row === null || row === undefined) return; // skipped
    if (typeof row !== 'object' || Array.isArray(row)) {
      throw invalidInput('Each Grand Test row must be an object with a corrects value.', {
        field: `gts[${i}]`,
      });
    }
    const raw = row.corrects;
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return; // skipped
    const c = parseNumeric(raw, `gts[${i}].corrects`);
    if (!Number.isInteger(c)) {
      throw invalidInput('Correct count must be a whole number (no decimals).', {
        field: `gts[${i}].corrects`,
      });
    }
    if (c < 0) {
      throw invalidInput('Correct count cannot be negative.', { field: `gts[${i}].corrects` });
    }
    if (c > pattern.totalQuestions) {
      // Bound read from the pattern — never a literal (the 180-question pin).
      throw invalidInput(
        `Correct count (${c}) cannot exceed the exam's ${pattern.totalQuestions} questions.`,
        { field: `gts[${i}].corrects`, max: pattern.totalQuestions }
      );
    }
    let provenance = PROVENANCE.MANUAL;
    if (row.provenance !== undefined && row.provenance !== null) {
      if (!PROVENANCE_VALUES.includes(row.provenance)) {
        throw invalidInput(
          `Grand Test provenance must be '${PROVENANCE.AUTO}' or '${PROVENANCE.MANUAL}'.`,
          { field: `gts[${i}].provenance` }
        );
      }
      provenance = row.provenance;
    }
    usable.push({
      corrects: c,
      provenance,
      attemptedAt: row.attemptedAt === undefined ? null : row.attemptedAt,
      gtId: row.gtId === undefined ? null : row.gtId,
    });
  });
  if (usable.length === 0) {
    throw invalidInput('Enter at least one Grand Test score.', { field: 'gts' });
  }
  return usable;
}

/**
 * Score-mode rows → [{ value, corrects, onLattice, residueMarks, source }].
 * Accepts the §15 single-row body ({ value, source? }) and an array of such
 * rows (§3 "one or more score rows"; §10 "each row converted first") — the
 * Phase-4 API normalizes its wire body into this shape. Bounds and lattice
 * are pattern-derived: min = −negative×totalQuestions, max = maxMarks, and
 * the lattice step per correct is (positive + negative) marks (§5.3/§6.3).
 */
function validateScoreRows(score, exam) {
  const list = Array.isArray(score) ? score : [score];
  const pattern = exam.pattern;
  const min = -(pattern.negative * pattern.totalQuestions);
  const max = pattern.maxMarks;
  const step = pattern.positive + pattern.negative; // marks per additional correct
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
  const usable = [];
  list.forEach((row, i) => {
    const field = Array.isArray(score) ? `score[${i}].value` : 'score.value';
    if (row === null || row === undefined) return; // skipped
    if (typeof row !== 'object' || Array.isArray(row)) {
      throw invalidInput('Each score row must be an object like { value }.', { field });
    }
    const raw = row.value;
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return; // skipped
    const v = parseNumeric(raw, field);
    if (v < min || v > max) {
      throw scoreOutOfRange(
        `Score must be between ${fmt(min)} and ${fmt(max)} marks for ${exam.label}.`,
        { field: 'score', min, max, value: v }
      );
    }
    // Exact inverse (§5.3/§6.3) + nearest-corrects rounding (R5).
    const exact = correctsForScore(v, pattern);
    const corrects = Math.round(exact);
    const latticeScore = scoreForCorrects(corrects, pattern);
    const residue = Math.abs(v - latticeScore);
    usable.push({
      value: v,
      corrects,
      onLattice: residue < EPS,
      residueMarks: Math.round(residue * 1000) / 1000,
      source: row.source === undefined ? null : row.source,
    });
  });
  if (usable.length === 0) {
    throw invalidInput('Enter a Grand Test score.', { field: 'score' });
  }
  return usable;
}

// ---------------------------------------------------------------------------
// Anchor ladder (§10 step 5) — golden ranks through the DBP reverse resolvers
// ---------------------------------------------------------------------------

/**
 * req_A per anchor: the existing reverse resolver on the degenerate range
 * [R_A, R_A]. NEET PG: official distribution + fraction-parity bridge; INI-CET:
 * the inverse crowd ladder (below-ladder closings get the conservative floor,
 * above-ladder closings get an open-ended null — DBP D7 semantics, reused
 * as-is, §18.5).
 */
function buildAnchorLadder(examId, anchors, deps) {
  const exam = EXAMS[examId];
  let resolveOne;
  let reverseMeta;
  if (examId === 'NEET_PG') {
    const distModel = deps.distributionModel();
    resolveOne = (rank) =>
      requiredCorrectsNeetPg({
        closingRanks: [rank, rank],
        distModel,
        pattern: exam.pattern,
        patternVersion: exam.patternVersion,
        bridge: deps.bridge(),
        ruleId: DESIRED_BRANCH.RULES.NEET_PG_REQUIRED,
      });
    reverseMeta = {
      rule: DESIRED_BRANCH.RULES.NEET_PG_REQUIRED,
      distribution: { snapshotId: distModel.snapshotId, numericPairs: distModel.numericPairs },
    };
  } else {
    const priorModel = deps.priorModel();
    resolveOne = (rank) =>
      requiredCorrectsIniCet({
        closingRanks: [rank, rank],
        priorModel,
        pattern: exam.pattern,
      });
    reverseMeta = {
      rule: DESIRED_BRANCH.RULES.INI_CET_REQUIRED,
      prior: { priorId: priorModel.priorId, correctsSpan: [...priorModel.correctsSpan] },
    };
  }

  return Object.values(anchors).map((anchor) => {
    const resolved = resolveOne(anchor.rank).perClosing[0];
    return {
      id: anchor.id,
      role: anchor.role,
      rank: anchor.rank,
      definition: anchor.definition,
      requiredCorrects: resolved.corrects, // integer, or null when open-ended (above-ladder)
      requiredState: resolved.state, // in-distribution | in-ladder | below-ladder | above-ladder
      bounded: resolved.bounded,
      ...(resolved.ladderEndCorrects !== undefined
        ? { ladderEndCorrects: resolved.ladderEndCorrects }
        : {}),
      ...(resolved.note ? { note: resolved.note } : {}),
      source: anchor.source,
      evidence: anchor.evidence || null,
      reverse: reverseMeta,
    };
  });
}

// ---------------------------------------------------------------------------
// §10 pipeline
// ---------------------------------------------------------------------------

/** Round for display without float noise. */
function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** §8 display convention: "< 1 month ⇒ days only; otherwise both". */
function timeRemainingText(daysRemaining, monthsRemaining) {
  if (daysRemaining < readinessCalendar.DAYS_PER_MONTH) return `${daysRemaining} days`;
  return `${round(monthsRemaining, 1)} months (${daysRemaining} days)`;
}

/** Merge warning objects by code, preserving first-seen order (DBP Phase-3 convention). */
function mergeWarnings(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const w of group || []) {
      if (!seen.has(w.code)) {
        seen.add(w.code);
        out.push({ code: w.code, note: w.note });
      }
    }
  }
  return out;
}

/** Merge note strings by exact value, preserving first-seen order. */
function mergeNotes(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const n of group || []) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/**
 * Compute a readiness result (§10 steps 1–11). Phase 4 persists it
 * (persist-before-serve, R8) and computes resultHash over the stored stages.
 *
 * @param {object} request { exam, gts?: rows, score?: {value,source?}|rows, session? }
 *   — gts rows: { corrects, provenance?, attemptedAt?, gtId? } (§15)
 *   — score rows normalize to one-or-more { value, source? } entries (§3/§10)
 * @param {object} [opts]
 *   now:  injectable clock (Date | ISO | epoch ms) — tests pin this; default
 *         is the real clock, read ONCE per request
 *   deps: injectable { strategies, anchors, distributionModel, bridge,
 *         priorModel } — defaults are the committed-store wiring (tests)
 * @returns {object} deterministic, JSON-serializable readiness record
 * @throws {PredictorError} INVALID_INPUT | EXAM_NOT_AVAILABLE |
 *   INPUT_MODE_CONFLICT | SCORE_OUT_OF_RANGE | NO_UPCOMING_EXAM | DATA_INTEGRITY
 */
function computeReadiness(request, opts = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw invalidInput('Readiness request must be an object.', { field: 'request' });
  }

  // --- exam (canonical registry resolution — same errors as the predictor) ---
  const exam = resolveExam(request);
  const pattern = exam.pattern;

  // --- input mode: exactly one of gts / score valued (FR-2, §18.1) ---
  const gtsValued = request.gts !== undefined && request.gts !== null;
  const scoreValued = scoreIsValued(request.score);
  if (gtsValued && scoreValued) {
    throw inputModeConflict('Enter either Grand Test corrects or a score — not both.', {
      field: 'gts',
    });
  }
  if (!gtsValued && !scoreValued) {
    throw inputModeConflict('Enter either Grand Test corrects or a score.', { field: 'gts' });
  }

  const mode = gtsValued ? 'corrects' : 'score';
  let correctsRows = null;
  let scoreRows = null;
  if (gtsValued) {
    correctsRows = validateCorrectsRows(request.gts, exam);
  } else {
    scoreRows = validateScoreRows(request.score, exam);
    correctsRows = scoreRows.map((r) => ({
      // §10 step 1: score rows are converted FIRST (exact inverse + rounding);
      // the residue accounting rides along in input.scoreRows.
      corrects: r.corrects,
      provenance: PROVENANCE.MANUAL,
      attemptedAt: null,
      gtId: null,
    }));
  }

  // --- §10 step 3: calendar resolution (cheap + pure; also validates an
  //     explicit session against the §18.1 rules) ---
  const session = readinessCalendar.resolve(exam.id, opts.now, { session: request.session });

  // --- §10 step 1: aggregate through the SHARED module. Each row is one GT
  //     with one completed, full-length, no-skip attempt (the inherited
  //     assumption — skippedCount 0, totalQuestions from the pattern) ---
  const deps = opts.deps || defaultDeps;
  const strategy = deps.strategies()[exam.id];
  const gtEntries = correctsRows.map((r) => ({
    gtId: r.gtId,
    provenance: r.provenance,
    attempts: [
      {
        corrects: r.corrects,
        totalQuestions: pattern.totalQuestions,
        status: 'completed',
        endedAt: r.attemptedAt === null ? null : toEpochMs(r.attemptedAt),
        retestApprovedUsed: false,
        skippedCount: 0,
      },
    ],
  }));
  const validated = {
    exam,
    category: null, // R6: readiness V1 is category-agnostic (§6.5 caveat note)
    quota: exam.quotaScope.supported[0],
    quotaDefaulted: true,
    gts: gtEntries,
  };
  const aggregation = strategy.aggregate(validated);
  const cBar = aggregation.stats.mean;

  // --- §10 step 2: current standing via the existing strategy estimate ---
  const estimate = strategy.estimatePercentileRange({ validated, aggregation });
  const rank = strategy.resolveRankRange({ validated, estimate });

  // --- §10 steps 4+8: time allowance (R3 — provisional, config-owned) ---
  const rate = READINESS.TIME_ALLOWANCE.RATE_CORRECTS_PER_MONTH[exam.id];
  const months = session.monthsRemaining; // §8 definition owned by the calendar module
  const cappedMonths = Math.min(months, READINESS.TIME_ALLOWANCE.CAP_MONTHS);
  const budget = Math.floor(rate * cappedMonths);

  // --- §10 step 5: anchor ladder (golden ranks → required corrects) ---
  const ladder = buildAnchorLadder(exam.id, deps.anchors()[exam.id], deps);

  // --- §10 steps 6–7: target anchor + gap ---
  const target = ladder.find((a) => a.id === READINESS.DEFAULT_ANCHOR);
  if (!target) {
    throw dataIntegrity(
      `Readiness config names default anchor '${READINESS.DEFAULT_ANCHOR}' but the derived ${exam.id} ladder does not contain it.`,
      { exam: exam.id, defaultAnchor: READINESS.DEFAULT_ANCHOR }
    );
  }
  if (!Number.isInteger(target.requiredCorrects)) {
    throw dataIntegrity(
      `Default anchor '${target.id}' resolved state '${target.requiredState}' (no finite required corrects) — readiness cannot compute the gap.`,
      { exam: exam.id, anchor: target.id, requiredState: target.requiredState }
    );
  }
  const gapCorrects = target.requiredCorrects - cBar; // §10: may be ≤ 0

  // --- §10 steps 9–10: state + annotation (exact boundary semantics) ---
  const state =
    gapCorrects <= 0 ? 'READY' : gapCorrects <= budget ? 'MODERATELY_READY' : 'BARELY_READY';
  const significantGap = gapCorrects > READINESS.SIGNIFICANT_GAP_FACTOR * budget;

  // --- §10 step 11: assemble ---
  const projectedScore = scoreForCorrects(cBar, pattern); // exact pattern arithmetic (§5.4/§6.2)

  const readinessNotes = [];
  if (scoreRows && scoreRows.some((r) => !r.onLattice)) {
    readinessNotes.push(READINESS.NOTES.SCORE_OFF_LATTICE);
    // R5 strain threshold, implemented exactly as specified: residue > half a
    // correct in marks. Under nearest-corrects rounding the residue is bounded
    // by half a step by construction, so this fires only for float-edge ties —
    // documented in the Phase 3 report; changing > to >= needs owner approval.
    const halfStep = (pattern.positive + pattern.negative) / 2;
    if (scoreRows.some((r) => r.residueMarks > halfStep + EPS)) {
      readinessNotes.push(READINESS.NOTES.NO_SKIP_ASSUMPTION_STRAINED);
    }
  }
  if (exam.id === 'INI_CET') readinessNotes.push(READINESS.NOTES.INI_UR_CAVEAT); // §6.5, R6
  readinessNotes.push(READINESS.TIME_ALLOWANCE.NOTE); // §9.4 sensitivity honesty
  if (significantGap) readinessNotes.push(READINESS.NOTES.SIGNIFICANT_GAP);
  if (gapCorrects < 0) {
    readinessNotes.push(READINESS.NOTES.HEADROOM.replace('{headroom}', String(round(-gapCorrects, 1)))); // §18.3
  }

  const warnings = mergeWarnings(estimate.warnings, session.warnings);
  const notes = mergeNotes(estimate.notes, readinessNotes);

  const budgetArithmetic = `${round(cappedMonths, 1)} months × ${rate} = ${round(rate * cappedMonths, 1)} → ${budget} corrects${months > READINESS.TIME_ALLOWANCE.CAP_MONTHS ? ' (months capped)' : ''}`;
  const stateLine =
    state === 'READY'
      ? READINESS.NOTES.STATE_READY
      : state === 'MODERATELY_READY'
        ? READINESS.NOTES.STATE_MODERATELY_READY
        : READINESS.NOTES.STATE_BARELY_READY;

  return {
    exam: exam.id,
    examLabel: exam.label,
    state,
    methodVersion:
      exam.id === 'NEET_PG' ? READINESS.METHOD_VERSION_NEET_PG : READINESS.METHOD_VERSION_INI_CET,
    method: {
      version:
        exam.id === 'NEET_PG' ? READINESS.METHOD_VERSION_NEET_PG : READINESS.METHOD_VERSION_INI_CET,
      anchorSetRuleId: READINESS.ANCHOR_SET_RULE_ID,
      timeAllowanceRuleId: READINESS.TIME_ALLOWANCE_RULE_ID,
      defaultAnchor: READINESS.DEFAULT_ANCHOR,
      significantGapFactor: READINESS.SIGNIFICANT_GAP_FACTOR,
      daysPerMonth: readinessCalendar.DAYS_PER_MONTH,
      timeAllowance: {
        provisional: READINESS.TIME_ALLOWANCE.provisional,
        rateCorrectsPerMonth: rate,
        capMonths: READINESS.TIME_ALLOWANCE.CAP_MONTHS,
        note: READINESS.TIME_ALLOWANCE.NOTE,
      },
      calendarVersion: session.calendarVersion,
      pattern: { ...pattern },
      patternVersion: exam.patternVersion,
      distribution: strategy.distributionMeta(), // verified-snapshot provenance echo (§12.1)
      aggregation: { method: AGGREGATION.method, dedupRuleId: AGGREGATION.DEDUP_RULE_ID },
      inheritedForwardMethodVersion: strategy.methodVersion,
    },
    request, // byte-faithful echo (§16); Phase 4 persists it verbatim
    input: {
      mode,
      rows: correctsRows,
      ...(scoreRows ? { scoreRows } : {}),
      aggregation: {
        n: aggregation.stats.n,
        values: aggregation.stats.values,
        mean: round(cBar, 2),
        median: round(aggregation.stats.median, 2),
        trimmedMean: aggregation.stats.trimmedMean === null ? null : round(aggregation.stats.trimmedMean, 2),
        sd: round(aggregation.stats.sd, 2),
        min: aggregation.stats.min,
        max: aggregation.stats.max,
        range: aggregation.stats.range,
      },
      meanCorrects: round(cBar, 2),
    },
    standing: {
      meanCorrects: round(cBar, 2),
      projectedScore: round(projectedScore, 1), // NEET "score" / INI "marks" — same pattern arithmetic
      percentile: estimate.percentile, // point + provisional range as context (§5.5/§6.4)
      performance: estimate.performance,
      transfer: estimate.transfer,
      rank, // exact official lookup stage (RANK_RANGE)
      coverage: estimate.percentile.coverage,
    },
    calendar: session,
    anchors: ladder,
    target: {
      id: target.id,
      rank: target.rank,
      requiredCorrects: target.requiredCorrects,
      requiredState: target.requiredState,
      definition: target.definition,
      source: target.source,
      evidence: target.evidence,
    },
    gap: {
      requiredCorrects: target.requiredCorrects,
      meanCorrects: round(cBar, 2),
      gapCorrects: round(gapCorrects, 2),
      budget,
      rate,
      monthsRemaining: round(months, 2),
      cappedMonths: round(cappedMonths, 2),
      capped: months > READINESS.TIME_ALLOWANCE.CAP_MONTHS,
      significantGap,
      budgetArithmetic,
    },
    explanation: {
      stateLine,
      timeRemainingText: timeRemainingText(session.daysRemaining, months),
      budgetArithmetic,
    },
    warnings,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Default wiring (committed store; tests inject their own deps)
// ---------------------------------------------------------------------------

const defaultDeps = {
  _strategies: null,
  _anchors: null,
  _distModel: null,
  _bridge: null,
  _priorModel: null,
  strategies() {
    if (!this._strategies) {
      this._strategies = buildStrategies({
        loadDistribution: store.loadNeetPgDistribution,
        loadCounselling: store.loadNeetPgCounselling,
        cohortProvider: null, // readiness rows are manual/self-reported values — Tier 1 parity only
        loadIniCetDistribution: store.loadIniCetDistribution,
        loadIniCetPrior: store.loadIniCetPrior,
        loadIniCetCounselling: store.loadIniCetCounselling,
      });
    }
    return this._strategies;
  },
  anchors() {
    if (!this._anchors) this._anchors = deriveReadinessAnchors();
    return this._anchors;
  },
  distributionModel() {
    if (!this._distModel) {
      this._distModel = buildDistributionModel(store.loadNeetPgDistribution().data);
    }
    return this._distModel;
  },
  bridge() {
    if (!this._bridge) {
      const exam = EXAMS.NEET_PG;
      this._bridge = buildPatternBridge({
        pattern: exam.pattern,
        patternVersion: exam.patternVersion,
        anchorPattern: exam.distribution.anchorPattern,
        anchorPatternVersion: exam.distribution.anchorPatternVersion,
      });
    }
    return this._bridge;
  },
  priorModel() {
    if (!this._priorModel) {
      this._priorModel = buildPriorModel(store.loadIniCetPrior().data, EXAMS.INI_CET.pattern);
    }
    return this._priorModel;
  },
};

module.exports = { computeReadiness, STATES };
