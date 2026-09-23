#!/usr/bin/env node
'use strict';

/**
 * Desired Branch Predictor — Phase 7 done-when acceptance script
 * (docs/DESIRED_BRANCH_PREDICTOR.md §8 Phase 7, §9, §13.6).
 *
 * Walks EVERY §9 edge case through the engine over the committed snapshots
 * (real data, not fixtures), then runs a full census: every catalog branch ×
 * category × PwD for both exams through engine.predictRequired, checking the
 * global invariants (integer ceil'd corrects, monotonic safe ≥ likely ends,
 * warning-code rules, session tags, anchor years, D7 gap shapes).
 *
 * Cases that live above the engine (HTTP auth/CSRF/rate-limit, persistence
 * drift) are pinned by tests/predictorApi.test.js — noted inline, not re-run
 * here (no DB dependency by design, so this stays CI-able next to jest).
 *
 * Exit 0 = every case PASS; exit 1 = any violation.
 * Run: node scripts/desiredBranch/verify_edge_cases.js
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { createPredictorEngine } = require(path.join(ROOT, 'server', 'predictor'));
const { PredictorError } = require(path.join(ROOT, 'server', 'predictor', 'errors'));
const store = require(path.join(ROOT, 'server', 'predictor', 'store'));
const { buildDistributionModel } = require(path.join(ROOT, 'server', 'predictor', 'distributionModel'));
const { EXAMS } = require(path.join(ROOT, 'server', 'predictor', 'config'));
const {
  requiredCorrectsNeetPg,
  computeGap,
} = require(path.join(ROOT, 'server', 'predictor', 'desiredBranch'));
const { buildPatternBridge } = require(path.join(ROOT, 'server', 'predictor', 'patternBridge'));

const engine = createPredictorEngine();

// NEET PG corrects live on the 180-question pattern; the distribution is
// 800-scale — reverse resolutions go through the fraction-parity bridge.
const neetBridge = buildPatternBridge({
  pattern: EXAMS.NEET_PG.pattern,
  anchorPattern: EXAMS.NEET_PG.distribution.anchorPattern,
});

let failures = 0;
function check(label, ok, detail) {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Run predictRequired expecting a PredictorError; returns it (or null). */
function expectError(request, messagePattern) {
  try {
    engine.predictRequired(request);
  } catch (e) {
    check(`error shape (${messagePattern})`, e instanceof PredictorError, `got ${e && e.constructor.name}`);
    check(`error message (${messagePattern})`, messagePattern.test(e.message), e.message);
    return e;
  }
  check(`error thrown (${messagePattern})`, false, 'predictRequired returned without throwing');
  return null;
}

const gtOf = (total) => (corrects, extra = {}) => ({
  gtId: null,
  provenance: 'self-reported',
  attempts: [{
    corrects, totalQuestions: total, status: 'completed', endedAt: null,
    retestApprovedUsed: false, skippedCount: 0, ...extra,
  }],
});
// NEET PG runs the 180-question pattern (2026-09-24 migration); INI-CET 200.
const gt = gtOf(180);
const iniGt = gtOf(200);
const gts = (...list) => list.map((c) => (typeof c === 'number' ? gt(c) : c));

// Golden anchors (pinned by the phase suites; re-asserted end to end here).
const NEET_GM = 'm.d. (general medicine)';
const INI_GM = 'general medicine';
const CATEGORIES = ['UR', 'EWS', 'OBC', 'SC', 'ST'];

console.log('Desired Branch Predictor — §9 edge-case walk (engine + committed data)\n');

// ---- §9 case 1 — unknown branch → typed error + near-miss suggestions -------
{
  const err = expectError(
    { exam: 'NEET_PG', branchKey: 'general medicin', category: 'UR' },
    /Did you mean/
  );
  if (err) {
    check('case 1: suggestions land in the normalized key space',
      (err.details.suggestions || []).includes(NEET_GM),
      JSON.stringify(err.details.suggestions));
  }
  console.log('case 1  unknown branch → INVALID_INPUT + suggestions ............ checked');
}

