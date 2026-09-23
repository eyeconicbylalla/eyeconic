'use strict';

const { DESIRED_BRANCH, NOTES, LOW_GT_COUNT } = require('./config');
const { invalidInput } = require('./errors');
const { correctsForScore } = require('./transfer');
const { aggregate } = require('./aggregation');

/**
 * Desired Branch Predictor — Phase 1 (docs/DESIRED_BRANCH_PREDICTOR.md).
 *
 * The reverse direction of the Rank & Branch Predictor: branch → historical
 * closing-rank range → (later phases) required GT corrects. This module owns
 * the two data-layer steps of that pipeline:
 *
 *   buildBranchCatalog — the selectable branch registry, normalized-key based
 *                        (raw course display strings are unstable across
 *                        years: 10/118 shared raw vs 95/118 after the
 *                        name-normalization-v1 key algorithm)
 *   resolveTarget      — branch + category/pwd/quota → per-year/session
 *                        closing-rank ranges + the D1 target range
 *                        [tightest, loosest] across years
 *
 * Reuse, deliberately (DBP §3): counselling access happens through the SAME
 * buildCounsellingIndex outputs the forward matcher uses — nothing here
 * re-parses snapshots or re-decides row semantics. Final-state closing-rank
 * semantics, category/PwD/quota filtering rules, and the never-defaulted
 * category principle (§3.6) are inherited unchanged.
 *
 * D2 (approved): V1 is branch-only — no institute dimension in the query.
 * Because a branch-only range spans the branch's institutes, the tightest and
 * loosest ends NAME their institutes (surfaced, not hidden).
 */

/**
 * name-normalization-v1 key algorithm (dictionaries/v1/name-normalization.json):
 * trim → collapse internal whitespace to a single space → casefold.
 *
 * The ingestion layer computed its keys with Python casefold; JS toLowerCase
 * is identical for this data (ASCII course/institute strings), which the
 * Phase 1 catalog tests pin against the committed snapshots. Whitespace
 * collapsing also absorbs the 2024 mirror's embedded \r\n artifacts
 * ('M.D. (GENERAL\r\nMEDICINE)' → 'm.d. (general medicine)').
 */
