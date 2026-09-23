'use strict';

/**
 * P3 — Width-model calibration inspection (re-runnable, read-only).
 *
 * Prints what the PROVISIONAL range-width constants (config.WIDTH_MODEL)
 * actually produce across the official NBEMS 2025 distribution — the
 * inspected-dataset evidence required by spec §5.3/§11 for any number chosen
 * at implementation time. Phase 4/5 calibration and Phase 11 recalibration
 * re-run this after adjusting constants; the method-version log records both.
 *
 * Usage: node scripts/phase3/calibration_report.js
 */

const path = require('path');
const PREDICTOR_DIR = path.join(__dirname, '..', '..', 'server', 'predictor');
const { createPredictorEngine } = require(path.join(PREDICTOR_DIR, 'index.js'));
const { WIDTH_MODEL, TRANSFER, EXAMS } = require(path.join(PREDICTOR_DIR, 'config.js'));

const engine = createPredictorEngine();
const NEET = EXAMS.NEET_PG.pattern; // 180 questions / 720 marks since the 2026-09-24 migration

const gt = (corrects) => ({ provenance: 'self-reported', attempts: [{ corrects, status: 'completed' }] });

/** Representative GT sets: exact values are printed with results (no hidden construction). */
function gtSets(center) {
  const tight = (n) => Array(n).fill(center);
  return [
    { label: '1 GT', values: [center] },
    { label: '2 GT tight', values: [center, center] },
    { label: '3 GT tight', values: tight(3) },
    { label: '5 GT tight', values: tight(5) },
    { label: '8 GT tight', values: tight(8) },
    { label: '3 GT ±10', values: [center - 10, center, center + 10] },
    { label: '3 GT ±25', values: [center - 25, center, center + 25] },
  ];
}

function fmtRange([lo, hi]) {
  return `${lo} – ${hi}`;
}

function fmtRank(rank) {
  // Phase 4 engine output: null ends mean "beyond the recorded data".
  return rank.rankRange
    .map((r) => (r === null ? `>${rank.beyondLastRecordedRank}` : r))
    .join('–');
}

const LEVELS = [60, 100, 140, 170];

console.log('='.repeat(100));
console.log('WIDTH-MODEL CALIBRATION INSPECTION — against DS-NEETPG-DISTRIBUTION-2025-v1');
console.log('(official NBEMS 2025: 230,096 scored candidates; percentile = 100×(1−rank/N);');
console.log(' AIR ranges are exact Phase 4 lookups over the official bands.');
console.log(` Pattern: ${NEET.totalQuestions} questions / ${NEET.maxMarks} marks (width constants scaled`);
console.log(' proportionally; scores bridged onto the 800-scale distribution by fraction parity.)');
console.log('='.repeat(100));
console.log(`model: ${WIDTH_MODEL.id}  provisional=${WIDTH_MODEL.provisional}  params=${JSON.stringify(WIDTH_MODEL.params)} (at the 200-question reference; ×${NEET.totalQuestions / 200} here)`);
console.log(`tier-2 cohort threshold: ${TRANSFER.TIER2_MIN_COHORT} (provisional=${TRANSFER.TIER2_MIN_COHORT_PROVISIONAL})`);
console.log('');

for (const level of LEVELS) {
  console.log(`— mean GT corrects = ${level}/${NEET.totalQuestions}  (center score ${5 * level - NEET.totalQuestions}/${NEET.maxMarks}) —`);
  console.log(
    '  '.padEnd(14) +
    ['GTs', 'sd', '±width', 'corrects range', 'score range', 'percentile range', 'coverage', 'AIR range (exact, P4)']
      .join(' | ')
  );
  const rows = [];
  for (const set of gtSets(level)) {
    const result = engine.predict({ exam: 'NEET_PG', gts: set.values.map(gt) });
    const e = result.estimate;
    const sd = result.aggregation.sd;
    rows.push(
      '  ' +
        [
          set.label.padEnd(11),
          sd.toFixed(1).padStart(4),
          e.performance.halfWidthCorrects.toFixed(1).padStart(6),
          fmtRange(e.performance.correctsRange).padStart(13),
          fmtRange(e.performance.scoreRange).padStart(11),
          fmtRange(e.percentile.range).padStart(17),
          e.percentile.coverage.padEnd(18),
          fmtRank(result.rank).padStart(0),
        ].join(' | ')
    );
  }
  console.log(rows.join('\n') + '\n');
}

// Monotonicity sanity: the center percentile must never worsen as mean
// corrects rise. Ties are allowed only on the honest edge plateaus (0 = below
// the recorded distribution, 100 = above it) — interior ties would mean the
// mapping flattened, which must be investigated.
console.log('— monotonicity check (center percentile vs mean corrects, 1 GT) —');
let prev = -Infinity;
let mono = true;
let interiorTies = 0;
for (let c = 20; c <= 190; c += 10) {
  const r = engine.predict({ exam: 'NEET_PG', gts: [gt(c)] }).estimate.percentile.center;
  if (r < prev) mono = false;
  if (r === prev && r !== 0 && r !== 100) interiorTies += 1;
  process.stdout.write(`  ${c}→${r.toFixed(2)}`);
  prev = r;
}
console.log(`\n  non-decreasing: ${mono ? 'YES' : 'NO — INVESTIGATE'}  interior ties: ${interiorTies}${interiorTies ? ' — INVESTIGATE' : ''}\n`);

// Robust-aggregation comparison on a plausibly anomalous GT set (test input,
// not stored data): mean vs median vs trimmed mean as reported by the engine.
console.log('— aggregation alternatives on an anomalous set [150, 152, 151, 60] (one bad day) —');
const anom = engine.predict({
  exam: 'NEET_PG',
  gts: [150, 152, 151, 60].map(gt),
});
console.log(
  `  mean=${anom.aggregation.mean}  median=${anom.aggregation.median}  trimmedMean=${anom.aggregation.trimmedMean}  sd=${anom.aggregation.sd}`
);
console.log('  (MVP uses the confirmed mean; alternatives are reported with every prediction for Phase 11.)');
console.log('');
console.log('NOTE: all width constants above are PROVISIONAL (zero Eyeconic GT data exists to');
console.log('calibrate against — Phase 1 audit). Do not narrow ranges for launch reasons (spec §18).');