// ---- §9 case 2 — NO_DATA_FOR_FILTER (branch exists, filter empty) ------------
{
  const r = engine.predictRequired({
    exam: 'INI_CET', branchKey: 'dermatology, venerology & leprosy', category: 'ST',
  });
  check('case 2: coverage state', r.target.coverage === 'NO_DATA_FOR_FILTER', r.target.coverage);
  check('case 2: no target range', r.target.targetRankRange === null);
  check('case 2: required omitted', r.required === null);
  check('case 2: gap omitted', r.gap === null);
  check('case 2: note names the selection (no UR fallback)', /ST/.test(r.target.notes[0]));
  check('case 2: per-year rows still present (UI shows where it existed)',
    r.target.years.length === 6 && r.target.years.every((y) => !y.matched));
  console.log('case 2  NO_DATA_FOR_FILTER .......................................... checked');
}

// ---- §9 case 3 — unsupported exams -------------------------------------------
{
  for (const exam of ['FMGE', 'UPSC_CMS']) {
    expectError({ exam, branchKey: NEET_GM, category: 'UR' }, /Unknown exam '.+\. Supported: NEET_PG, INI_CET/);
  }
  const listed = engine.listExams();
  check('case 3: registry exposes exactly NEET PG + INI-CET, both available',
    listed.length === 2 && listed.every((e) => ['NEET_PG', 'INI_CET'].includes(e.id) && e.available),
    JSON.stringify(listed.map((e) => `${e.id}:${e.available}`)));
  console.log('case 3  unsupported exams (FMGE / UPSC CMS) ........................ checked');
}

// ---- §9 case 4 — insufficient history (SINGLE_YEAR) ---------------------------
{
  const r = engine.predictRequired({
    exam: 'NEET_PG', branchKey: 'dip. in forensic medicine', category: 'UR',
  });
  check('case 4: SINGLE_YEAR coverage', r.target.coverage === 'SINGLE_YEAR', r.target.coverage);
  check('case 4: range degenerates to the one matched year',
    JSON.stringify(r.target.targetRankRange) === '[85144,121667]',
    JSON.stringify(r.target.targetRankRange));
  const y2024 = r.target.years.find((y) => y.year === 2024);
  check('case 4: absent year flagged present-but-unmatched',
    y2024.present === true && y2024.matched === false && y2024.groups === 0);
  check('case 4: explicit single-cycle note', /single counselling cycle/.test(r.target.notes.join(' ')));
  console.log('case 4  SINGLE_YEAR (present one year only) ....................... checked');
}

// ---- §9 case 5 — final-state semantics labelled -------------------------------
{
  const r = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  check('case 5: final-state note present', /final state of counselling/.test(r.target.notes.join(' ')));
  check('case 5: roundConvention echoed',
    /final state \(end of counselling\)/.test(r.target.dataCoverage.roundConvention));
  console.log('case 5  final-state (end of counselling) labels ................... checked');
}

// ---- §9 case 6 — reserved categories -----------------------------------------
{
  const ur = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  const obc = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'OBC' });
  check('case 6: reserved-category target differs from UR (§3.6)',
    JSON.stringify(obc.target.targetRankRange) === '[174,10075]' &&
    JSON.stringify(ur.target.targetRankRange) === '[13,9511]',
    `UR ${JSON.stringify(ur.target.targetRankRange)} OBC ${JSON.stringify(obc.target.targetRankRange)}`);
  check('case 6: NEET PG carries no UR-only-prior warning',
    !obc.warnings.some((w) => w.code === 'PRIOR_UR_ONLY'));
  const st = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'ST' });
  check('case 6: INI-CET reserved category adds PRIOR_UR_ONLY',
    st.warnings.some((w) => w.code === 'PRIOR_UR_ONLY'));
  console.log('case 6  reserved categories (+ PRIOR_UR_ONLY on INI-CET) ......... checked');
}

