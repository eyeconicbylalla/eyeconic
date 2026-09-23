'use strict';

const { dataIntegrity } = require('./errors');

/**
 * Exact lookup math over a Phase 2 score→rank distribution snapshot
 * (DS-NEETPG-DISTRIBUTION-2025-v1, format "bands-v1").
 *
 * This module is a LOOKUP over official data, not a model (spec §18 Phase 4:
 * "this stage is a lookup over official data, so any mismatch is an ingestion
 * bug, not a tolerance question"). Semantics pinned here:
 *
 *  - bands: {score: [minRank, maxRank, count]} over candidates with a numeric
 *    score AND rank. Stored min/max ranks are the OFFICIAL ranks and are
 *    authoritative: the 18 WITHHELD candidates (rank published, score
 *    withheld) interleave inside band intervals, which is why
 *    sum(counts) === numeric_pairs (230,096) while the last rank is 230,114.
 *  - adjacent bands are rank-contiguous (verified at build time): a
 *    hypothetical candidate scoring an unobserved s (sLo < s < sHi) would
 *    insert at exactly minRank(sLo band) === maxRank(sHi band) + 1.
 *  - percentile definition (pinned by the snapshot's format_doc, reused — not
 *    re-decided here): percentile(r) = 100 × (1 − r / numeric_pairs).
 */

/**
 * @param {object} snapshot parsed score-rank-bands.json
 * @returns {object} frozen lookup API:
 *   { numericPairs, maxScore, minScore, lastRank,
 *     rankIntervalForScore(s), percentileForRank(r),
 *     percentileIntervalForScore(s), scoreForRank(r),
 *     requiredScoreForRank(r) }
 */
