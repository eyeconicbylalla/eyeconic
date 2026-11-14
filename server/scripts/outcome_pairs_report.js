'use strict';

/**
 * Phase D — outcome-capture pairs report (plan 2026-11-14).
 *
 * The weekly counter + calibration-readiness monitor for the GT→outcome
 * dataset: counts predictions and consent-based outcome captures by exam,
 * reports capture health (linkage integrity, counselling shares), and
 * exports the calibration PAIRS (predicted range from the stored Prediction
 * × actual result from the OutcomeCapture) as JSON for the calibration
 * phases gated on them (~30 pairs → first ladder correction, ~100 → full
 * calibration incl. mock-difficulty offset + widths).
 *
 * Privacy: userId never leaves the database — the export carries a salted
 * SHA-256 pseudonym so repeat submitters can be grouped without identity.
 *
 * Usage:
 *   MONGO_URI=… node scripts/outcome_pairs_report.js            # console report
 *   MONGO_URI=… node scripts/outcome_pairs_report.js --out p.json  # + JSON export
 * Exit codes: 0 report produced · 1 connection/usage error.
 */
const crypto = require('crypto');
const path = require('path');

const { ensureDbConnection } = require(path.join(__dirname, '..', 'config', 'db'));

const SALT = process.env.OUTCOME_EXPORT_SALT || 'eyeconic-outcome-pairs-v1';
const GATES = [
  { pairs: 30, meaning: 'first ladder correction (offset fit, prior stays labelled crowd-sourced)' },
  { pairs: 100, meaning: 'full calibration (ladder + mock-difficulty offset + width recalibration)' },
];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function pseudonym(userId) {
  return crypto.createHash('sha256').update(`${SALT}:${userId}`).digest('hex').slice(0, 16);
}

function pct(n, d) {
  return d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set — point it at the target database (dev or prod Atlas).');
    return 1;
  }
  await ensureDbConnection();
  const mongoose = require('mongoose');
  const OutcomeCapture = require(path.join(__dirname, '..', 'models', 'OutcomeCapture'));
  const Prediction = require(path.join(__dirname, '..', 'models', 'Prediction'));

  const [captures, predCounts] = await Promise.all([
    OutcomeCapture.find({}).lean(),
    Prediction.aggregate([{ $group: { _id: '$exam', count: { $sum: 1 } } }]),
  ]);
  const predictionsByExam = Object.fromEntries(predCounts.map((e) => [e._id, e.count]));

  const byExam = {};
  for (const c of captures) {
    const b = (byExam[c.exam] = byExam[c.exam] || {
      captures: 0, withRank: 0, withPercentile: 0, withScore: 0,
      withCounselling: 0, linkageMatches: 0, linkageChecked: 0,
    });
    b.captures += 1;
    if (c.outcome && c.outcome.rank != null) b.withRank += 1;
    if (c.outcome && c.outcome.percentile != null) b.withPercentile += 1;
    if (c.outcome && c.outcome.score != null) b.withScore += 1;
    if (c.counselling && c.counselling.status) b.withCounselling += 1;
    if (c.linkage && c.linkage.methodVersion) b.linkageChecked += 1; // full check needs the Prediction join below
  }

  // Calibration pairs: capture × its stored prediction (predicted side).
  const predictionIds = captures.map((c) => c.predictionId);
  const predictions = await Prediction.find({ _id: { $in: predictionIds } }).lean();
  const predById = new Map(predictions.map((p) => [String(p._id), p]));

  const pairs = [];
  for (const c of captures) {
    const p = predById.get(String(c.predictionId));
    if (!p) continue;
    const linkOk =
      c.linkage.methodVersion === p.methodVersion &&
      JSON.stringify(c.linkage.datasetSnapshots) === JSON.stringify(p.method && p.method.datasetSnapshots);
    if (linkOk) {
      const b = byExam[c.exam];
      if (b) b.linkageMatches += 1;
    }
    // A calibration pair needs an actual rank or percentile AND a predicted
    // rank range (the ladder/offset fit consumes predicted-vs-actual rank).
    const hasActual = c.outcome && (c.outcome.rank != null || c.outcome.percentile != null);
    const hasPredicted = p.rank && (p.rank.bestRank != null || p.rank.worstRank != null);
    if (!hasActual || !hasPredicted) continue;
    pairs.push({
      exam: c.exam,
      user: pseudonym(c.userId),
      capturedAt: c.updatedAt,
      actual: c.outcome,
      counselling: c.counselling && c.counselling.status ? c.counselling : null,
      predicted: {
        rankRange: [p.rank.bestRank, p.rank.worstRank],
        meanCorrects: p.aggregation && p.aggregation.mean,
        halfWidthCorrects: p.estimate && p.estimate.performance && p.estimate.performance.halfWidthCorrects,
        gtCount: p.aggregation && p.aggregation.n,
      },
      linkage: { ...c.linkage, matches: linkOk },
      methodVersion: p.methodVersion,
    });
  }

  // ---- console report -------------------------------------------------------
  const line = '─'.repeat(72);
  console.log(line);
  console.log('OUTCOME-CAPTURE PAIRS REPORT — Phase D weekly counter');
  console.log(`generated: ${new Date().toISOString()}`);
  console.log(line);
  console.log('exam      predictions   captures   rate     w/ rank   w/ %ile   w/ counsel   linkage ok');
  for (const [exam, b] of Object.entries(byExam)) {
    const preds = predictionsByExam[exam] || 0;
    console.log(
      `${exam.padEnd(10)}${String(preds).padStart(10)}${String(b.captures).padStart(11)}`
      + `${pct(b.captures, preds).padStart(9)}${String(b.withRank).padStart(10)}`
      + `${String(b.withPercentile).padStart(10)}${String(b.withCounselling).padStart(13)}`
      + `${`${b.linkageMatches}/${b.linkageChecked}`.padStart(13)}`
    );
  }
  if (!Object.keys(byExam).length) console.log('(no outcome captures yet — the campaign nudge is live, pairs will appear here)');

  const pairsByExam = {};
  for (const pr of pairs) pairsByExam[pr.exam] = (pairsByExam[pr.exam] || 0) + 1;
  console.log(line);
  console.log('calibration gates (per exam, rank/percentile pairs with a predicted range):');
  for (const [exam, n] of Object.entries(pairsByExam)) {
    for (const g of GATES) {
      console.log(`  ${exam}: ${n}/${g.pairs} pairs — ${g.meaning}${n >= g.pairs ? ' — GATE OPEN' : ''}`);
    }
  }
  console.log(line);

  // ---- optional JSON export -------------------------------------------------
  const out = argValue('--out');
  if (out) {
    require('fs').writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), pairs }, null, 2));
    console.log(`exported ${pairs.length} pairs -> ${out}`);
  }
  await mongoose.disconnect();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('report failed:', err && err.message);
    process.exit(1);
  });
