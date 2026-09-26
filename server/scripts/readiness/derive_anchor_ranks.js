#!/usr/bin/env node
'use strict';

/**
 * Readiness Score Phase 1 — anchor derivation + golden management
 * (docs/READINESS_SCORE.md §26 Phase 1; decision R1 approved 2026-09-26).
 *
 *   node server/scripts/readiness/derive_anchor_ranks.js            # derive + verify vs committed golden (exit 1 on drift)
 *   node server/scripts/readiness/derive_anchor_ranks.js --update   # derive + (re)write the golden, printing full evidence
 *
 * The golden (server/tests/predictor/readinessAnchors.golden.json) is the
 * pinned record of every anchor rank + its evidence. Drift between a fresh
 * derivation and the golden means a snapshot or config changed under the
 * feature — investigate and re-verify the source BEFORE --update, exactly the
 * discipline every other predictor golden follows.
 */

const fs = require('fs');
const path = require('path');

const { deriveReadinessAnchors } = require('../../predictor/readinessAnchors');

const GOLDEN_PATH = path.join(__dirname, '..', '..', 'tests', 'predictor', 'readinessAnchors.golden.json');

function printEvidence(anchors) {
  for (const exam of ['NEET_PG', 'INI_CET']) {
    console.log(`\n=== ${exam} (anchorSetRuleId ${anchors.anchorSetRuleId}) ===`);
    for (const anchor of Object.values(anchors[exam])) {
      console.log(`\n  [${anchor.id}] role=${anchor.role}  rank = ${anchor.rank.toLocaleString('en-IN')}`);
      console.log(`  definition: ${anchor.definition}`);
      if (anchor.source.kind === 'distribution') {
        console.log(`  source: ${anchor.source.snapshotId} (qualifying score ${anchor.source.qualifyingScoreAnchor}/800)`);
        console.log(
          `  band: ranks [${anchor.band.minRank.toLocaleString('en-IN')}, ${anchor.band.maxRank.toLocaleString('en-IN')}] × ${anchor.band.count} candidates`
        );
        console.log(
          `  cross-check: pinned percentile at band edges ${anchor.crossCheck.pinnedPercentileAtBandBottom}..${anchor.crossCheck.pinnedPercentileAtBandTop} (straddles 50th: ${anchor.crossCheck.bandStraddles50thPercentile})`
        );
      } else {
        const ids = anchor.source.snapshotIds || [anchor.source.snapshotId];
        console.log(`  source: ${ids.join(', ')} | filters ${JSON.stringify(anchor.source.filters)}`);
        const ev = anchor.evidence;
        if (ev.perSessionMax) {
          console.log(`  sessions scanned: ${ev.sessionsScanned.join(', ')}`);
          for (const p of ev.perSessionMax) {
            console.log(
              `    ${p.session}: max UR closing ${p.rank.toLocaleString('en-IN')} (${p.rowsMatched} rows) @ ${p.holder.institute} / ${p.holder.course}`
            );
          }
          console.log(`  holder: ${ev.holder.institute} / ${ev.holder.course} (session ${ev.holderSession})`);
        } else {
          console.log(`  rows matched: ${ev.rowsMatched}`);
          console.log(`  holder: ${ev.holder.institute} / ${ev.holder.course}`);
        }
        if (ev.courseVariantsMatched) {
          console.log(`  GenMed course variants: ${ev.courseVariantsMatched.join(' ; ')}`);
        }
      }
    }
  }
}

/** Compare ranks (+ source snapshot ids) between a fresh derivation and the golden. */
function drift(anchors, golden) {
  const issues = [];
  if (!golden || !golden.anchors) return ['golden file missing or malformed'];
  for (const exam of ['NEET_PG', 'INI_CET']) {
    for (const [id, anchor] of Object.entries(anchors[exam])) {
      const g = golden.anchors[exam] && golden.anchors[exam][id];
      if (!g) {
        issues.push(`${exam}.${id}: missing from golden`);
        continue;
      }
      if (g.rank !== anchor.rank) {
        issues.push(`${exam}.${id}: golden rank ${g.rank} != derived rank ${anchor.rank}`);
      }
      const goldenIds = JSON.stringify(g.source.snapshotIds || [g.source.snapshotId]);
      const derivedIds = JSON.stringify(anchor.source.snapshotIds || [anchor.source.snapshotId]);
      if (goldenIds !== derivedIds) {
        issues.push(`${exam}.${id}: source snapshots ${goldenIds} != ${derivedIds}`);
      }
    }
  }
  return issues;
}

const anchors = deriveReadinessAnchors();
printEvidence(anchors);

if (process.argv.includes('--update')) {
  const golden = {
    anchorSetRuleId: anchors.anchorSetRuleId,
    generatedAt: new Date().toISOString().slice(0, 10),
    anchors,
  };
  fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
  console.log(`\ngolden written: ${path.relative(process.cwd(), GOLDEN_PATH)}`);
  process.exit(0);
}

if (!fs.existsSync(GOLDEN_PATH)) {
  console.error(`\nNo golden at ${GOLDEN_PATH} — run once with --update to create it (after reviewing the evidence above).`);
  process.exit(1);
}
const issues = drift(anchors, JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')));
if (issues.length) {
  console.error('\nDRIFT DETECTED — derived anchors no longer match the committed golden:');
  for (const i of issues) console.error(`  - ${i}`);
  console.error('Re-verify the changed snapshot/source, then re-run with --update to pin the new values.');
  process.exit(1);
}
console.log('\nPASS — derived anchors match the committed golden.');