function buildDistributionModel(snapshot) {
  const v = snapshot.validation || {};
  const numericPairs = v.numeric_pairs;
  if (!Number.isFinite(numericPairs) || numericPairs <= 0) {
    throw dataIntegrity('Distribution snapshot is missing validation.numeric_pairs.');
  }

  const entries = Object.entries(snapshot.bands || {}).map(([k, b]) => ({
    score: Number(k),
    minR: b[0],
    maxR: b[1],
    count: b[2],
  }));
  if (!entries.length) {
    throw dataIntegrity('Distribution snapshot has no bands.');
  }
  // Descending by score — the direction ranks grow.
  entries.sort((a, b) => b.score - a.score);

  // Structural integrity (mirrors the Phase 2 sanity suite at runtime):
  // any violation here means the snapshot changed shape, not that the
  // prediction is "slightly off" — fail loudly.
  let sumCounts = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (!Number.isInteger(e.score) || !Number.isInteger(e.minR) || !Number.isInteger(e.maxR)) {
      throw dataIntegrity(`Band at score ${e.score} has non-integer values.`);
    }
    if (e.minR < 1 || e.maxR < e.minR || e.count < 1 || e.maxR - e.minR + 1 < e.count) {
      throw dataIntegrity(`Malformed band at score ${e.score}: [${e.minR}, ${e.maxR}, ${e.count}].`);
    }
    if (i > 0) {
      const above = entries[i - 1];
      if (above.score === e.score) {
        throw dataIntegrity(`Duplicate score band for ${e.score}.`);
      }
      if (above.maxR + 1 !== e.minR) {
        throw dataIntegrity(`Band ranks not contiguous across scores ${above.score} → ${e.score}.`);
      }
    }
    sumCounts += e.count;
  }
  if (sumCounts !== numericPairs) {
    throw dataIntegrity(`Band counts sum to ${sumCounts}, expected numeric_pairs ${numericPairs}.`);
  }
  if (entries[0].minR !== 1) {
    throw dataIntegrity(`Top band does not start at rank 1 (starts at ${entries[0].minR}).`);
  }

  const maxScore = entries[0].score;
  const minScore = entries[entries.length - 1].score;
  const lastRank = entries[entries.length - 1].maxR;

  // Exact-score lookup map.
  const byScore = new Map(entries.map((e) => [e.score, e]));

  /** Binary search: index of the nearest band with score > s (entries desc). */
  function indexOfBandAbove(score) {
    let lo = 0;
    let hi = entries.length; // exclusive
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid].score > score) lo = mid + 1;
      else hi = mid;
    }
    return lo; // entries[lo-1].score > s > entries[lo].score (when both exist)
  }

  /**
   * Rank interval achievable at score s (insertion semantics for unobserved
   * scores). Returns {minR, maxR} integers, or {state:'above'|'below'} when s
   * sits beyond the recorded distribution.
   */
  function rankIntervalForScore(score) {
    if (!Number.isFinite(score)) {
      throw new TypeError('rankIntervalForScore expects a number');
    }
    if (score > maxScore) return { state: 'above' };
    if (score < minScore) return { state: 'below' };
    const exact = byScore.get(score);
    if (exact) return { minR: exact.minR, maxR: exact.maxR };
    const i = indexOfBandAbove(score); // entries[i] is the band BELOW s
    const lower = entries[i];
    // Contiguity ⇒ insertion rank is exactly the lower band's minR.
    return { minR: lower.minR, maxR: lower.minR };
  }

  /**
   * Pinned percentile formula. Withheld-interleaved ranks at the very bottom
   * can yield a tiny negative value; clamped to 0 with the clamp recorded.
   */
  function percentileForRank(rank) {
    const raw = 100 * (1 - rank / numericPairs);
    return raw < 0 ? 0 : raw;
  }

  /**
   * Percentile interval for a score: [worst, best] = [pct(maxR), pct(minR)].
   * Carries the same above/below states as rankIntervalForScore.
   */
  function percentileIntervalForScore(score) {
    const ri = rankIntervalForScore(score);
    if (ri.state) return { state: ri.state };
    return {
      lo: percentileForRank(ri.maxR),
      hi: percentileForRank(ri.minR),
    };
  }

  /**
   * Inverse lookup (Tier 2 path): official rank → the score whose band holds
   * it. Fractional ranks interpolate linearly across the score gap between
   * neighbouring bands. {state:'above'} for r < 1, {state:'below'} past the
   * last recorded rank.
   */
  function scoreForRank(rank) {
    if (!Number.isFinite(rank)) {
      throw new TypeError('scoreForRank expects a number');
    }
    if (rank < 1) return { state: 'above' };
    if (rank > lastRank) return { state: 'below' };
    // Binary search on minR (bands are rank-ascending as index grows).
    let lo = 0;
    let hi = entries.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid].maxR < rank) lo = mid + 1;
      else hi = mid;
    }
    const band = entries[lo];
    if (rank >= band.minR && rank <= band.maxR) {
      return { score: band.score };
    }
    // Fractional rank in the open gap between band lo-1 and band lo.
    const aboveBand = entries[lo - 1];
    const frac = (band.minR - rank) / (band.minR - aboveBand.maxR); // 0..1
    return { score: band.score + frac * (aboveBand.score - band.score) };
  }

  /**
   * Strict tie-band guarantee (Desired Branch Phase 2 —
   * docs/DESIRED_BRANCH_PREDICTOR.md §3.2.1): the smallest OBSERVED score
   * whose band's worst rank clears `rank`, i.e. a candidate scoring it lands
   * at rank ≤ `rank` even in the worst tie position inside the band.
   *
   * scoreForRank(rank) alone can under-guarantee by up to one tie band: it
   * returns the band CONTAINING rank, whose maxR may exceed rank. Rule here:
   *   - the band whose maxR === rank qualifies (rank is its last rank);
   *   - otherwise the next band up qualifies (its maxR = that band's minR − 1
   *     < rank);
   *   - rank inside the TOP band but not at its end → no observed score
   *     guarantees it → { state: 'above' } (better than the best recorded
   *     score would be needed);
   *   - rank < 1 → { state: 'above' };
   *   - rank beyond lastRank → the lowest observed score already clears it
   *     (its band's maxR = lastRank < rank) → { score: minScore } (an upper
   *     bound in practice: nobody in the recorded field scored lower).
   *
   * Unobserved intermediate scores insert at the lower band's minR (band
   * contiguity), so the returned score is conservative by at most one
   * observed-score gap — never under-guaranteed.
   */
  function requiredScoreForRank(rank) {
    if (!Number.isFinite(rank)) {
      throw new TypeError('requiredScoreForRank expects a number');
    }
    if (rank < 1) return { state: 'above' };
    // First band (score-descending index) whose maxR reaches rank.
    let lo = 0;
    let hi = entries.length; // exclusive: no band reaches rank ⇒ rank > lastRank
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid].maxR < rank) lo = mid + 1;
      else hi = mid;
    }
    if (lo === entries.length) {
      return { score: minScore }; // rank beyond the recorded field
    }
    if (entries[lo].maxR === rank) {
      return { score: entries[lo].score }; // rank is exactly this band's last rank
    }
    if (lo === 0) {
      return { state: 'above' }; // inside the top band, before its end
    }
    return { score: entries[lo - 1].score };
  }

  return Object.freeze({
    snapshotId: snapshot.snapshot_id,
    numericPairs,
    maxScore,
    minScore,
    lastRank,
    bandCount: entries.length,
    /**
     * The pattern the snapshot's score axis was recorded on (e.g.
     * '800-scale (+4/-1)'). Consumers MUST NOT compare scores from a
     * different-pattern exam against this model without an explicit
     * patternBridge — patternMismatch()/requiredCorrectsNeetPg guard this.
     */
    patternVersion: typeof snapshot.pattern_version === 'string' ? snapshot.pattern_version : null,
    rankIntervalForScore,
    percentileForRank,
    percentileIntervalForScore,
    scoreForRank,
    requiredScoreForRank,
  });
}

module.exports = { buildDistributionModel };