// ---- §9 case 7 — quota scope --------------------------------------------------
{
  expectError(
    { exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', quota: 'DNB' },
    /currently cover/
  );
  const ini = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR' });
  check('case 7: INI single pool echoed (no input dimension)',
    ini.input.quota === 'INI' && /INI counselling pool/i.test(ini.input.quotaLabel),
    `${ini.input.quota} ${ini.input.quotaLabel}`);
  console.log('case 7  quota scope (AIQ-only message; INI pool echoed) ........... checked');
}

// ---- §9 case 8 — PwD ----------------------------------------------------------
{
  const r = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR', pwd: true });
  check('case 8: PwD filter isolates PwD seats (golden)',
    JSON.stringify(r.target.targetRankRange) === '[659,47087]',
    JSON.stringify(r.target.targetRankRange));
  expectError({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', pwd: 'yes' }, /pwd must be true or false/);
  expectError({ exam: 'NEET_PG', branchKey: NEET_GM, pwd: true }, /Category is required/);
  console.log('case 8  PwD filter; pwd-without-category rejected ................ checked');
}

// ---- §9 case 9 — NEET PG beyond the distribution ------------------------------
{
  // With the committed 2025 snapshot the top band is a single rank ([1,1] at
  // 707), so EVERY valid closing rank (≥ 1) resolves exactly and the
  // above-distribution state is defensive-only — the census below proves 0
  // occurrences in real data. The reachable bound is beyond the last rank
  // (also theoretical today: max closing 230,087 < lastRank 230,114).
  const distModel = buildDistributionModel(store.loadNeetPgDistribution().data);
  const pattern = EXAMS.NEET_PG.pattern;
  check('case 9: the best closing possible (rank 1) resolves exactly',
    distModel.requiredScoreForRank(1).score === distModel.maxScore);
  const above = distModel.requiredScoreForRank(0);
  check('case 9: above-distribution state machinery exists below rank 1 (defensive)',
    above.state === 'above');
  const below = requiredCorrectsNeetPg({
    closingRanks: [distModel.lastRank + 1], distModel, pattern, bridge: neetBridge,
  }).perClosing[0];
  check('case 9: closing beyond the last rank → bounded by the lowest recorded score',
    below.bounded === true && /beyond the last recorded rank/.test(below.note));
  console.log('case 9  NEET PG distribution bounds (top band [1,1]; 0 real ends) checked');
}

// ---- §9 case 10 — INI-CET beyond the ladder -----------------------------------
{
  const r = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR' });
  const [safe, likely] = r.required.perClosing;
  check('case 10: above-ladder end states the bound, never a number',
    safe.state === 'above-ladder' && safe.corrects === null && safe.bounded === true &&
    /crowd ladder's best rung/.test(safe.note));
  const pwd = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR', pwd: true });
  const loose = pwd.required.perClosing[1];
  check('case 10: below-ladder end uses the conservative floor, labelled bounded',
    loose.state === 'below-ladder' && loose.corrects === 110 && loose.bounded === true);
  console.log('case 10  INI-CET above/below-ladder states ....................... checked');
}

// ---- §9 cases 11–13 — optional GTs and the D7 gap -----------------------------
{
  const T_SAFE = 160; // golden: GM UR safe end (bridged, 180-question pattern)
  const T_LIKELY = 137;

  const none = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  check('case 11: no GTs → current omitted, NO_CURRENT_DATA (target-only result)',
    none.current === null && none.gap && none.gap.status === 'NO_CURRENT_DATA');

  const one = engine.predictRequired({
    exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: gts(100),
  });
  check('case 12: one GT computes the gap with the low-data caution',
    one.current.aggregation.n === 1 &&
    one.warnings.some((w) => w.code === 'LOW_GT_COUNT') &&
    one.current.aggregation.lowDataCaution === true &&
    one.gap.status === 'BELOW_TARGET');

  const onTrack = engine.predictRequired({
    exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: gts(170, 180),
  });
  check('case 13: mean above the safe end → ON_TRACK',
    onTrack.gap.status === 'ON_TRACK' && onTrack.gap.gapToSafe === 15,
    JSON.stringify(onTrack.gap));

  // D7 boundary rules: inclusive at both thresholds, unrounded mean compared.
  const atSafe = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: gts(160, 160) });
  check('D7: C ≥ T_safe inclusive (mean 160 = T_safe → ON_TRACK)', atSafe.gap.status === 'ON_TRACK');
  const fracAbove = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: gts(159, 162) });
  check('D7: unrounded mean decides (160.5 → ON_TRACK, not rounded down to 160)',
    fracAbove.gap.status === 'ON_TRACK' && fracAbove.gap.gapToSafe === 0.5,
    JSON.stringify(fracAbove.gap));
  const fracBelow = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: gts(159, 160) });
  check('D7: unrounded mean decides (159.5 < 160 → WITHIN_REACH)',
    fracBelow.gap.status === 'WITHIN_REACH');
  const atLikely = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR', gts: gts(137, 137) });
  check('D7: T_likely ≤ C < T_safe (mean 137 → WITHIN_REACH)', atLikely.gap.status === 'WITHIN_REACH');

  // Bounded-end propagation (D7): safe end above-ladder → ON_TRACK impossible.
  const bounded = engine.predictRequired({
    exam: 'INI_CET', branchKey: INI_GM, category: 'UR', gts: [iniGt(140), iniGt(138)],
  });
  check('D7: bounded safe end → state from the likely end alone, gapToSafe null',
    bounded.gap.status === 'WITHIN_REACH' && bounded.gap.gapToSafe === null &&
    bounded.gap.bounded.safe === true);
  const bothBounded = computeGap({
    currentMeanCorrects: 150,
    required: { perClosing: [{ corrects: null, bounded: true }, { corrects: null, bounded: true }] },
  });
  check('D7: both ends unresolvable → gap omitted entirely', bothBounded === null);
  void T_SAFE; void T_LIKELY;
  console.log('cases 11–13 + D7 rules (optional GTs, gap states, bounds) ......... checked');
}

