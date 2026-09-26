'use strict';

const store = require('./store');
const { buildCounsellingIndex } = require('./branchMatching');
const { buildDistributionModel } = require('./distributionModel');
const { normalizeKey } = require('./desiredBranch');
const { EXAMS, READINESS } = require('./config');
const { dataIntegrity } = require('./errors');

/**
 * Readiness Score — target-anchor derivation (Feature 09,
 * docs/READINESS_SCORE.md §9.3; decision R1 approved 2026-09-26).
 *
 * An anchor is a NAMED RANK REFERENCE derived from the committed, hash-verified
 * snapshot store — never a hand-typed number. This module turns the config's
 * anchor DEFINITIONS (READINESS.ANCHORS) into concrete ranks + evidence:
 *
 *   QUALIFY  (NEET PG, context)  worst rank that still scored the official UR
 *                                qualifying score (276/800, Phase-4 golden) in
 *                                the official 2025 distribution = the score
 *                                band's maxRank.
 *   ANY_SEAT (default, both)     worst UR final-state closing rank over the
 *                                anchor's source window (NEET PG: 2025 AIQ
 *                                counselling; INI-CET: trailing N sessions) —
 *                                the literal last UR seat awarded.
 *   STRONG   (context, both)     tightest UR closing among General Medicine
 *                                groups over the same window (normalized
 *                                course-key substring match,
 *                                name-normalization-v1).
 *
 * Determinism: the result contains no timestamps and no randomness — the same
 * committed snapshots + config always produce a byte-identical object, which
 * the Phase 1 golden (tests/predictor/readinessAnchors.golden.json) pins.
 * Any change to a derived value must arrive via a re-verified snapshot or an
 * approved config change (R1), which is exactly what the golden comparison in
 * scripts/readiness/derive_anchor_ranks.js enforces.
 */

/** UR + non-PwD rows for a counselling index (R6: anchors are UR-scoped). */
function urRows(index, quota) {
  return index.rows.filter((r) => r.quota === quota && r.category === 'UR' && !r.pwd);
}

function worstByClosing(rows, where) {
  if (!rows.length) {
    throw dataIntegrity(`Readiness anchor '${where}' matched zero counselling rows — snapshot shape or filters changed.`, {
      where,
    });
  }
  return rows.reduce((m, r) => (r.closing > m.closing ? r : m));
}

function bestByClosing(rows, where) {
  if (!rows.length) {
    throw dataIntegrity(`Readiness anchor '${where}' matched zero counselling rows — snapshot shape or filters changed.`, {
      where,
    });
  }
  return rows.reduce((m, r) => (r.closing < m.closing ? r : m));
}

/** General Medicine groups (normalized display-key substring match). */
function genMedRows(rows, index) {
  return rows
    .map((r) => ({ row: r, course: index.courses[r.courseIdx] }))
    .filter((e) => normalizeKey(e.course).includes(READINESS.GENMED_COURSE_KEY));
}

function counsellingSource(spec, snapshotId) {
  return {
    kind: 'counselling',
    snapshotId: spec.source.snapshotId,
    filters: { ...spec.source.filters },
    // Guard: the snapshot the config NAMES must be the snapshot the store
    // LOADED (config ↔ data drift fails loudly, like every store check).
    loadedSnapshotId: snapshotId,
  };
}

