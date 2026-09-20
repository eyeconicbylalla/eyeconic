'use strict';

const OutcomeCapture = require('../models/OutcomeCapture');
const Prediction = require('../models/Prediction');

/**
 * Rank & Branch Predictor — evaluation-dataset assembly (spec §15/§18 Phase
 * 10b): joins every captured outcome to the stored prediction it links to,
 * producing the paired "GT performance → actual exam outcome" dataset the
 * predictor cannot exist without (§4) and Phase 11's calibration consumes.
 *
 * What a pair carries (§15 linkage rule):
 *   - the prediction side: GT history (inputs + provenance + aggregation),
 *     method version, dataset snapshot versions, predicted ranges, transfer
 *     tiers — everything Phase 9 persisted when the prediction was served;
 *   - the outcome side: consented actual score / percentile / rank plus the
 *     10b counselling outcome (allotted status + institute/branch/round);
 *   - a per-pair linkage check (the capture-time copy re-verified against
 *     the live prediction, mirroring the API's linkageCheck);
 *   - a `comparison` block of deterministic joins ONLY (actual vs predicted
 *     numbers, in-range booleans). Measuring prediction error, drawing
 *     aggregate conclusions, and recalibrating are Phase 11 — gated on
 *     ~100+ pairs (§16) — and deliberately NOT done here.
 *
 * Read-only: assembly never mutates captures or predictions. The output
 * contains consented self-reported data and user ids — it is an internal
 * analysis artifact (written under the gitignored data/ dir by the CLI), not
 * something to commit or serve over HTTP.
 */

/** §16 gate: "Enough paired outcomes to compute meaningful error stats (order of ~100+…)". */
const CALIBRATION_GATE_PAIRS = 100;

/** The route's linkageCheck, recomputed identically at assembly time. */
function linkageMatches(captured, prediction) {
  if (!captured.linkage || !prediction) return false;
  return (
    captured.linkage.methodVersion === prediction.methodVersion &&
    JSON.stringify(captured.linkage.datasetSnapshots) ===
      JSON.stringify(prediction.method ? prediction.method.datasetSnapshots : null)
  );
}

function inRange(value, [lo, hi]) {
  if (value === null || value === undefined) return null;
  if (lo === null || lo === undefined || hi === null || hi === undefined) return null;
  return value >= lo && value <= hi;
}

/** Deterministic predicted-vs-actual joins only (analysis stays Phase 11). */
function buildComparison(captured, prediction) {
  if (!prediction) return null;
  const percentileRange =
    prediction.estimate && prediction.estimate.percentile
      ? prediction.estimate.percentile.range
      : null;
  const rank = prediction.rank || {};
  const scoreRange =
    prediction.estimate && prediction.estimate.performance
      ? prediction.estimate.performance.scoreRange
      : null;
  return {
    actualPercentileWithinPredicted: percentileRange
      ? inRange(captured.outcome.percentile, percentileRange)
      : null,
    actualRankWithinPredicted: inRange(captured.outcome.rank, [rank.bestRank, rank.worstRank]),
    // Only comparable when the actual exam ran the same pattern the
    // prediction assumed (e.g. NEET PG 800-scale) — Phase 11 must group by
    // methodVersion/pattern before reading this.
    actualScoreWithinPredictedScoreRange: scoreRange
      ? inRange(captured.outcome.score, scoreRange)
      : null,
  };
}