// ---- §9 case 14 — HIGH_VARIABILITY -------------------------------------------
{
  const r = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  check('case 14: ratio ≥ 2 flags the warning and the variability block',
    r.target.variability.high === true && r.target.variability.ratio >= 2 &&
    r.warnings.some((w) => w.code === 'HIGH_VARIABILITY'));
  console.log('case 14  HIGH_VARIABILITY (ratio ≥ 2) ............................ checked');
}

// ---- §9 case 15 — INI-CET sessions -------------------------------------------
{
  const r = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR' });
  check('case 15: every per-cycle row session-tagged with its own snapshot',
    r.target.years.length === 6 &&
    r.target.years.every((y) => /^DS-INICET-COUNSELLING-\d{6}-v1$/.test(y.snapshotId) &&
      /^\d{4}-(01|07)$/.test(y.session)),
    JSON.stringify(r.target.years.map((y) => y.session)));
  check('case 15: Jan/Jul of one year stay distinct',
    new Set(r.target.years.map((y) => y.session)).size === 6);
  console.log('case 15  INI-CET per-session rows (YYYYMM tags) .................. checked');
}

// ---- §9 case 16 — anchor years echoed, no projection --------------------------
{
  const r = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  check('case 16: anchors are exactly the ingested counselling years',
    JSON.stringify(r.target.dataCoverage.years) === '[2024,2025]',
    JSON.stringify(r.target.dataCoverage.years));
  const ini = engine.predictRequired({ exam: 'INI_CET', branchKey: INI_GM, category: 'UR' });
  check('case 16: INI-CET anchors are the six ingested sessions',
    ini.target.dataCoverage.years.length === 6 && ini.target.dataCoverage.years.every((y) => y <= 202601));
  console.log('case 16  anchor years/sessions echoed (no 2026+ projection) ..... checked');
}

