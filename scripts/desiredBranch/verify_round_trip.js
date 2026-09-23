#!/usr/bin/env node
'use strict';

/**
 * Desired Branch Predictor — Phase 2 done-when acceptance script
 * (docs/DESIRED_BRANCH_PREDICTOR.md §8 Phase 2, §13.7).
 *
 * Verifies the reverse resolvers against EVERY closing rank in the committed
 * counselling snapshots — official data, not samples:
 *
 *  NEET PG — strict tie-band guarantee, end to end: for each closing rank r,
 *    requiredScoreForRank(r).score must satisfy rankIntervalForScore(score).maxR
 *    ≤ r, AND the integer corrects target (ceil of the exact pattern inverse),
 *    forward-mapped through scoreForCorrects, must still clear r.
 *
 *  INI-CET — inverse-ladder round trip + honest span states: for each closing
 *    rank inside the ladder span, marksForAir(airForMarks(m)) === m across the
 *    marks span, in-ladder answers must invert back onto the ladder, and the
 *    above/below-ladder states must fire exactly outside the span (never an
 *    extrapolated number).
 *
 * Exit 0 = all checks green; exit 1 = any violation (CI-able, no jest needed).
 * Run: node scripts/desiredBranch/verify_round_trip.js
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const store = require(path.join(ROOT, 'server', 'predictor', 'store'));
const { buildDistributionModel } = require(path.join(ROOT, 'server', 'predictor', 'distributionModel'));
const { buildPriorModel } = require(path.join(ROOT, 'server', 'predictor', 'inicetTransfer'));
const { buildCounsellingIndex } = require(path.join(ROOT, 'server', 'predictor', 'branchMatching'));
const { scoreForCorrects } = require(path.join(ROOT, 'server', 'predictor', 'transfer'));
const { EXAMS } = require(path.join(ROOT, 'server', 'predictor', 'config'));
const {
  requiredCorrectsNeetPg,
  requiredCorrectsIniCet,
} = require(path.join(ROOT, 'server', 'predictor', 'desiredBranch'));

let failures = 0;
function check(label, ok, detail) {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---- NEET PG -----------------------------------------------------------------

console.log('NEET PG — strict tie-band guarantee over every counselling closing rank');
const distModel = buildDistributionModel(store.loadNeetPgDistribution().data);
const neetPattern = EXAMS.NEET_PG.pattern;
let neetChecked = 0;
let neetAbove = 0;

for (const year of [2024, 2025]) {
  const idx = buildCounsellingIndex(store.loadNeetPgCounselling(year).data);
  for (const row of idx.rows) {
    const r = row.closing;
    const res = distModel.requiredScoreForRank(r);
    if (res.state === 'above') {
      neetAbove += 1;
      check(`y${year} r${r}`, r < 2, 'above-state outside the top band');
      continue;
    }
    const ri = distModel.rankIntervalForScore(res.score);
    check(`y${year} r${r} score ${res.score}`, !ri.state && ri.maxR <= r, `worst rank ${ri.maxR}`);

    // end to end: the integer corrects target still clears the closing
    const e = requiredCorrectsNeetPg({ closingRanks: [r], distModel, pattern: neetPattern }).perClosing[0];
    const fwd = distModel.rankIntervalForScore(scoreForCorrects(e.corrects, neetPattern));
    check(`y${year} r${r} corrects ${e.corrects}`, !fwd.state && fwd.maxR <= r, `forward worst rank ${fwd.maxR}`);
    neetChecked += 1;
  }
}
console.log(`  ${neetChecked.toLocaleString('en-US')} closings verified (0 violations = PASS)` +
  `${neetAbove ? `, ${neetAbove} above-state (top band)` : ''}`);

// ---- INI-CET -----------------------------------------------------------------

console.log('INI-CET — inverse-ladder round trip + span states over every counselling closing rank');
const priorModel = buildPriorModel(store.loadIniCetPrior().data, EXAMS.INI_CET.pattern);
const iniPattern = EXAMS.INI_CET.pattern;
const bestAir = Math.min(...priorModel.airSpan);
const worstAir = Math.max(...priorModel.airSpan);

// ladder inverse identity across the marks span
let worstErr = 0;
for (let m = priorModel.marksSpan[0]; m <= priorModel.marksSpan[1]; m += 0.371) {
  const back = priorModel.marksForAir(priorModel.airForMarks(m));
  worstErr = Math.max(worstErr, Math.abs(back.marks - m));
}
check('ladder round-trip identity', worstErr < 1e-9, `worst |err| ${worstErr}`);
console.log(`  ladder inverse identity over marks ${priorModel.marksSpan[0].toFixed(2)}–${priorModel.marksSpan[1].toFixed(2)}: worst |err| ${worstErr.toExponential(2)} (PASS if < 1e-9)`);

let iniIn = 0;
let iniAbove = 0;
let iniBelow = 0;
for (const session of ['2023-01', '2024-01', '2024-07', '2025-01', '2025-07', '2026-01']) {
  const idx = buildCounsellingIndex(store.loadIniCetCounselling(session).data);
  for (const row of idx.rows) {
    const r = row.closing;
    const e = requiredCorrectsIniCet({ closingRanks: [r], priorModel, pattern: iniPattern }).perClosing[0];
    if (e.state === 'in-ladder') {
      iniIn += 1;
      check(`s${session} r${r}`, r >= bestAir && r <= worstAir && e.corrects >= 110 && e.corrects <= 160,
        `state=${e.state} corrects=${e.corrects}`);
    } else if (e.state === 'above-ladder') {
      iniAbove += 1;
      check(`s${session} r${r}`, r < bestAir && e.corrects === null, 'above-ladder must be strictly better than the best rung');
    } else {
      iniBelow += 1;
      check(`s${session} r${r}`, r > worstAir && e.corrects === 110, 'below-ladder must be beyond the floor rung');
    }
  }
}
console.log(`  ${(iniIn + iniAbove + iniBelow).toLocaleString('en-US')} closings verified: ${iniIn.toLocaleString('en-US')} in-ladder, ${iniAbove} above-ladder, ${iniBelow} below-ladder (0 violations = PASS)`);

// ---- verdict -------------------------------------------------------------------

if (failures > 0) {
  console.error(`\nDESIRED-BRANCH PHASE 2 VERIFICATION FAILED: ${failures} violation(s)`);
  process.exit(1);
}
console.log('\nDESIRED-BRANCH PHASE 2 VERIFICATION PASSED');
