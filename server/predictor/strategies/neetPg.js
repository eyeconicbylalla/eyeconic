'use strict';

const { EXAMS, METHOD_VERSION, DESIRED_BRANCH } = require('../config');
const { validateRequest, validateForBranches } = require('../validation');
const { aggregate } = require('../aggregation');
const { buildEstimate } = require('../transfer');
const { resolveRankRange } = require('../rankResolution');
const { buildCounsellingIndex, matchBranches } = require('../branchMatching');
const { buildDistributionModel } = require('../distributionModel');
const { buildPatternBridge } = require('../patternBridge');
const {
  buildDesiredBranchResult,
  requiredCorrectsNeetPg,
  buildBranchCatalog,
} = require('../desiredBranch');

/**
 * NEET PG strategy (M1) — the exam-strategy interface of spec §18:
 *
 *   validate → aggregate → estimatePercentileRange (P3)
 *           → resolveRankRange (P4) → resolveBranches (P6)
 *
 * Every interface step is now live. The strategy is pure composition: all
 * math lives in the shared modules and all data access in the store — this
 * file only wires NEET PG's config, pattern, official distribution, and
 * counselling snapshots together.
 *
 * Pattern profiles (§10, migration 2026-09-24): the CURRENT profile runs the
 * 180-question / 720-mark pattern with the fraction-parity bridge onto the
 * 2025 800-scale distribution. Entries in EXAMS.NEET_PG.patternHistory build
 * legacy strategies (createNeetPgStrategy({ profile })) used ONLY to
 * re-derive stored predictions/queries under the method version that served
 * them — never for new requests.
 */

/**
 * Resolve the pattern profile for a run: the current config, or a retired
 * patternHistory entry (forward methodVersion keyed).
 */
function resolveProfile(entry) {
  if (!entry) {
    const exam = EXAMS.NEET_PG;
    return {
      methodVersion: METHOD_VERSION,
      pattern: exam.pattern,
      patternVersion: exam.patternVersion,
      bridge: buildPatternBridge({
        pattern: exam.pattern,
        patternVersion: exam.patternVersion,
        anchorPattern: exam.distribution.anchorPattern,
        anchorPatternVersion: exam.distribution.anchorPatternVersion,
      }),
      desiredMethodVersion: DESIRED_BRANCH.METHOD_VERSION_NEET_PG,
      desiredRuleId: DESIRED_BRANCH.RULES.NEET_PG_REQUIRED,
    };
  }
  return {
    methodVersion: entry.methodVersion,
    pattern: entry.pattern,
    patternVersion: entry.patternVersion,
    bridge: null, // legacy 800-scale profile IS the distribution's scale
    desiredMethodVersion: entry.desiredMethodVersion,
    desiredRuleId: entry.desiredRuleId,
  };
}

