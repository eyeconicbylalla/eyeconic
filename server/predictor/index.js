'use strict';

const {
  METHOD_VERSION,
  EXAMS,
  AGGREGATION,
  WIDTH_MODEL,
  LOW_GT_COUNT,
} = require('./config');
const store = require('./store');
const { validateRequest } = require('./validation');
const { buildStrategies } = require('./strategies');

/**
 * Rank & Branch Predictor — prediction engine (Phase 3 foundation).
 *
 * Spec: docs/RANK_AND_BRANCH_PREDICTOR.md. The engine is deliberately
 * INDEPENDENT of the quiz engine (§19.10): it consumes GT values through the
 * validated request shape and historical data through the verified snapshot
 * store — nothing imports quiz models or routes.
 *
 * Phase 3+4+6 scope: validate → aggregate → estimatePercentileRange →
 * resolveRankRange → resolveBranches (when a category is present, §3.6),
 * producing the percentile range, the exact AIR range over the official
 * distribution, and the historically-possible branches/colleges with §12
 * banding and explicit extreme-range states. No API exposure, no persistence
 * yet (both Phase 7).
 *
 * Usage:
 *   const { createPredictorEngine } = require('./predictor');
 *   const engine = createPredictorEngine();          // or { cohortProvider }
 *   const result = engine.predict({ exam: 'NEET_PG', gts: [...] });
 */

/**
 * @param {object} [deps]
 *   store:            snapshot loader (default: the committed predictor-data store)
 *   cohortProvider:   optional (gtId) => null | {size, corrects[]} for Tier 2
 */
function createPredictorEngine(deps = {}) {
  const snapshotStore = deps.store || store;
  const strategies = buildStrategies({
    loadDistribution: snapshotStore.loadNeetPgDistribution,
    loadCounselling: snapshotStore.loadNeetPgCounselling,
    cohortProvider: deps.cohortProvider || null,
  });

  /** Exam list for UI selectors (spec §13) — availability is explicit. */
  function listExams() {
    return Object.values(EXAMS).map((e) => ({
      id: e.id,
      label: e.label,
      available: e.available,
      milestone: e.milestone,
      patternVersion: e.patternVersion,
    }));
  }

  /**
   * Run the Phase 3 prediction pipeline.
   * @param {object} request see server/predictor/validation.js contract
   * @returns {object} result with estimate + full method/inputs record
   *   (shaped so Phase 7/9 can persist it verbatim — §18 Phase 9 fields)
   */
  function predict(request) {
    const examId =
      request && typeof request === 'object' && typeof request.exam === 'string'
        ? request.exam
        : undefined;
    if (!strategies[examId]) {
      // Unknown exam ids get the canonical validation error (lists supported
      // exams); registered-but-unavailable ones (INI-CET) throw from validate.
      validateRequest(request);
      throw new Error('unreachable: validation accepted an unregistered exam');
    }
    const strategy = strategies[examId];

    const validated = strategy.validate(request);

    const aggregation = strategy.aggregate(validated);
    const estimate = strategy.estimatePercentileRange({ validated, aggregation });
    const rank = strategy.resolveRankRange({ validated, estimate });
    // §3.6: no branch prediction without a category — surfaced as an explicit
    // state (never a silent UR default). The percentile+rank stages above are
    // category-agnostic and always run.
    const branches = validated.category
      ? strategy.resolveBranches({ validated, rank })
      : {
          stage: 'BRANCHES',
          coverage: 'CATEGORY_REQUIRED',
          message:
            'Category is required to predict possible branches (UR / EWS / OBC / SC / ST).',
        };
    const distMeta = strategy.distributionMeta
      ? strategy.distributionMeta()
      : { snapshotId: null, numericPairs: null };

    return {
      exam: validated.exam.id,
      examLabel: validated.exam.label,
      method: {
        version: METHOD_VERSION,
        stage: validated.category ? 'BRANCHES' : 'RANK_RANGE', // P6 output when category present
        assumptions: ['no-skip', 'full-length-standard-pattern', 'difficulty-parity'],
        aggregation: {
          method: AGGREGATION.method,
          dedupRuleId: AGGREGATION.DEDUP_RULE_ID,
          dedupRule: AGGREGATION.DEDUP_RULE,
          alternativesReported: AGGREGATION.alternativesImplemented,
        },
        widthModel: {
          id: WIDTH_MODEL.id,
          provisional: WIDTH_MODEL.provisional,
          params: WIDTH_MODEL.params,
        },
        datasetSnapshots: {
          distribution: distMeta.snapshotId,
          counselling: validated.exam.counselling
            ? validated.exam.counselling.map((c) => c.snapshotId)
            : [],
        },
      },
      input: {
        gts: aggregation.perGt, // selected + excluded attempts, provenance-tagged
        category: validated.category, // null until the branch stage requires it (§3.6)
        quota: validated.quota,
        quotaLabel: validated.exam.quotaScope.label,
        quotaDefaulted: validated.quotaDefaulted,
      },
      aggregation: {
        n: aggregation.stats.n,
        values: aggregation.stats.values,
        mean: round2(aggregation.stats.mean),
        median: round2(aggregation.stats.median),
        trimmedMean:
          aggregation.stats.trimmedMean === null ? null : round2(aggregation.stats.trimmedMean),
        sd: round2(aggregation.stats.sd),
        min: aggregation.stats.min,
        max: aggregation.stats.max,
        range: aggregation.stats.range,
        lowDataCaution: aggregation.stats.n <= LOW_GT_COUNT.max,
      },
      estimate,
      rank,
      branches,
    };
  }

  return { listExams, predict };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

module.exports = { createPredictorEngine };
