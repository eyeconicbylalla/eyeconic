'use strict';

/**
 * P5 (M2 Phase 2) — INI-CET consistency checks + calibration report.
 *
 * Spec §18 Phase 5: "consistency checks against historical sessions (no
 * paired GT data exists — §4)". Read-only; exit 1 on any failed check:
 *
 *  1. Prior ladder monotone + session-coherent with the official anchor.
 *  2. Cross-session cross-check: the Telegram Nov-2025 marks points vs the
 *     runtime (May-2025) ladder after marks↔corrects arithmetic — reported
 *     as drift, asserted to stay within one crowd-noise band (×/÷ 2).
 *  3. Ladder AIRs all inside the official session's recorded rank range.
 *  4. Official-model round trip: percentile(rank)→rank(percentile) is the
 *     identity on listed ranks (exactness of the lookups Phase 5 relies on).
 *  5. Calibration table: representative corrects → marks → prior AIR →
 *     official percentile interval → resolved rank range (the artifact a
 *     reviewer reads to judge defensibility).
 *
 * Usage: node scripts/phase5/inicet_consistency_report.js
 */
const path = require('path');

const SERVER = path.join(__dirname, '..', '..', 'server');
const store = require(path.join(SERVER, 'predictor', 'store'));
const { EXAMS } = require(path.join(SERVER, 'predictor', 'config'));
const { buildRankPercentileModel } = require(path.join(SERVER, 'predictor', 'rankPercentileModel'));
const { buildPriorModel, buildIniCetEstimate } = require(path.join(SERVER, 'predictor', 'inicetTransfer'));
const { resolveIniCetRankRange } = require(path.join(SERVER, 'predictor', 'inicetRankResolution'));
const { aggregate } = require(path.join(SERVER, 'predictor', 'aggregation'));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

function main() {
  const pattern = EXAMS.INI_CET.pattern;
  const prior = store.loadIniCetPrior(EXAMS.INI_CET.prior.file).data;
  const rp = buildRankPercentileModel(store.loadIniCetDistribution(EXAMS.INI_CET.distribution.session).data);
  const pm = buildPriorModel(prior, pattern);

  console.log('='.repeat(78));
  console.log(`INI-CET PHASE 5 CONSISTENCY (prior ${pm.priorId} x official ${rp.snapshotId})`);
  console.log('='.repeat(78));

  // 1 — monotone + span (v2: 18 pooled rungs over 39 reports, 110..169.88)
  check('prior: 18 monotone points, span 110..169.88 corrects', pm.points === 18
    && pm.correctsSpan[0] === 110 && pm.correctsSpan[1] === 169.88);
  check('prior: UR-only flag carried', pm.urOnly === true);

  // 2 — cross-check points. v1 era: independent Telegram marks points — must
  // agree within one crowd-noise band (/2..x2). v2 era points are EXCLUDED
  // OUTLIERS (expect:'outlier') — the check asserts the exclusion was
  // justified: drift OUTSIDE the band.
  for (const cp of prior.cross_check_points) {
    const corrects = (cp.marks + (pattern.totalQuestions * pattern.negative))
      / (pattern.positive + pattern.negative);
    const ladderAir = pm.airForMarks(cp.marks);
    const drift = ladderAir === null ? null : cp.air / ladderAir;
    const inSpan = cp.marks >= pm.marksSpan[0] && cp.marks <= pm.marksSpan[1];
    const kind = cp.expect === 'outlier' ? 'excluded outlier' : 'independent point';
    console.log(`info  cross-check ${cp.session}: ${cp.marks} marks (= ${corrects.toFixed(1)} corrects) `
      + `-> ${cp.air.toLocaleString('en-US')} AIR (${kind}) vs ladder `
      + `${ladderAir === null ? 'outside span' : Math.round(ladderAir).toLocaleString('en-US')} `
      + `${drift ? `(drift x${drift.toFixed(2)})` : ''}`);
    if (cp.expect === 'outlier') {
      if (ladderAir !== null) {
        check(`cross-check ${cp.session} @${cp.marks}m correctly excluded (drift outside /2..x2)`,
          drift < 0.5 || drift > 2, `drift ${drift} is INSIDE the band — re-examine the exclusion`);
      }
    } else if (ladderAir !== null) {
      check(`cross-check ${cp.session} @${cp.marks}m within crowd-noise band (/2..x2)`,
        drift >= 0.5 && drift <= 2, `drift ${drift}`);
    } else {
      check(`cross-check ${cp.session} @${cp.marks}m correctly outside ladder span`,
        !inSpan, 'claimed in-span but unresolvable');
    }
  }

  // 3 — ladder AIRs inside the official session range
  const maxAir = pm.airSpan[1];
  check(`prior max AIR ${maxAir} inside official session (last rank ${rp.lastRank})`, maxAir <= rp.lastRank);

  // 4 — official round trip on sampled listed ranks (2027-01 session sizes)
  let rtOk = true;
  for (const r of [1, 2, 500, 10000, 21000, 32495]) {
    const iv = rp.percentileForRank(r);
    // the stored percentile at r must invert to a rank bracket CONTAINING r
    const back = rp.rankForPercentile(iv.lo);
    if (back.minR > r || (back.maxR !== null && back.maxR < r)) {
      rtOk = false;
      console.log(`      round-trip miss at rank ${r}: ${JSON.stringify(iv)} -> ${JSON.stringify(back)}`);
    }
  }
  check('official model round trip (percentile->rank brackets the source rank)', rtOk);

  // 5 — calibration table
  console.log('-'.repeat(78));
  console.log('corrects  marks   prior-AIR  official-pct      resolved rank range');
  const gts = (c) => [{
    gtId: null,
    provenance: 'self-reported',
    attempts: [{ corrects: c, totalQuestions: 200, status: 'completed', endedAt: null, retestApprovedUsed: false, skippedCount: 0 }],
  }];
  for (const c of [110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165]) {
    const agg = aggregate(gts(c));
    const est = buildIniCetEstimate({ perGt: agg.perGt, pattern, priorModel: pm, rpModel: rp, category: null });
    const rank = resolveIniCetRankRange({ estimate: est, rpModel: rp });
    const air = est.internal.airBest === null ? null
      : Math.round((est.internal.airBest + est.internal.airWorst) / 2);
    const f = (x) => (x === null ? 'beyond' : x.toLocaleString('en-US'));
    console.log(String(c).padStart(7) + String(est.internal.mCenter.toFixed(1)).padStart(8)
      + String(air === null ? '  above' : f(air).padStart(10))
      + `   ${est.percentile.range[0].toFixed(2)}..${est.percentile.range[1].toFixed(2)}`
      + `   ${f(rank.bestRank)} .. ${f(rank.worstRank)}  (${rank.coverage})`);
  }

  console.log('-'.repeat(78));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} check(s): ${failures.join('; ')}`);
    return 1;
  }
  console.log('RESULT: PASS — prior↔official consistency holds; see calibration table above.');
  return 0;
}

process.exit(main());