/** NEET PG anchors (spec §9.3): QUALIFY from the distribution, ANY_SEAT/STRONG from 2025 AIQ counselling. */
function deriveNeetPg(deps, specs) {
  const loadDistribution = deps.loadNeetPgDistribution;
  const loadCounselling = deps.loadNeetPgCounselling;

  // --- QUALIFY: band of the official UR qualifying score, worst rank in band.
  const qualifySpec = specs.find((a) => a.id === 'QUALIFY');
  const distEntry = loadDistribution(2025);
  const distModel = buildDistributionModel(distEntry.data);
  const band = distModel.rankIntervalForScore(qualifySpec.qualifyingScoreAnchor);
  if (!band || band.state || !Number.isFinite(band.maxR)) {
    throw dataIntegrity(
      `Qualifying score ${qualifySpec.qualifyingScoreAnchor} is not inside the distribution snapshot (${distEntry.snapshotId}).`,
      { state: band && band.state }
    );
  }
  // Cross-check (evidence only): the pinned percentile formula must place the
  // 50th percentile INSIDE the qualifying-score band — official data and the
  // pinned formula agreeing is what makes this anchor defensible.
  const pctAtBandTop = distModel.percentileForRank(band.maxR);
  const pctAtBandBottom = distModel.percentileForRank(band.minR);
  const straddles50 = pctAtBandTop <= 50 && pctAtBandBottom >= 50;
  // Band count comes from the raw snapshot (rankIntervalForScore returns only
  // the rank interval); null when the score sits between observed bands.
  const rawBand = distEntry.data.bands[String(qualifySpec.qualifyingScoreAnchor)];
  const bandCount = Array.isArray(rawBand) ? rawBand[2] : null;

  // --- ANY_SEAT + STRONG: 2025 AIQ counselling, UR + non-PwD.
  const anySeatSpec = specs.find((a) => a.id === 'ANY_SEAT');
  const strongSpec = specs.find((a) => a.id === 'STRONG');
  const counsellingEntry = loadCounselling(anySeatSpec.source.examYear);
  const index = buildCounsellingIndex(counsellingEntry.data);
  if (index.snapshotId !== anySeatSpec.source.snapshotId) {
    throw dataIntegrity(
      `NEET PG counselling year ${anySeatSpec.source.examYear} loaded ${index.snapshotId}, config names ${anySeatSpec.source.snapshotId}.`
    );
  }
  const filtered = urRows(index, anySeatSpec.source.filters.quota);
  const anySeatRow = worstByClosing(filtered, 'NEET_PG.ANY_SEAT');
  const genMed = genMedRows(filtered, index);
  const strongRow = bestByClosing(genMed.map((e) => e.row), 'NEET_PG.STRONG');

  return {
    QUALIFY: {
      id: 'QUALIFY',
      role: qualifySpec.role,
      rank: band.maxR,
      definition: qualifySpec.definition,
      source: {
        kind: 'distribution',
        snapshotId: distEntry.snapshotId,
        qualifyingScoreAnchor: qualifySpec.qualifyingScoreAnchor,
        qualifyingScoreProvenance: qualifySpec.qualifyingScoreProvenance,
      },
      band: { minRank: band.minR, maxRank: band.maxR, count: bandCount },
      crossCheck: {
        pinnedPercentileAtBandTop: Number(pctAtBandTop.toFixed(4)),
        pinnedPercentileAtBandBottom: Number(pctAtBandBottom.toFixed(4)),
        bandStraddles50thPercentile: straddles50,
      },
    },
    ANY_SEAT: {
      id: 'ANY_SEAT',
      role: anySeatSpec.role,
      rank: anySeatRow.closing,
      definition: anySeatSpec.definition,
      source: counsellingSource(anySeatSpec, index.snapshotId),
      evidence: {
        rowsMatched: filtered.length,
        holder: {
          institute: index.institutes[anySeatRow.instituteIdx],
          course: index.courses[anySeatRow.courseIdx],
        },
      },
    },
    STRONG: {
      id: 'STRONG',
      role: strongSpec.role,
      rank: strongRow.closing,
      definition: strongSpec.definition,
      source: counsellingSource(strongSpec, index.snapshotId),
      evidence: {
        rowsMatched: genMed.length,
        courseVariantsMatched: [...new Set(genMed.map((e) => e.course))].sort(),
        holder: {
          institute: index.institutes[strongRow.instituteIdx],
          course: index.courses[strongRow.courseIdx],
        },
      },
    },
  };
}

/**
 * INI-CET anchors (spec §9.3): worst/tightest UR-pool closings over the
 * trailing N counselling sessions (config EXAMS.INI_CET.counselling order,
 * last N — never hardcoded session strings).
 */