function buildPair(captured, prediction) {
  const p = prediction || {};
  return {
    pairId: String(captured._id),
    userId: captured.userId,
    exam: captured.exam,
    prediction: prediction
      ? {
          predictionId: String(prediction._id),
          createdAt: prediction.createdAt,
          methodVersion: prediction.methodVersion,
          datasetSnapshots: p.method ? p.method.datasetSnapshots : null,
          // §15 "the GT history that produced it": per-GT inputs with
          // provenance + the aggregate that fed the estimate.
          gts: Array.isArray(p.input && p.input.gts) ? p.input.gts : [],
          aggregation: p.aggregation
            ? {
                n: p.aggregation.n,
                values: p.aggregation.values,
                mean: p.aggregation.mean,
                sd: p.aggregation.sd,
              }
            : null,
          transfer: p.estimate && p.estimate.transfer ? p.estimate.transfer : null,
          predicted: {
            percentileRange:
              p.estimate && p.estimate.percentile ? p.estimate.percentile.range : null,
            rankRange: p.rank ? p.rank.rankRange : null,
            bestRank: p.rank ? p.rank.bestRank : null,
            worstRank: p.rank ? p.rank.worstRank : null,
          },
          category: p.input ? p.input.category : null,
          quota: p.input ? p.input.quota : null,
        }
      : null,
    outcome: {
      source: captured.source,
      consentGivenAt: captured.consentGivenAt,
      capturedAt: captured.createdAt,
      lastCorrectedAt: captured.updatedAt,
      score: captured.outcome.score,
      percentile: captured.outcome.percentile,
      rank: captured.outcome.rank,
      counselling: captured.counselling || null,
    },
    linkageCheck: { matches: linkageMatches(captured, prediction) },
    comparison: buildComparison(captured, prediction),
  };
}

function examCounters() {
  return { pairs: 0, withRank: 0, withPercentile: 0, withScore: 0, withCounselling: 0, linkageMatches: 0 };
}

/**
 * Assemble the full evaluation dataset.
 * @returns {object} { meta, pairs } — meta carries the §16 readiness gate,
 *   per-exam coverage counts, and orphan outcomes (captures whose prediction
 *   is no longer retrievable — they cannot join, so they are counted, not
 *   silently dropped).
 */
async function assembleEvaluationDataset() {
  const captures = await OutcomeCapture.find({}).sort({ createdAt: 1 }).lean();
  const predictionIds = [...new Set(captures.map((c) => String(c.predictionId)))];
  const predictionDocs = predictionIds.length
    ? await Prediction.find({ _id: { $in: predictionIds } }).lean()
    : [];
  const byId = new Map(predictionDocs.map((doc) => [String(doc._id), doc]));

  const pairs = [];
  const orphans = [];
  const byExam = {};
  for (const captured of captures) {
    const prediction = byId.get(String(captured.predictionId));
    if (!prediction) {
      orphans.push({ outcomeId: String(captured._id), predictionId: String(captured.predictionId) });
      continue;
    }
    pairs.push(buildPair(captured, prediction));
    if (!byExam[captured.exam]) byExam[captured.exam] = examCounters();
    const c = byExam[captured.exam];
    c.pairs += 1;
    if (captured.outcome.rank !== null) c.withRank += 1;
    if (captured.outcome.percentile !== null) c.withPercentile += 1;
    if (captured.outcome.score !== null) c.withScore += 1;
    if (captured.counselling) c.withCounselling += 1;
    if (linkageMatches(captured, prediction)) c.linkageMatches += 1;
  }

  const totalPairs = pairs.length;
  return {
    meta: {
      assembledAt: new Date(),
      schema: 'evaluation-dataset-v1',
      totalPairs,
      calibrationGate: {
        requiredPairs: CALIBRATION_GATE_PAIRS,
        met: totalPairs >= CALIBRATION_GATE_PAIRS,
        note: '§16: order of ~100+ paired outcomes before any error fitting is worth discussing (Phase 11).',
      },
      byExam,
      orphans,
      notes: [
        'Pairs join OutcomeCapture → Prediction via predictionId (§15 linkage). One outcome per prediction (unique index).',
        'comparison fields are deterministic joins (actual vs predicted numbers) — aggregate error measurement and recalibration are Phase 11, gated on ~100+ pairs (§16).',
        'Counselling strings are stored as self-reported (as typed); canonical matching against the counselling dictionaries is a Phase 11 analysis step.',
        'actualScoreWithinPredictedScoreRange is only meaningful when the actual exam ran the pattern the prediction assumed — group by methodVersion/pattern before reading it.',
        'This file contains consented self-reported outcomes and user ids. Internal analysis artifact only — data/ is gitignored; never commit or serve it.',
      ],
    },
    pairs,
  };
}

module.exports = { assembleEvaluationDataset, CALIBRATION_GATE_PAIRS };