// ---- §9 case 17 — institute absent in one year --------------------------------
{
  // N/A in V1 by decision D2 (branch-only): there is no institute dimension
  // to be absent. The branch-level analog — per-cycle presence flags the UI
  // renders as "not offered" rows — is asserted instead.
  const r = engine.predictRequired({ exam: 'NEET_PG', branchKey: 'dip. in forensic medicine', category: 'UR' });
  check('case 17 (D2 analog): per-cycle presence flags present',
    r.target.years.every((y) => typeof y.present === 'boolean'));
  console.log('case 17  institute scoping N/A in V1 (D2); presence flags ........ checked');
}

// ---- §9 case 18 — fractional required corrects ceil ---------------------------
{
  const distModel = buildDistributionModel(store.loadNeetPgDistribution().data);
  const pattern = EXAMS.NEET_PG.pattern;
  // Bridged golden (2026-09-24): closing 6 → anchor 695 → 720-scale 625.5 →
  // ceil((625.5+180)/5) = ceil(161.1) = 162 on the 180-question pattern
  const e = requiredCorrectsNeetPg({ closingRanks: [6], distModel, pattern, bridge: neetBridge }).perClosing[0];
  check('case 18: golden closing 6 → anchor 695 → 625.5/720 → 162 corrects (rounds up, never down)',
    e.anchorScore === 695 && e.score === 625.5 && e.corrects === 162,
    `anchor ${e.anchorScore} score ${e.score} corrects ${e.corrects}`);
  console.log('case 18  ceil rounding (golden 6 → 695 → 625.5 → 162) ........... checked');
}

// ---- §9 case 19 — persisted re-derivation drift -------------------------------
{
  // Persistence drift is an API-layer behaviour (Mongo + supertest); pinned by
  // tests/predictorApi.test.js ("flags method drift … §9 case 19"). The engine
  // precondition it rests on — determinism — is what this script can prove:
  const a = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  const b = engine.predictRequired({ exam: 'NEET_PG', branchKey: NEET_GM, category: 'UR' });
  check('case 19 precondition: re-derivation is byte-deterministic',
    JSON.stringify(a) === JSON.stringify(b));
  console.log('case 19  re-derivation drift (API-pinned; determinism proven) .... checked');
}

// ---- census: every branch × category × PwD through the engine ------------------
console.log('\ncensus — every catalog branch × category × PwD, both exams');
const tally = {
  NEET_PG: { combos: 0, MATCHED: 0, SINGLE_YEAR: 0, NO_DATA_FOR_FILTER: 0, 'above-distribution': 0, 'below-bounded': 0, HIGH_VARIABILITY: 0, gapOmitted: 0 },
  INI_CET: { combos: 0, MATCHED: 0, SINGLE_YEAR: 0, NO_DATA_FOR_FILTER: 0, 'above-ladder': 0, 'below-ladder': 0, HIGH_VARIABILITY: 0, gapOmitted: 0 },
};
let censusExamples = {};

