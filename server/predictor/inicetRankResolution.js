'use strict';

const { NOTES } = require('./config');

/**
 * Phase 5 (M2) — INI-CET rank range: exact resolution of the percentile range
 * through the official AIIMS rank↔percentile rows (spec §18 Phase 5).
 *
 * This stage is a LOOKUP over official data (same correctness standard as
 * Phase 4's NEET PG stage): the estimate's percentile endpoints map through
 * rpModel.rankForPercentile. Beyond-ladder ends (the crowd prior spans
 * corrects 110–160) surface as explicit null + state echoes — never a
 * fabricated rank (§12).
 */
function resolveIniCetRankRange({ estimate, rpModel }) {
  const internal = estimate && estimate.internal;
  if (!internal || internal.airBest === undefined || internal.airWorst === undefined) {
    throw new TypeError('resolveIniCetRankRange needs estimate.internal (Phase 5 buildIniCetEstimate output)');
  }

  let bestRank = null; // smaller is better
  let worstRank = null; // null = beyond the recorded/prior data on that side
  let bestBeyondData = false;
  let worstBeyondData = false;
  let beyondLadderMaxAir = null;

  const pBest = estimate.percentile.range[1];
  const pWorst = estimate.percentile.range[0];

  // Best end: higher percentile → better (smaller) rank
  const hi = rpModel.rankForPercentile(pBest);
  if (hi.state === 'at-top') {
    bestRank = 1;
    bestBeyondData = true;
  } else {
    bestRank = hi.minR;
  }

  // Worst end: lower percentile → worse (larger) rank
  if (pWorst <= 0) {
    worstBeyondData = true;
    beyondLadderMaxAir = internal.airWorst !== null ? Math.round(internal.airWorst) : null;
  } else {
    const lo = rpModel.rankForPercentile(pWorst);
    if (lo.state === 'at-bottom') {
      worstBeyondData = true;
      beyondLadderMaxAir = lo.minR;
    } else {
      worstRank = lo.maxR;
    }
  }

  if (bestRank !== null && worstRank !== null && bestRank > worstRank) {
    throw new Error(
      `INI-CET rank range inverted: best ${bestRank} > worst ${worstRank} — distribution lookup bug`
    );
  }

  return {
    stage: 'RANK_RANGE',
    session: rpModel.session, // session anchor (§10: INI-CET runs two sessions/year)
    examYear: Number(rpModel.session.slice(0, 4)),
    rankRange: [bestRank, worstRank],
    bestRank,
    worstRank,
    bestBeyondData,
    worstBeyondData,
    beyondLastRecordedRank: worstBeyondData ? rpModel.lastRank : null,
    beyondLadderMaxAir,
    coverage: estimate.percentile.coverage,
    definition:
      `Rank range resolved exactly from the official AIIMS ${rpModel.session} result distribution ` +
      `(${rpModel.snapshotId}; ${rpModel.rows.toLocaleString('en-US')} qualified MD/MS candidates, last recorded rank ` +
      `${rpModel.lastRank.toLocaleString('en-US')}). The percentile input to this lookup came from a crowd-sourced prior — ` +
      `this rank range inherits that uncertainty. ${NOTES.ESTIMATE_DISCLAIMER}`,
  };
}

module.exports = { resolveIniCetRankRange };
