'use strict';

const { EXAMS, DESIRED_BRANCH } = require('../config');
const { validateRequest, validateForBranches } = require('../validation');
const { aggregate } = require('../aggregation');
const { buildIniCetEstimate, buildPriorModel } = require('../inicetTransfer');
const { resolveIniCetRankRange } = require('../inicetRankResolution');
const { buildRankPercentileModel } = require('../rankPercentileModel');
const { buildCounsellingIndex, matchBranches } = require('../branchMatching');
const { stepNotImplemented } = require('../errors');
const {
  buildDesiredBranchResult,
  requiredCorrectsIniCet,
  buildBranchCatalog,
} = require('../desiredBranch');

/**
 * INI-CET strategy (Phase 5 / M2) — spec §9's dedicated flow:
 *
 *   validate → aggregate → estimatePercentileRange → resolveRankRange   (P5)
 *           → resolveBranches                                            (P6, next)
 *
 * Structural difference from NEET PG (§9/§19.9): AIIMS never publishes marks,
 * so the corrects→percentile step rests on the crowd-sourced Hazra ladder
 * (UR-only, labelled, hash-verified in the snapshot store) while the
 * percentile→rank step is an exact official lookup. Both facts are recorded
 * in every estimate (transfer.mode, warnings, notes, definitions).
 *
 * Phase 6 (M2 portion) adds resolveBranches over the 5 final-state AIIMS
 * counselling snapshots via the SHARED matcher (§12 banding + extreme-range
 * states; sessions tag as YYYYMM so Jan/Jul stay distinct).
 *
 * Availability stays FALSE until the INI-CET UI lands (spec §18 M2
 * sequence) — engine.predict('INI_CET') keeps throwing EXAM_NOT_AVAILABLE
 * until then; the strategy is exercised directly by the Phase 5/6 tests,
 * exactly like Phase 3/4 tested stages before Phase 7 mounted the API.
 */
function createIniCetStrategy({ loadDistribution, loadPrior, loadCounselling } = {}) {
  const config = EXAMS.INI_CET;
  let cachedRpModel = null;
  let cachedPriorModel = null;
  let cachedCounselling = null;
  let cachedCatalog = null;

  function rpModel() {
    if (!cachedRpModel) {
      if (typeof loadDistribution !== 'function') {
        throw stepNotImplemented('INI-CET distribution loader', 'wire via createPredictorEngine (store)');
      }
      const { data } = loadDistribution(config.distribution.session);
      cachedRpModel = buildRankPercentileModel(data);
    }
    return cachedRpModel;
  }

  function priorModel() {
    if (!cachedPriorModel) {
      if (typeof loadPrior !== 'function') {
        throw stepNotImplemented('INI-CET prior loader', 'wire via createPredictorEngine (store)');
      }
      const { data } = loadPrior();
      cachedPriorModel = buildPriorModel(data, config.pattern);
    }
    return cachedPriorModel;
  }

  /** Final-state counselling indexes, one per configured session (cached). */
  function counsellingIndexes() {
    if (!cachedCounselling) {
      if (typeof loadCounselling !== 'function') {
        throw stepNotImplemented('INI-CET counselling loader', 'wire via createPredictorEngine (store)');
      }
      cachedCounselling = config.counselling.map((c) =>
        buildCounsellingIndex(loadCounselling(c.session).data)
      );
    }
    return cachedCounselling;
  }

  return {
    id: config.id,
    label: config.label,
    available: config.available,
    milestone: config.milestone,
    methodVersion: config.methodVersion,

    /** §3.5–§3.6 input validation (shared, exam-aware; availability-gated). */
    validate(request) {
      return validateRequest(request);
    },

    /** §3.3 dedup + aggregation (exam-agnostic shared module). */
    aggregate(validated) {
      return aggregate(validated.gts);
    },

    /** §9 corrects→percentile range (the crowd-prior weak step, flagged). */
    estimatePercentileRange({ validated, aggregation }) {
      const estimate = buildIniCetEstimate({
        perGt: aggregation.perGt,
        pattern: validated.exam.pattern,
        priorModel: priorModel(),
        rpModel: rpModel(),
        category: validated.category, // UR-only prior warning for reserved categories (§9)
      });
      estimate.performance.patternVersion = validated.exam.patternVersion;
      return estimate;
    },

    /** §9 official percentile↔rank resolution (exact lookup). */
    resolveRankRange({ estimate }) {
      return resolveIniCetRankRange({ estimate, rpModel: rpModel() });
    },

    /**
     * Phase 6 M2 portion: rank range → possible specialties/institutes over
     * the final-state AIIMS counselling snapshots (all 5 complete sessions).
     * §3.6 gate: category required, never defaulted. Single INI pool.
     */
    resolveBranches({ validated, rank }) {
      const category = validateForBranches(validated);
      return matchBranches({
        indexes: counsellingIndexes(),
        rank,
        category: category.value,
        pwd: category.pwd,
        quota: validated.quota, // 'INI' — the single counselling pool
      });
    },

    validateForBranches,

    /**
     * Desired Branch Predictor (Feature 02, DBP §6/§9): the reverse pipeline
     * assembled by the shared builder. INI-CET's reverse step is the INVERSE
     * CROWD LADDER (priorModel.marksForAir) — the load-bearing weak step in
     * this direction (AIIMS has never published marks); the shared builder
     * attaches the §9 warnings (CROWD_SOURCED_PRIOR / PRIOR_UR_ONLY).
     */
    resolveDesiredBranch(validated) {
      return buildDesiredBranchResult({
        examConfig: config,
        methodVersion: DESIRED_BRANCH.METHOD_VERSION_INI_CET,
        kind: 'INI_CET',
        indexes: counsellingIndexes(),
        validated,
        resolveRequired: (closingRanks) =>
          requiredCorrectsIniCet({
            closingRanks,
            priorModel: priorModel(),
            pattern: config.pattern,
          }),
        reverseDataMeta: { prior: priorModel().priorId },
      });
    },

    /**
     * Branch catalog for the Desired Branch picker (DBP §6.1): normalized-key
     * specialty list over the single INI pool, session-tagged per year,
     * cached per process.
     */
    branchCatalog() {
      if (!cachedCatalog) {
        cachedCatalog = buildBranchCatalog({
          indexes: counsellingIndexes(),
          quota: config.quotaScope.supported[0],
        });
      }
      return cachedCatalog;
    },

    /** Verified snapshot metadata for prediction records (§17 provenance echo). */
    distributionMeta() {
      const m = rpModel();
      return { snapshotId: m.snapshotId, numericPairs: m.rows, priorId: priorModel().priorId };
    },

    /** Pattern provenance for the method block (§10 echo; no bridge — INI-CET
     *  publishes no marks, its pipeline never enters a score space). */
    patternMeta() {
      return {
        pattern: { ...config.pattern },
        patternVersion: config.patternVersion,
        distributionBridge: null,
      };
    },
  };
}

module.exports = { createIniCetStrategy };
