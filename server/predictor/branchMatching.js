'use strict';

const { BRANCH_BANDS, NOTES } = require('./config');

/**
 * Phase 6 — NEET PG branch/college prediction (spec §12): cutoff matching of
 * a predicted rank range over the imported FINAL-STATE counselling snapshots
 * (2024 + 2025), with possibility banding and explicit extreme-range states.
 *
 * Data semantics (Phase 2, approved): snapshots hold final-state closing
 * ranks per (institute × course × quota × category × pwd) group — closing =
 * last rank actually allotted at the END of counselling (2025: deduped union
 * of R1–R3, latest round wins; 2024: final seat allocation). There is no
 * per-round dimension in the committed store, so result rows are labelled
 * "final state (end of counselling)" — the round convention of §12 maps to
 * this approved final-state view; per-round views remain possible later from
 * the preserved normalized layer.
 *
 * Institute/course display strings are the snapshot's representative raw MCC
 * variants (name-normalization-v1 keeps raw display for M1); near-duplicate
 * variants can therefore yield sibling rows for the same physical branch —
 * a documented display-level limitation, not a matching error (keys are the
 * normalized strings both years joined on).
 */

const BAND_ORDER = Object.freeze([
  'COMFORTABLE',
  'WITHIN_RANGE',
  'BORDERLINE',
  'ASPIRATIONAL',
]);

/**
 * Build an in-memory index over one counselling snapshot.
 * Rows are filtered per query (quota/category/pwd) — the full row set is
 * small enough (tens of thousands) to scan per request.
 * @param {object} snapshot parsed closing-ranks.json
 */
function buildCounsellingIndex(snapshot) {
  const rows = snapshot.rows.map((r) => ({
    instituteIdx: r[0],
    courseIdx: r[1],
    quota: snapshot.quota_enum[r[2]],
    category: snapshot.category_enum[r[3]],
    pwd: r[4] === 1,
    closing: r[5],
    opening: r[6],
    allottedCount: r[7],
  }));
  return Object.freeze({
    snapshotId: snapshot.snapshot_id,
    examYear: snapshot.exam_year,
    institutes: snapshot.institutes,
    courses: snapshot.courses,
    rows,
  });
}

function bandOf(bestRank, worstRank, closing, margins) {
  // Rank numbers: smaller = better. worstRank/bestRank may be +Infinity when
  // the Phase 4 range end sits beyond the recorded data.
  if (worstRank <= closing) return 'COMFORTABLE';
  if (bestRank <= closing) return 'WITHIN_RANGE';
  if (bestRank <= closing * (1 + margins.borderline)) return 'BORDERLINE';
  if (bestRank <= closing * (1 + margins.aspirational)) return 'ASPIRATIONAL';
  return null; // excluded
}

/**
 * Match one year's index against the predicted range.
 * @param {object} args
 *   index:     buildCounsellingIndex output
 *   bestRank:  number (may be +Infinity when beyond the distribution)
 *   worstRank: number (may be +Infinity)
 *   category:  canonical category (required — never defaulted, §3.6)
 *   pwd:       boolean (absent-with-category treated as not-PwD; documented)
 *   quota:     canonical quota code (MVP: 'AIQ')
 *   margins:   {borderline, aspirational} ratios
 */