for (const examId of ['NEET_PG', 'INI_CET']) {
  const catalog = engine.branchCatalog(examId);
  const expectedYears = examId === 'NEET_PG' ? 2 : 6;
  for (const branch of catalog.branches) {
    for (const category of CATEGORIES) {
      for (const pwd of [false, true]) {
        const label = `${examId} ${branch.key} ${category}${pwd ? ' PwD' : ''}`;
        tally[examId].combos += 1;
        let r;
        try {
          r = engine.predictRequired({ exam: examId, branchKey: branch.key, category, pwd });
        } catch (e) {
          check(`census ${label}`, false, `threw: ${e.message}`);
          continue;
        }
        const t = tally[examId];
        t[r.target.coverage] += 1;

        // structure
        check(`census ${label} years`, r.target.years.length === expectedYears);
        check(`census ${label} snapshots`, r.method.datasetSnapshots.counselling.length === expectedYears);
        check(`census ${label} current-omitted`, r.current === null);
        check(`census ${label} gap-shape`,
          r.gap === null || r.gap.status === 'NO_CURRENT_DATA');

        if (r.target.coverage === 'NO_DATA_FOR_FILTER') {
          check(`census ${label} nodata-stage-omitted`, r.required === null && r.gap === null);
          continue;
        }

        // target range
        const [tight, loose] = r.target.targetRankRange;
        check(`census ${label} range-order`,
          Number.isInteger(tight) && Number.isInteger(loose) && tight >= 1 && tight <= loose,
          `[${tight}, ${loose}]`);

        // required ends
        const [safeE, likelyE] = r.required.perClosing;
        check(`census ${label} ends-track-closings`,
          safeE.closing === tight && likelyE.closing === loose);
        for (const [endName, end] of [['safe', safeE], ['likely', likelyE]]) {
          if (end.corrects !== null) {
            const maxCorrects = examId === 'NEET_PG' ? 180 : 200;
            check(`census ${label} ${endName}-integer`,
              Number.isInteger(end.corrects) && end.corrects >= 0 && end.corrects <= maxCorrects,
              String(end.corrects));
          } else {
            check(`census ${label} ${endName}-bounded`,
              end.bounded === true && typeof end.note === 'string');
            if (/^above-/.test(end.state)) tally[examId][end.state] += 1;
          }
          if (end.state === 'below-ladder') tally[examId]['below-ladder'] += 1;
          if (end.bounded === true && examId === 'NEET_PG' && end.state === 'in-distribution') {
            tally[examId]['below-bounded'] += 1;
          }
        }
        if (safeE.corrects !== null && likelyE.corrects !== null) {
          check(`census ${label} monotonic`, safeE.corrects >= likelyE.corrects,
            `safe ${safeE.corrects} < likely ${likelyE.corrects}`);
        }
        if (safeE.corrects === null && likelyE.corrects === null) {
          t.gapOmitted += 1;
          censusExamples.gapOmitted ??= label;
        }

        // warning-code rules
        const codes = r.warnings.map((w) => w.code);
        check(`census ${label} variability-consistency`,
          codes.includes('HIGH_VARIABILITY') === (r.target.variability.high === true));
        if (r.target.variability.high) t.HIGH_VARIABILITY += 1;
        if (examId === 'INI_CET') {
          check(`census ${label} crowd-prior-label`, codes.includes('CROWD_SOURCED_PRIOR'));
          check(`census ${label} ur-only-rule`,
            codes.includes('PRIOR_UR_ONLY') === (category !== 'UR'));
        } else {
          check(`census ${label} no-inicet-warnings`,
            !codes.includes('CROWD_SOURCED_PRIOR') && !codes.includes('PRIOR_UR_ONLY'));
        }
      }
    }
  }
}

for (const examId of ['NEET_PG', 'INI_CET']) {
  const t = tally[examId];
  console.log(`  ${examId}: ${t.combos} combos — ${t.MATCHED} matched, ${t.SINGLE_YEAR} single-cycle, ` +
    `${t.NO_DATA_FOR_FILTER} no-data-for-filter` +
    (examId === 'NEET_PG'
      ? `, ${t['above-distribution']} above-distribution ends, ${t['below-bounded']} beyond-last-rank ends`
      : `, ${t['above-ladder']} above-ladder ends, ${t['below-ladder']} below-ladder ends`) +
    `; HIGH_VARIABILITY on ${t.HIGH_VARIABILITY}${t.gapOmitted ? `; gap omitted (both ends bounded) on ${t.gapOmitted} (e.g. ${censusExamples.gapOmitted})` : ''}`);
}

// ---- verdict -------------------------------------------------------------------

if (failures > 0) {
  console.error(`\nDESIRED-BRANCH PHASE 7 EDGE-CASE WALK FAILED: ${failures} violation(s)`);
  process.exit(1);
}
console.log('\nDESIRED-BRANCH PHASE 7 EDGE-CASE WALK PASSED (all §9 cases + census invariants)');
