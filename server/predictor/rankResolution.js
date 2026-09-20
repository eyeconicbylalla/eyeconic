'use strict';

const { NOTES } = require('./config');

/**
 * Phase 4 — NEET PG rank range: exact resolution of the Phase 3 performance
 * range through the official NBEMS 2025 distribution (spec §18 Phase 4).
 *
 * This stage is a LOOKUP over official data, not a model (spec: "any mismatch
 * is an ingestion bug, not a tolerance question"). Inputs are the unrounded
 * estimate internals (estimate.internal) so no display rounding leaks into
 * rank lookups. Semantics:
 *
 *  - within data: best rank = band minR at the range's TOP score;
 *                 worst rank = band maxR at the range's BOTTOM score
 *    (higher score ⇒ better (smaller) rank; the range's score endpoints are
 *    integers-or-fractional transferred scores — unobserved scores insert at
 *    exactly the lower band's minR per the contiguity verified in Phase 3).
 *  - top of range beyond the last recorded score ⇒ best rank is 1 (cannot be
 *    better than rank 1); coverage says the end exits the data.
 *  - bottom of range below the first recorded score ⇒ worst rank is beyond
 *    the last recorded rank (230,114) ⇒ null + beyondLastRecordedRank echo,
 *    never a fabricated number (§12 honesty).
 *
 * Per-year anchors (§10): the distribution snapshot is 2025 / 800-scale; the
 * snapshot id is echoed so every prediction records the year it ran against.
 */
function resolveRankRange({ estimate, distModel, examYear }) {
  const internal = estimate && estimate.internal;
  if (!internal || !Number.isFinite(internal.sLo) || !Number.isFinite(internal.sHi)) {
    throw new TypeError('resolveRankRange needs estimate.internal (Phase 3 buildEstimate output)');
  }

  const aboveAll = internal.sLo > distModel.maxScore;
  const belowAll = internal.sHi < distModel.minScore;

  let bestRank = null; // smaller is better; 1 is the best achievable
  let worstRank = null; // larger is worse; null = beyond the recorded data
  let bestBeyondData = false;
  let worstBeyondData = false;

  if (aboveAll) {
    // Entire estimate sits above every recorded score: the best AND worst
    // case is being ahead of the recorded field — rank 1 at best, and even
    // the worst case is above the data (no recorded rank to compare to).
    bestRank = 1;
    worstRank = 1;
    bestBeyondData = true;
    worstBeyondData = false; // worst case still resolves to rank 1
  } else if (belowAll) {
    bestBeyondData = false;
    worstBeyondData = true; // both ends below the recorded scores
  } else {
    const hi = distModel.rankIntervalForScore(internal.sHi);
    if (hi.state === 'above') {
      bestRank = 1;
      bestBeyondData = true;
    } else {
      bestRank = hi.minR;
    }
    const lo = distModel.rankIntervalForScore(internal.sLo);
    if (lo.state === 'below') {
      worstBeyondData = true;
    } else {
      worstRank = lo.maxR;
    }
  }

  // Consistency invariant: best ≤ worst whenever both resolve in-data.
  if (bestRank !== null && worstRank !== null && bestRank > worstRank) {
    throw new Error(
      `Rank range inverted: best ${bestRank} > worst ${worstRank} — distribution lookup bug`
    );
  }

  return {
    stage: 'RANK_RANGE',
    examYear: examYear || null, // per-year anchor (§10) — from exam config, not the filename
    // rankRange = [best, worst]; a null end means "beyond the recorded data"
    // on that side — consumers must render the §12 state, not a number.
    rankRange: [bestRank, worstRank],
    bestRank,
    worstRank,
    bestBeyondData,
    worstBeyondData,
    beyondLastRecordedRank: worstBeyondData ? distModel.lastRank : null,
    coverage: estimate.percentile.coverage, // same coverage semantics as Phase 3
    definition:
      'AIR range resolved exactly from the official NBEMS 2025 result distribution ' +
      `(${distModel.snapshotId}; ${distModel.numericPairs.toLocaleString('en-US')} scored candidates). ` +
      NOTES.ESTIMATE_DISCLAIMER,
  };
}

module.exports = { resolveRankRange };