function matchIndex({ index, bestRank, worstRank, category, pwd, quota, margins }) {
  const bands = { COMFORTABLE: [], WITHIN_RANGE: [], BORDERLINE: [], ASPIRATIONAL: [] };
  let filtered = 0;
  let minClosing = Infinity;
  let maxClosing = 0;

  for (const row of index.rows) {
    if (row.quota !== quota || row.category !== category || row.pwd !== pwd) continue;
    filtered += 1;
    minClosing = Math.min(minClosing, row.closing);
    maxClosing = Math.max(maxClosing, row.closing);

    const band = bandOf(bestRank, worstRank, row.closing, margins);
    if (!band) continue;
    bands[band].push({
      institute: index.institutes[row.instituteIdx],
      branch: index.courses[row.courseIdx],
      closingRank: row.closing,
      openingRank: row.opening,
      allottedCount: row.allottedCount,
      year: index.examYear,
      round: 'final state (end of counselling)',
      category: row.category,
      quota: row.quota,
      band,
    });
  }

  if (filtered === 0) {
    return {
      snapshotId: index.snapshotId,
      year: index.examYear,
      state: 'NO_DATA_FOR_FILTER',
      counts: { total: 0 },
      rows: { COMFORTABLE: [], WITHIN_RANGE: [], BORDERLINE: [], ASPIRATIONAL: [] },
    };
  }

  for (const band of BAND_ORDER) {
    bands[band].sort((a, b) => a.closingRank - b.closingRank);
  }
  const counts = {
    COMFORTABLE: bands.COMFORTABLE.length,
    WITHIN_RANGE: bands.WITHIN_RANGE.length,
    BORDERLINE: bands.BORDERLINE.length,
    ASPIRATIONAL: bands.ASPIRATIONAL.length,
    total:
      bands.COMFORTABLE.length +
      bands.WITHIN_RANGE.length +
      bands.BORDERLINE.length +
      bands.ASPIRATIONAL.length,
  };

  return {
    snapshotId: index.snapshotId,
    year: index.examYear,
    state: counts.total > 0 ? 'MATCHED' : 'BEYOND_LAST_CLOSING',
    // §12 explicit states, computed against THIS year's filtered cutoffs:
    minClosingRank: minClosing,
    maxClosingRank: maxClosing,
    aboveAllClosings: worstRank < minClosing, // whole range beats the tightest close
    beyondAllClosings: bestRank > maxClosing, // whole range worse than the last close
    counts,
    rows: bands,
  };
}

/**
 * Match across all loaded years.
 * @param {object} args
 *   indexes:   array of buildCounsellingIndex outputs (one per year)
 *   rank:      Phase 4 rank result (bestRank/worstRank may be null)
 *   category/pwd/quota: counselling context
 */
function matchBranches({
  indexes,
  rank,
  category,
  pwd,
  quota,
  margins = {
    borderline: BRANCH_BANDS.BORDERLINE_MARGIN,
    aspirational: BRANCH_BANDS.ASPIRATIONAL_CAP,
  },
}) {
  const bestRank = rank.bestRank === null || rank.bestRank === undefined ? Infinity : rank.bestRank;
  const worstRank = rank.worstRank === null || rank.worstRank === undefined ? Infinity : rank.worstRank;

  const years = indexes.map((index) =>
    matchIndex({ index, bestRank, worstRank, category, pwd, quota, margins })
  );

  const anyMatched = years.some((y) => y.counts.total > 0);
  const anyData = years.some((y) => y.state !== 'NO_DATA_FOR_FILTER');
  const partialOverlap =
    anyMatched && (worstRank === Infinity || years.some((y) => y.state === 'BEYOND_LAST_CLOSING'));

  const coverage = !anyData
    ? 'NO_DATA_FOR_FILTER'
    : anyMatched
      ? partialOverlap
        ? 'PARTIAL'
        : 'MATCHED'
      : 'BEYOND_LAST_CLOSING';

  return {
    stage: 'BRANCHES',
    coverage,
    category: { value: category, pwd },
    quota,
    years,
    dataCoverage: {
      years: indexes.map((i) => i.examYear).sort(),
      snapshotIds: indexes.map((i) => i.snapshotId),
      roundConvention: 'final state (end of counselling) — approved Phase 2 cutoff semantics',
      margins: {
        borderline: margins.borderline,
        aspirational: margins.aspirational,
        provisional: BRANCH_BANDS.provisional,
        evidence: BRANCH_BANDS.evidence,
      },
    },
    notes: [
      'Historical possibility, not a guarantee — cutoffs move every year with seat matrices, candidate behaviour, and exam difficulty.',
      NOTES.ESTIMATE_DISCLAIMER,
    ],
  };
}

module.exports = {
  buildCounsellingIndex,
  matchBranches,
  matchIndex,
  bandOf,
  BAND_ORDER,
};