function deriveIniCet(deps, specs) {
  const loadCounselling = deps.loadIniCetCounselling;
  const anySeatSpec = specs.find((a) => a.id === 'ANY_SEAT');
  const strongSpec = specs.find((a) => a.id === 'STRONG');
  const quota = anySeatSpec.source.filters.quota;

  const sessions = [...EXAMS.INI_CET.counselling]
    .map((c) => c.session)
    .sort(); // 'YYYY-MM' sorts chronologically
  const window = sessions.slice(-READINESS.INI_TRAILING_SESSIONS);

  const perSessionMax = [];
  const genMedCollected = [];
  for (const session of window) {
    const entry = loadCounselling(session);
    const index = buildCounsellingIndex(entry.data);
    const filtered = urRows(index, quota);
    if (!filtered.length) {
      throw dataIntegrity(`INI-CET session ${session} matched zero UR rows for anchor filters.`, { session });
    }
    const maxRow = worstByClosing(filtered, `INI_CET.ANY_SEAT[${session}]`);
    perSessionMax.push({
      session,
      snapshotId: index.snapshotId,
      rank: maxRow.closing,
      holder: { institute: index.institutes[maxRow.instituteIdx], course: index.courses[maxRow.courseIdx] },
      rowsMatched: filtered.length,
    });
    for (const e of genMedRows(filtered, index)) {
      genMedCollected.push({ row: e.row, session, index, course: e.course });
    }
  }

  const anySeatEntry = perSessionMax.reduce((m, p) => (p.rank > m.rank ? p : m));
  const strongEntry = bestByClosing(genMedCollected.map((e) => e.row), 'INI_CET.STRONG');
  const strongMeta = genMedCollected.find((e) => e.row === strongEntry);

  return {
    ANY_SEAT: {
      id: 'ANY_SEAT',
      role: anySeatSpec.role,
      rank: anySeatEntry.rank,
      definition: anySeatSpec.definition,
      source: {
        kind: 'counselling',
        snapshotIds: perSessionMax.map((p) => p.snapshotId),
        filters: { ...anySeatSpec.source.filters },
        trailingSessions: READINESS.INI_TRAILING_SESSIONS,
      },
      evidence: {
        sessionsScanned: window,
        perSessionMax,
        holder: anySeatEntry.holder,
        holderSession: anySeatEntry.session,
      },
    },
    STRONG: {
      id: 'STRONG',
      role: strongSpec.role,
      rank: strongEntry.closing,
      definition: strongSpec.definition,
      source: {
        kind: 'counselling',
        snapshotIds: perSessionMax.map((p) => p.snapshotId),
        filters: { ...strongSpec.source.filters },
        trailingSessions: READINESS.INI_TRAILING_SESSIONS,
      },
      evidence: {
        rowsMatched: genMedCollected.length,
        courseVariantsMatched: [...new Set(genMedCollected.map((e) => e.course))].sort(),
        holder: {
          institute: strongMeta.index.institutes[strongEntry.instituteIdx],
          course: strongMeta.index.courses[strongEntry.courseIdx],
        },
        holderSession: strongMeta.session,
      },
    },
  };
}

/**
 * Derive every readiness anchor from the committed store.
 * @param {object} [deps] injectable loaders (tests / Phase 3 wiring);
 *   defaults are the hash-verified store functions.
 * @returns {object} deterministic anchor map { NEET_PG: {…}, INI_CET: {…} }
 */
function deriveReadinessAnchors(deps = {}) {
  const resolved = {
    loadNeetPgDistribution: deps.loadNeetPgDistribution || ((year) => {
      // Loader ignores the year (single 2025 anchor snapshot in config); kept
      // for symmetry + future per-year anchors.
      return store.loadNeetPgDistribution();
    }),
    loadNeetPgCounselling: deps.loadNeetPgCounselling || store.loadNeetPgCounselling,
    loadIniCetCounselling: deps.loadIniCetCounselling || store.loadIniCetCounselling,
  };
  return {
    anchorSetRuleId: READINESS.ANCHOR_SET_RULE_ID,
    NEET_PG: deriveNeetPg(resolved, READINESS.ANCHORS.NEET_PG),
    INI_CET: deriveIniCet(resolved, READINESS.ANCHORS.INI_CET),
  };
}

module.exports = { deriveReadinessAnchors };