function createNeetPgStrategy({ loadDistribution, loadCounselling, cohortProvider, profile: profileEntry }) {
  const profile = resolveProfile(profileEntry);
  let cachedModel = null;
  let cachedCounselling = null;
  let cachedCatalog = null;

  function distributionModel() {
    if (!cachedModel) {
      const { data } = loadDistribution();
      cachedModel = buildDistributionModel(data);
    }
    return cachedModel;
  }

  /** Final-state counselling indexes, one per configured year (cached). */
  function counsellingIndexes() {
    if (!cachedCounselling) {
      cachedCounselling = EXAMS.NEET_PG.counselling.map((c) =>
        buildCounsellingIndex(loadCounselling(c.examYear).data)
      );
    }
    return cachedCounselling;
  }

  return {
    id: 'NEET_PG',
    label: 'NEET PG',
    available: true,
    milestone: 'M1',
    methodVersion: profile.methodVersion,

    /** §3.5–§3.6 input validation (profile pattern — current or legacy). */
    validate(request) {
      return validateRequest(request, profile.pattern); // exam-aware via request.exam === 'NEET_PG'
    },

    /** §3.3 dedup + aggregation. */
    aggregate(validated) {
      return aggregate(validated.gts);
    },

    /**
     * §5 percentile-transfer estimate (the Phase 3 output). Pattern scores are
     * bridged onto the 2025 distribution's scale inside buildEstimate.
     */
    estimatePercentileRange({ validated, aggregation }) {
      const estimate = buildEstimate({
        perGt: aggregation.perGt,
        pattern: profile.pattern,
        patternVersion: profile.patternVersion,
        distModel: distributionModel(),
        cohortProvider,
        bridge: profile.bridge,
      });
      estimate.performance.patternVersion = profile.patternVersion;
      return estimate;
    },

    /**
     * Phase 4 (M1): AIR range via the official distribution — an exact
     * lookup over the 2025 NBEMS bands (anchor scale; internals arrive
     * bridged).
     */
    resolveRankRange({ estimate }) {
      return resolveRankRange({
        estimate,
        distModel: distributionModel(),
        examYear: EXAMS.NEET_PG.distribution.examYear,
      });
    },

    /**
     * Phase 6 (M1): rank range → possible branches/colleges over the
     * final-state counselling snapshots. §3.6 gate: category required,
     * never defaulted — the engine surfaces CATEGORY_REQUIRED when absent.
     */
    resolveBranches({ validated, rank }) {
      const category = validateForBranches(validated);
      return matchBranches({
        indexes: counsellingIndexes(),
        rank,
        category: category.value,
        pwd: category.pwd,
        quota: validated.quota,
      });
    },

    /** Exposed for Phase 6's cutoff matching (category gate per §3.6). */
    validateForBranches,

    /**
     * Desired Branch Predictor (Feature 02, DBP §6): the reverse pipeline
     * branch → historical closing range → required corrects, assembled by the
     * shared builder; NEET PG's reverse step is the official distribution's
     * strict tie-band guarantee (distributionModel.requiredScoreForRank),
     * bridged to the profile's pattern before the corrects inverse.
     */
    resolveDesiredBranch(validated) {
      return buildDesiredBranchResult({
        examConfig: {
          ...EXAMS.NEET_PG,
          pattern: profile.pattern,
          patternVersion: profile.patternVersion,
        },
        methodVersion: profile.desiredMethodVersion,
        kind: 'NEET_PG',
        indexes: counsellingIndexes(),
        validated,
        resolveRequired: (closingRanks) =>
          requiredCorrectsNeetPg({
            closingRanks,
            distModel: distributionModel(),
            pattern: profile.pattern,
            patternVersion: profile.patternVersion,
            bridge: profile.bridge,
            ruleId: profile.desiredRuleId,
          }),
        reverseDataMeta: { distribution: distributionModel().snapshotId },
      });
    },

    /**
     * Branch catalog for the Desired Branch picker (DBP §6.1): normalized-key
     * branch list over the AIQ-scoped counselling indexes, cached per process.
     */
    branchCatalog() {
      if (!cachedCatalog) {
        cachedCatalog = buildBranchCatalog({
          indexes: counsellingIndexes(),
          quota: EXAMS.NEET_PG.quotaScope.supported[0],
        });
      }
      return cachedCatalog;
    },

    /** Verified snapshot metadata for prediction records (§17 provenance echo). */
    distributionMeta() {
      const { snapshotId } = distributionModel();
      return { snapshotId, numericPairs: distributionModel().numericPairs };
    },

    /** Pattern + bridge provenance for the method block (§10 echo). */
    patternMeta() {
      return {
        pattern: { ...profile.pattern },
        patternVersion: profile.patternVersion,
        distributionBridge: profile.bridge
          ? {
              id: profile.bridge.id,
              patternVersion: profile.bridge.patternVersion,
              anchorPatternVersion: profile.bridge.anchorPatternVersion,
              basis: profile.bridge.basis,
            }
          : null,
      };
    },
  };
}

module.exports = { createNeetPgStrategy };
