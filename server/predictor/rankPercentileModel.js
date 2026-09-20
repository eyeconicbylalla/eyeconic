'use strict';

const { dataIntegrity } = require('./errors');

/**
 * Exact lookup math over an INI-CET rank↔percentile distribution snapshot
 * (format "rank-percentile-v1" — M2 Phase 1; official AIIMS result rows).
 *
 * A LOOKUP over official data, not a model. Rows are [rank, percentile_micros]
 * sorted by rank with percentiles NON-INCREASING (published rounded — ties
 * across adjacent ranks are expected and preserved, never smoothed). Because
 * of those ties, both directions resolve to INTERVALS:
 *
 *   percentileForRank(r)  -> { lo, hi }  the stored percentile(s) at rank r
 *   rankForPercentile(p)  -> { minR, maxR }  ranks whose stored percentile
 *                          brackets p (p between two adjacent stored values)
 *
 * Rank gaps (appeared-but-not-qualified candidates, not listed by AIIMS) are
 * rank-space holes with no percentile row — lookups never interpolate across
 * them; a rank inside a gap resolves from its neighbours conservatively.
 */
function buildRankPercentileModel(snapshot) {
  const v = snapshot.validation || {};
  const rows = snapshot.rows;
  if (!Array.isArray(rows) || rows.length < 1000) {
    throw dataIntegrity('Rank-percentile snapshot has no usable rows.');
  }
  if (!v.unique_ranks || !v.percentile_nonincreasing) {
    throw dataIntegrity('Rank-percentile snapshot failed its structural validation flags.');
  }

  const ranks = new Array(rows.length);
  const pcts = new Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i][0];
    const p = rows[i][1];
    if (!Number.isInteger(r) || !Number.isInteger(p) || r < 1 || p < 0 || p > 100_000_000) {
      throw dataIntegrity(`Row ${i} malformed: [${r}, ${p}].`);
    }
    ranks[i] = r;
    pcts[i] = p;
  }
  // rows arrive rank-sorted (asserted at build time by the ingestion pipeline;
  // re-verified here so a hand-edited snapshot cannot silently reorder)
  for (let i = 1; i < rows.length; i += 1) {
    if (ranks[i] <= ranks[i - 1] || pcts[i] > pcts[i - 1]) {
      throw dataIntegrity(`Rows not rank-sorted/percentile-monotone at index ${i}.`);
    }
  }

  const lastRank = ranks[ranks.length - 1];
  const microToPct = (micro) => micro / 1_000_000;

  /** Exact stored percentile interval at a listed rank. */
  function percentileForRank(rank) {
    if (!Number.isFinite(rank) || rank < 1) {
      throw dataIntegrity(`percentileForRank: invalid rank ${rank}.`);
    }
    // binary search (ranks ascending, unique)
    let lo = 0;
    let hi = ranks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ranks[mid] === rank) {
        // ties with neighbours share the stored value; report the full tie span
        let a = mid;
        let b = mid;
        while (a > 0 && pcts[a - 1] === pcts[mid]) a -= 1;
        while (b < ranks.length - 1 && pcts[b + 1] === pcts[mid]) b += 1;
        return { lo: microToPct(pcts[a]), hi: microToPct(pcts[b]), exact: true };
      }
      if (ranks[mid] < rank) lo = mid + 1;
      else hi = mid - 1;
    }
    // unlisted rank (a gap row): the neighbouring stored percentiles bracket it
    const upper = Math.max(0, hi); // ranks[hi] < rank < ranks[lo]
    const lower = Math.min(ranks.length - 1, lo);
    return {
      lo: microToPct(pcts[lower]),
      hi: microToPct(pcts[upper]),
      exact: false,
    };
  }

  /**
   * Inverse: the rank interval whose stored percentiles bracket p.
   * Higher percentile = better (smaller) rank.
   */
  function rankForPercentile(pct) {
    const p = Math.round(pct * 1_000_000);
    if (!Number.isFinite(pct) || p < 0 || p > 100_000_000) {
      throw dataIntegrity(`rankForPercentile: invalid percentile ${pct}.`);
    }
    if (p >= pcts[0]) {
      // at/above the top stored percentile: rank 1 side
      return { minR: 1, maxR: 1, state: 'at-top' };
    }
    if (p <= pcts[pcts.length - 1]) {
      // at/below the last stored percentile: beyond the qualified field
      return { minR: lastRank, maxR: null, state: 'at-bottom' };
    }
    // find i with pcts[i] >= p > pcts[i+1] (pcts non-increasing)
    let lo = 0;
    let hi = pcts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pcts[mid] >= p) lo = mid + 1;
      else hi = mid;
    }
    // pcts[lo - 1] >= p > pcts[lo]
    if (pcts[lo - 1] === p) {
      // exact stored value: the answer is the FULL tie block holding it
      let a = lo - 1;
      let b = lo - 1;
      while (a > 0 && pcts[a - 1] === p) a -= 1;
      while (b < pcts.length - 1 && pcts[b + 1] === p) b += 1;
      return { minR: ranks[a], maxR: ranks[b], state: 'in-data' };
    }
    // strictly between stored values: the bracketing boundary ranks
    return { minR: ranks[lo - 1], maxR: ranks[lo], state: 'in-data' };
  }

  return Object.freeze({
    snapshotId: snapshot.snapshot_id,
    session: snapshot.session,
    rows: rows.length,
    lastRank,
    lastRankPercentile: microToPct(pcts[pcts.length - 1]),
    topPercentile: microToPct(pcts[0]),
    percentileForRank,
    rankForPercentile,
  });
}

module.exports = { buildRankPercentileModel };