function normalizeKey(display) {
  if (typeof display !== 'string') {
    throw new TypeError(`normalizeKey expects a string (got ${typeof display})`);
  }
  return display.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Longest alphanumeric tokens of a key, for not-found suggestions. */
function keyTokens(key) {
  return key.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

/**
 * Deterministic near-miss suggestions for an unknown branch key: score every
 * catalog key by shared ≥4-char tokens (query tokens ⊆ key tokens), then by
 * substring containment; ties break alphabetically. Max 5.
 */
function suggestBranchKeys(catalogKeys, queryKey) {
  const queryTokens = new Set(keyTokens(queryKey));
  const scored = [];
  for (const key of catalogKeys) {
    let score = 0;
    if (key.includes(queryKey) && queryKey.length >= 3) score += 2;
    for (const token of new Set(keyTokens(key))) {
      if (queryTokens.has(token)) score += 1;
    }
    if (score > 0) scored.push({ key, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  return scored.slice(0, 5).map((s) => s.key);
}

/**
 * Build the selectable branch catalog for one exam.
 *
 * Counts are scoped to the exam's counselling pool quota (AIQ / INI) and are
 * category-agnostic (the union a student filters down from); years are the
 * index's examYear tags — YYYY for NEET PG, YYYYMM session tags for INI-CET
 * (the shared matcher's session convention: Jan/Jul of one year stay
 * distinct).
 *
 * @param {object} args
 *   indexes: array of buildCounsellingIndex outputs (one per year/session)
 *   quota:   the exam's counselling pool ('AIQ' | 'INI')
 * @returns {object} { builtFrom: [...], branches: [...] } sorted by display
 */
function buildBranchCatalog({ indexes, quota }) {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    throw new TypeError('buildBranchCatalog needs at least one counselling index');
  }
  if (typeof quota !== 'string' || !quota) {
    throw new TypeError('buildBranchCatalog needs the exam counselling pool quota');
  }

  // key → { display, variants:Set, perYear:Map(yearTag → {groups, institutes:Set}) }
  const byKey = new Map();
  const builtFrom = [];

  for (const index of indexes) {
    builtFrom.push({
      snapshotId: index.snapshotId,
      year: index.examYear,
      ...(index.session ? { session: index.session } : {}),
    });
    const courseKeys = index.courses.map(normalizeKey);

    // per-year aggregation for this index
    const yearTag = index.examYear;
    const perKey = new Map(); // key → { groups, institutes:Set }
    for (const row of index.rows) {
      if (row.quota !== quota) continue;
      const key = courseKeys[row.courseIdx];
      let agg = perKey.get(key);
      if (!agg) {
        agg = { groups: 0, institutes: new Set() };
        perKey.set(key, agg);
      }
      agg.groups += 1;
      agg.institutes.add(normalizeKey(index.institutes[row.instituteIdx]));
    }

    // merge into the cross-year catalog
    for (const [key, agg] of perKey) {
      let entry = byKey.get(key);
      if (!entry) {
        entry = { display: null, displayYear: -Infinity, variants: new Set(), perYear: new Map() };
        byKey.set(key, entry);
      }
      entry.perYear.set(yearTag, { groups: agg.groups, instituteCount: agg.institutes.size });
      // representative display = raw variant from the LATEST year carrying the key
      const raw = index.courses[courseKeys.indexOf(key)] ?? null;
      if (raw !== null && yearTag > entry.displayYear) {
        // indexOf finds the first index with this key — one raw variant is enough
        entry.display = raw;
        entry.displayYear = yearTag;
      }
    }
    // raw variants (dedup across years; a key can map to several raw spellings)
    for (let i = 0; i < index.courses.length; i += 1) {
      const key = courseKeys[i];
      const entry = byKey.get(key);
      if (entry) entry.variants.add(index.courses[i]);
    }
  }

  const branches = Array.from(byKey.entries())
    .map(([key, entry]) => ({
      key,
      display: entry.display,
      variants: Array.from(entry.variants).sort(),
      perYear: Object.fromEntries(
        Array.from(entry.perYear.entries()).sort((a, b) => a[0] - b[0])
      ),
    }))
    .sort((a, b) => a.display.localeCompare(b.display) || (a.key < b.key ? -1 : 1));

  return Object.freeze({
    builtFrom,
    branches,
    roundConvention: 'final state (end of counselling)',
  });
}

/**
 * Resolve the historical target rank range for one desired branch (D1).
 *
 * @param {object} args
 *   indexes:   buildCounsellingIndex outputs for the exam
 *   branchKey: normalized catalog key (normalized again defensively)
 *   category:  canonical category — REQUIRED, never defaulted (§3.6)
 *   pwd:       boolean
 *   quota:     exam counselling pool ('AIQ' | 'INI')
 * @returns {object} target result (see DBP §6.2); throws INVALID_INPUT with
 *   suggestions when the branch key is unknown for this exam/pool.
 */
function resolveTarget({ indexes, branchKey, category, pwd, quota }) {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    throw new TypeError('resolveTarget needs at least one counselling index');
  }
  if (typeof branchKey !== 'string' || !branchKey.trim()) {
    throw invalidInput('Select the branch you are targeting.', { field: 'branchKey' });
  }
  if (typeof category !== 'string' || !category) {
    // §3.6: closing ranks are category-specific (2–10×) — never defaulted
    throw invalidInput(
      'Category is required to target a branch (UR / EWS / OBC / SC / ST).',
      { field: 'category' }
    );
  }
  if (typeof pwd !== 'boolean') {
    throw invalidInput('pwd must be true or false.', { field: 'pwd' });
  }
  if (typeof quota !== 'string' || !quota) {
    throw new TypeError('resolveTarget needs the exam counselling pool quota');
  }

  const key = normalizeKey(branchKey);
  const years = [];
  let anyPresent = false; // key exists in ≥1 year under this pool (any category)
  let anyMatched = false; // ≥1 row matches category × pwd too
  let tightest = null; // { closing, year, session?, institute, opening, allottedCount }
  let loosest = null;
  let display = null; // representative raw course string (latest year carrying the key)
  let displayYear = -Infinity;

  for (const index of indexes) {
    const courseKeys = index.courses.map(normalizeKey);
    const rowIdx = new Set();
    for (let i = 0; i < courseKeys.length; i += 1) {
      if (courseKeys[i] === key) rowIdx.add(i);
    }
    const present = rowIdx.size > 0;
    if (present) anyPresent = true;
    if (present && index.examYear > displayYear) {
      display = index.courses[courseKeys.indexOf(key)];
      displayYear = index.examYear;
    }

    let groups = 0;
    let closingMin = null;
    let closingMax = null;
    let tight = null;
    let loose = null;
    for (const row of index.rows) {
      if (!rowIdx.has(row.courseIdx)) continue;
      if (row.quota !== quota || row.category !== category || row.pwd !== pwd) continue;
      groups += 1;
      const detail = {
        institute: index.institutes[row.instituteIdx],
        closing: row.closing,
        opening: row.opening,
        allottedCount: row.allottedCount,
      };
      if (closingMin === null || row.closing < closingMin) {
        closingMin = row.closing;
        tight = detail;
      }
      if (closingMax === null || row.closing > closingMax) {
        closingMax = row.closing;
        loose = detail;
      }
    }
    const matched = groups > 0;
    if (matched) {
      anyMatched = true;
      if (tightest === null || tight.closing < tightest.closing) {
        tightest = { ...tight, year: index.examYear, ...(index.session ? { session: index.session } : {}) };
      }
      if (loosest === null || loose.closing > loosest.closing) {
        loosest = { ...loose, year: index.examYear, ...(index.session ? { session: index.session } : {}) };
      }
    }

    years.push({
      year: index.examYear,
      ...(index.session ? { session: index.session } : {}),
      snapshotId: index.snapshotId,
      present,
      matched,
      groups,
      closingMin: matched ? closingMin : null,
      closingMax: matched ? closingMax : null,
      tightest: matched ? tight : null,
      loosest: matched ? loose : null,
    });
  }

  // Unknown branch for this exam/pool — a client error, with near-miss
  // suggestions from the full catalog (never a silent empty result).
  if (!anyPresent) {
    const catalog = buildBranchCatalog({ indexes, quota });
    const suggestions = suggestBranchKeys(catalog.branches.map((b) => b.key), key);
    throw invalidInput(
      suggestions.length
        ? `Unknown branch '${branchKey}'. Did you mean: ${suggestions.join(' ; ')}?`
        : `Unknown branch '${branchKey}'.`,
      { field: 'branchKey', reason: 'unknown-branch', suggestions }
    );
  }

  // Key exists but nothing matched the category × pwd filter in any year.
  if (!anyMatched) {
    return {
      stage: 'TARGET_RANK',
      branch: { key, display },
      category: { value: category, pwd },
      quota,
      years,
      targetRankRange: null,
      coverage: 'NO_DATA_FOR_FILTER',
      variability: null,
      dataCoverage: {
        years: years.map((y) => y.year),
        snapshotIds: years.map((y) => y.snapshotId),
        roundConvention: 'final state (end of counselling)',
      },
      notes: [
        `No historical closing ranks for this branch under category ${category}${pwd ? ' (PwD)' : ''} — check the category/PwD selection.`,
        NOTES.ESTIMATE_DISCLAIMER,
      ],
    };
  }

  const matchedYears = years.filter((y) => y.matched);
  const targetRankRange = [tightest.closing, loosest.closing];
  const ratio = tightest.closing > 0
    ? Math.round((loosest.closing / tightest.closing) * 100) / 100
    : null;
  const highVariability = ratio !== null && ratio >= DESIRED_BRANCH.HIGH_VARIABILITY_RATIO;

  const coverage = matchedYears.length === 1 ? 'SINGLE_YEAR' : 'MATCHED';
  const notes = [
    'Closing ranks are the final state of counselling (end of all rounds) — the rank of the last seat allotted, historically.',
  ];
  if (coverage === 'SINGLE_YEAR') {
    notes.push(
      `This branch has closing data in ${matchedYears.length} of ${years.length} available ${years[0].session ? 'sessions' : 'years'} only — the target range rests on a single counselling cycle.`
    );
  }
  if (highVariability) notes.push(DESIRED_BRANCH.HIGH_VARIABILITY_NOTE);
  notes.push(NOTES.ESTIMATE_DISCLAIMER);

  return {
    stage: 'TARGET_RANK',
    branch: { key, display },
    category: { value: category, pwd },
    quota,
    years,
    targetRankRange,
    coverage,
    tightest,
    loosest,
    variability: { tightest: tightest.closing, loosest: loosest.closing, ratio, high: highVariability },
    dataCoverage: {
      years: years.map((y) => y.year),
      snapshotIds: years.map((y) => y.snapshotId),
      matchedYears: matchedYears.map((y) => y.year),
      roundConvention: 'final state (end of counselling)',
    },
    notes,
  };
}

/**
 * NEET PG — closing ranks → required score/corrects (Desired Branch Phase 2).
 *
 * Per closing rank: the strict tie-band guaranteed score
 * (distributionModel.requiredScoreForRank — an official-data lookup, not a
 * model, returning a score on the DISTRIBUTION's pattern), converted to the
 * CURRENT pattern's scale by the fraction-parity bridge when the two differ,
 * then to corrects with the exact Tier-1 inverse (transfer.correctsForScore)
 * and rounded UP: fractional corrects are not achievable, and rounding down
 * would understate the requirement (D5).
 *
 * Corrects are NOT scale-free across question counts (2026-09-24 correction
 * of the earlier "scale-free" claim): a 200-question-era score maps to a
 * strictly smaller corrects count on 180 questions (×180/200 at equal
 * fraction). The bridge makes every target pattern-correct.
 *
 * All closings resolve through the distribution snapshot the exam config
 * anchors (2025 / 800-scale) — for 2024 counselling closings this assumes the
 * two years' score↔rank mappings are comparable, and for the 2026-pattern
 * inputs it assumes fraction parity across the 800↔720 patterns. Both
 * assumptions are echoed in the returned notes.
 *
 * @param {object} args
 *   closingRanks: number[] — ranks to resolve (typically [tightest, loosest])
 *   distModel:    buildDistributionModel output (official score↔rank bands)
 *   pattern:      the pattern corrects are expressed on (current exam config)
 *   patternVersion: the pattern's version string (mismatch guard)
 *   bridge:       patternBridge output, REQUIRED when patternVersion differs
 *                 from distModel.patternVersion (never silent mixing)
 *   ruleId:       versioned rule id (config default; legacy profiles pass
 *                 their own so stored results re-derive byte-identically)
 */
function requiredCorrectsNeetPg({ closingRanks, distModel, pattern, patternVersion, bridge, ruleId }) {
  assertClosingRanks(closingRanks);
  if (!distModel || typeof distModel.requiredScoreForRank !== 'function') {
    throw new TypeError('requiredCorrectsNeetPg needs a built distribution model');
  }
  if (
    distModel.patternVersion &&
    (patternVersion || pattern.version) &&
    distModel.patternVersion !== (patternVersion || pattern.version) &&
    !bridge
  ) {
    throw new Error(
      `requiredCorrectsNeetPg: distribution is ${distModel.patternVersion} but corrects are wanted on ` +
        `${patternVersion || pattern.version} — an explicit pattern bridge is required (patternBridge.js).`
    );
  }

  const perClosing = closingRanks.map((closing) => {
    const resolved = distModel.requiredScoreForRank(closing); // anchor-space score
    if (resolved.state === 'above') {
      const best = bridge ? Math.round(bridge.toPatternScore(distModel.maxScore)) : distModel.maxScore;
      return {
        closing,
        score: null,
        corrects: null,
        state: 'above-distribution',
        bounded: true,
        note:
          `This branch historically closed inside the top recorded scores — clearing it needs better than the best ` +
          `recorded score (${distModel.maxScore} on the 2025 800-mark pattern${bridge ? `, about ${best} on today's ${pattern.maxMarks}-mark pattern` : ''}). ` +
          `No finite target can be stated from the data.`,
      };
    }
    // resolved.score is set for every other case (band score, or minScore for
    // a closing beyond the recorded field — an upper bound, flagged).
    const beyondField = closing > distModel.lastRank;
    const patternScore = bridge ? bridge.toPatternScore(resolved.score) : resolved.score;
    const corrects = Math.min(
      pattern.totalQuestions,
      Math.max(0, Math.ceil(correctsForScore(patternScore, pattern)))
    );
    return {
      closing,
      /** Required score on the pattern the student is examined under. */
      score: patternScore,
      /** The official-data score it was resolved at (snapshot's scale). */
      anchorScore: resolved.score,
      corrects,
      state: 'in-distribution',
      bounded: beyondField,
      ...(beyondField
        ? {
            note:
              `This closing sits beyond the last recorded rank (${distModel.lastRank.toLocaleString('en-US')}) — ` +
              `the required score is bounded by the lowest recorded score.`,
          }
        : {}),
    };
  });

  const notes = [
    'Required scores are exact lookups over the official score↔rank distribution: scoring this much lands at or better than the historical closing rank even in the worst tie position.',
    `Historical closing ranks are resolved through the ${distModel.snapshotId} distribution — cross-year use assumes comparable score↔rank mappings between counselling years.`,
  ];
  if (bridge) {
    notes.push(
      `The distribution is on the older ${bridge.anchorPatternVersion} pattern; targets are converted to today's ` +
        `${bridge.patternVersion} pattern by fraction of maximum marks (bridge ${bridge.id}) — the same relative performance, on the current question count.`,
      NOTES.PATTERN_BRIDGE
    );
  }
  notes.push(
    'Required corrects follow from the exam pattern under the same assumptions as the forward predictor (all questions attempted, full-length, difficulty parity).',
    NOTES.ESTIMATE_DISCLAIMER
  );

  return {
    stage: 'REQUIRED_CORRECTS',
    rule: ruleId || DESIRED_BRANCH.RULES.NEET_PG_REQUIRED,
    distribution: {
      snapshotId: distModel.snapshotId,
      numericPairs: distModel.numericPairs,
      lastRank: distModel.lastRank,
      patternVersion: distModel.patternVersion,
      ...(bridge ? { bridge: { id: bridge.id, patternVersion: bridge.patternVersion } } : {}),
    },
    perClosing,
    notes,
  };
}

/**
 * INI-CET — closing ranks → required marks/corrects (Desired Branch Phase 2).
 *
 * Per closing rank: the inverse crowd ladder (buildPriorModel.marksForAir —
 * log-space inverse of the same runtime points, no extrapolation) → marks →
 * corrects (exact pattern inverse, rounded up, D5).
 *
 * In the REVERSE direction the crowd ladder is the load-bearing step: AIIMS
 * has never published INI-CET marks, so there is no official ground truth for
 * AIR→marks anywhere. Every result carries the crowd-sourced labelling (and
 * the UR-only warning is the strategy's job for reserved categories, §9).
 *
 * Bounded ends (DBP D7 rules): above-ladder (closing better than the best
 * rung) → no finite corrects value can be stated, ladderEndCorrects echoed
 * for context only; below-ladder (closing beyond the last rung) → the ladder
 * floor's corrects are used as a CONSERVATIVE requirement (that many corrects
 * historically cleared any rank beyond the ladder floor) and labelled bounded.
 *
 * @param {object} args
 *   closingRanks: number[]
 *   priorModel:   buildPriorModel output (crowd corrects↔AIR ladder)
 *   pattern:      EXAMS.INI_CET.pattern
 */
function requiredCorrectsIniCet({ closingRanks, priorModel, pattern }) {
  assertClosingRanks(closingRanks);
  if (!priorModel || typeof priorModel.marksForAir !== 'function') {
    throw new TypeError('requiredCorrectsIniCet needs a built prior model');
  }

  // correctsSpan ascends with the ladder ([110, 160] today): the FLOOR rung
  // (fewest corrects, worst AIR) is first; airSpan echoes pts order
  // ([worstAir, bestAir]) — never index it as if it ascended.
  const [floorCorrects, bestCorrects] = priorModel.correctsSpan;
  const bestAir = Math.min(...priorModel.airSpan);
  const worstAir = Math.max(...priorModel.airSpan);
  const perClosing = closingRanks.map((closing) => {
    const resolved = priorModel.marksForAir(closing);
    if (resolved.state === 'above-ladder') {
      return {
        closing,
        marks: null,
        corrects: null,
        state: 'above-ladder',
        bounded: true,
        ladderEndCorrects: bestCorrects,
        note:
          `This branch historically closed at AIR ${closing.toLocaleString('en-US')} — better than the crowd ladder's best rung ` +
          `(AIR ${bestAir.toLocaleString('en-US')} at ≈${bestCorrects} corrects). More than ${bestCorrects} corrects were needed; ` +
          `the ladder cannot resolve how many.`,
      };
    }
    if (resolved.state === 'below-ladder') {
      return {
        closing,
        marks: null,
        corrects: floorCorrects,
        state: 'below-ladder',
        bounded: true,
        ladderEndCorrects: floorCorrects,
        note:
          `This closing (AIR ${closing.toLocaleString('en-US')}) is beyond the crowd ladder's floor rung (AIR ${worstAir.toLocaleString('en-US')} at ` +
          `≈${floorCorrects} corrects) — historically ≈${floorCorrects} corrects already cleared it. The ladder cannot resolve a tighter target.`,
      };
    }
    const corrects = Math.max(0, Math.ceil(correctsForScore(resolved.marks, pattern)));
    return {
      closing,
      marks: Math.round(resolved.marks * 100) / 100, // display rounding only
      corrects,
      state: 'in-ladder',
      bounded: false,
    };
  });

  return {
    stage: 'REQUIRED_CORRECTS',
    rule: DESIRED_BRANCH.RULES.INI_CET_REQUIRED,
    prior: {
      priorId: priorModel.priorId,
      provenance: 'crowd-sourced (UR-only) — the load-bearing step in this direction',
      points: priorModel.points,
      correctsSpan: priorModel.correctsSpan,
      airSpan: priorModel.airSpan,
      urOnly: priorModel.urOnly,
    },
    perClosing,
    notes: [
      'AIIMS has never published INI-CET marks. The AIR→marks step uses a crowd-sourced ladder (Dr Mayukh Hazra compilations, UR-only) as a labelled prior — an estimate with no official ground truth. Do not read the corrects numbers as exact thresholds.',
      `Ladder rungs span AIR ${bestAir.toLocaleString('en-US')}–${worstAir.toLocaleString('en-US')} (≈${bestCorrects}–${floorCorrects} corrects, ${priorModel.points} points); closings outside that span get bounded statements, never extrapolated numbers.`,
      'Required corrects follow from the exam pattern under the same assumptions as the forward predictor (all questions attempted, full-length, difficulty parity).',
      NOTES.ESTIMATE_DISCLAIMER,
    ],
  };
}

/** Shared input check for the reverse resolvers. */
function assertClosingRanks(closingRanks) {
  if (!Array.isArray(closingRanks) || closingRanks.length === 0) {
    throw new TypeError('reverse resolvers need a non-empty closingRanks array');
  }
  for (const r of closingRanks) {
    if (!Number.isFinite(r) || r < 1) {
      throw new TypeError(`closing ranks must be numbers ≥ 1 (got ${String(r)})`);
    }
  }
}

/** Round to 2 decimals without float noise (display only — never state math). */
function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Aggregation summary for the optional current-GT block — mirrors the forward
 * result's aggregation shape (index.js) so the UI reuses one renderer.
 */
function summarizeAggregation(aggregation) {
  return {
    n: aggregation.stats.n,
    values: aggregation.stats.values,
    mean: round2(aggregation.stats.mean),
    median: round2(aggregation.stats.median),
    trimmedMean: aggregation.stats.trimmedMean === null ? null : round2(aggregation.stats.trimmedMean),
    sd: round2(aggregation.stats.sd),
    min: aggregation.stats.min,
    max: aggregation.stats.max,
    range: aggregation.stats.range,
    lowDataCaution: aggregation.stats.n <= LOW_GT_COUNT.max,
  };
}

/**
 * Gap computation — the D7 normative rules (docs/DESIRED_BRANCH_PREDICTOR.md
 * "D7 — exact state rules"). Thresholds are the required-corrects targets
 * themselves; the ONLY comparison rule is the UNROUNDED current mean against
 * the INTEGER thresholds:
 *
 *   ON_TRACK      C ≥ T_safe             (clears even the tightest close)
 *   WITHIN_REACH  T_likely ≤ C < T_safe
 *   BELOW_TARGET  C < T_likely
 *
 * Bounded ends (D7 bounded-end propagation):
 *   safe end bounded-above (no finite target) ⇒ ON_TRACK impossible; the
 *     state falls out of the likely end alone and gapToSafe is null;
 *   both ends unresolvable ⇒ gap omitted entirely (null).
 *
 * @param {object} args
 *   currentMeanCorrects: unrounded mean of deduped per-GT corrects (number)
 *   required: requiredCorrectsNeetPg/IniCet output (perClosing length ≥ 2,
 *             [safe(tightest closing), likely(loosest closing)])
 */
function computeGap({ currentMeanCorrects, required }) {
  if (!required || !Array.isArray(required.perClosing) || required.perClosing.length < 2) {
    return null;
  }
  const [safeEntry, likelyEntry] = required.perClosing;
  const tSafe = typeof safeEntry.corrects === 'number' ? safeEntry.corrects : null;
  const tLikely = typeof likelyEntry.corrects === 'number' ? likelyEntry.corrects : null;
  const bounded = { safe: safeEntry.bounded === true, likely: likelyEntry.bounded === true };

  if (currentMeanCorrects === null || currentMeanCorrects === undefined) {
    return { status: 'NO_CURRENT_DATA', gapToSafe: null, gapToLikely: null, bounded };
  }
  if (!Number.isFinite(currentMeanCorrects)) {
    throw new TypeError('computeGap needs a numeric currentMeanCorrects');
  }
  // Both ends above-bounded (no finite target anywhere): omit the gap (D7).
  if (tSafe === null && tLikely === null) {
    return null;
  }

  let status;
  if (tSafe !== null && currentMeanCorrects >= tSafe) {
    status = 'ON_TRACK';
  } else if (tLikely !== null && currentMeanCorrects >= tLikely) {
    // also the only reachable branch when tSafe is null (safe end bounded-above)
    status = 'WITHIN_REACH';
  } else {
    status = 'BELOW_TARGET';
  }

  return {
    status,
    gapToSafe: tSafe === null ? null : round2(currentMeanCorrects - tSafe),
    gapToLikely: tLikely === null ? null : round2(currentMeanCorrects - tLikely),
    bounded,
  };
}

/**
 * Assemble the full Desired Branch result (Phase 3 engine surface — DBP §6).
 * Exam-agnostic composition: the strategy supplies its own
 * `resolveRequired(closingRanks)` (official distribution vs crowd ladder) and
 * the snapshot metadata for the method block.
 *
 * @param {object} args
 *   examConfig:       EXAMS entry (id/label/quotaScope/pattern consumer)
 *   methodVersion:    DESIRED_BRANCH.METHOD_VERSION_*
 *   kind:             'NEET_PG' | 'INI_CET' (drives the §9 weak-step warnings)
 *   indexes:          counselling indexes (cached per strategy)
 *   validated:        validateDesiredBranchRequest output
 *   resolveRequired:  (closingRanks) => required resolver output
 *   reverseDataMeta:  { distribution?: snapshotId, prior?: priorId }
 */
function buildDesiredBranchResult({
  examConfig,
  methodVersion,
  kind,
  indexes,
  validated,
  resolveRequired,
  reverseDataMeta = {},
}) {
  const target = resolveTarget({
    indexes,
    branchKey: validated.branchKey,
    category: validated.category.value,
    pwd: validated.category.pwd,
    quota: validated.quota,
  });

  let required = null;
  if (target.targetRankRange) {
    required = resolveRequired(target.targetRankRange);
  }

  let current = null;
  let gap = null;
  let aggregation = null;
  if (validated.gts) {
    aggregation = aggregate(validated.gts);
    current = {
      gts: aggregation.perGt,
      aggregation: summarizeAggregation(aggregation),
      // display-rounded; gap states use the UNROUNDED mean (D7)
      meanCorrects: round2(aggregation.stats.mean),
    };
    gap = computeGap({ currentMeanCorrects: aggregation.stats.mean, required });
  } else if (required) {
    gap = computeGap({ currentMeanCorrects: null, required });
  }

  // --- warnings (§14-style: codes the UI renders; never confidence %) ---
  const warnings = [];
  if (target.variability && target.variability.high) {
    warnings.push({ code: 'HIGH_VARIABILITY', note: DESIRED_BRANCH.HIGH_VARIABILITY_NOTE });
  }
  if (current) {
    if (current.aggregation.n <= LOW_GT_COUNT.max) {
      warnings.push({ code: 'LOW_GT_COUNT', note: LOW_GT_COUNT.note });
    }
    if (aggregation.perGt.some((g) => g.selected && g.selected.skippedCount > 0)) {
      warnings.push({
        code: 'NO_SKIP_ASSUMPTION_WEAKENED',
        note:
          'One or more selected Grand Test attempts had skipped questions; the no-skip assumption (and therefore the current average) is weakened for those GTs.',
      });
    }
  }
  if (kind === 'INI_CET' && required) {
    // §9 labelling — in the reverse direction the crowd ladder is the
    // load-bearing step (AIIMS has never published marks)
    warnings.push({
      code: 'CROWD_SOURCED_PRIOR',
      note:
        'AIIMS has never published INI-CET marks. The rank→marks step behind these required-corrects numbers uses a crowd-sourced ladder (Dr Mayukh Hazra compilations) as a labelled prior — an estimate with no official ground truth.',
    });
    if (validated.category.value !== 'UR') {
      warnings.push({
        code: 'PRIOR_UR_ONLY',
        note:
          `The crowd-sourced prior behind the rank→marks step is UR-only; for category ${validated.category.value} the estimate is weaker still (spec §9).`,
      });
    }
  }

  // --- notes: target + required, order-preserving dedupe ---
  const seen = new Set();
  const notes = [];
  for (const note of [...target.notes, ...(required ? required.notes : [])]) {
    if (!seen.has(note)) {
      seen.add(note);
      notes.push(note);
    }
  }

  return {
    exam: examConfig.id,
    examLabel: examConfig.label,
    method: {
      version: methodVersion,
      stage: 'REQUIRED_PERFORMANCE',
      assumptions: ['no-skip', 'full-length-standard-pattern', 'difficulty-parity'],
      /** Pattern the required-corrects targets are expressed on (§10 echo). */
      pattern: { ...examConfig.pattern, version: examConfig.patternVersion },
      datasetSnapshots: {
        counselling: target.dataCoverage.snapshotIds,
        distribution: reverseDataMeta.distribution || null,
        prior: reverseDataMeta.prior || null,
      },
    },
    input: {
      branch: target.branch,
      category: validated.category,
      pwd: validated.category.pwd,
      quota: validated.quota,
      quotaLabel: examConfig.quotaScope.label,
      gts: current ? current.gts : null,
    },
    target,
    required,
    current,
    gap,
    warnings,
    notes,
  };
}

module.exports = {
  normalizeKey,
  buildBranchCatalog,
  resolveTarget,
  requiredCorrectsNeetPg,
  requiredCorrectsIniCet,
  computeGap,
  buildDesiredBranchResult,
};
