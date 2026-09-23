'use strict';

/**
 * Pattern bridge — the explicit, versioned conversion between an exam's
 * CURRENT pattern (GT inputs, displayed scores) and the pattern its official
 * distribution snapshot was recorded on (spec §10 pattern versioning).
 *
 * Why this exists (2026-09-24 migration): NEET PG moved to 180 questions /
 * 720 marks, but the only official score↔rank distribution is the 2025
 * NBEMS snapshot on the 200-question / 800-mark scale. A 720-scale score must
 * NEVER be looked up in the 800-scale bands directly — that would silently
 * equate 600/720 with 600/800. The bridge converts by FRACTION OF MAXIMUM
 * MARKS, which (because both patterns share the same +4/−1 marking scheme)
 * is exactly fraction-of-corrects parity — the same Tier-1 assumption the
 * forward transfer already makes, expressed pattern-independently:
 *
 *   With +4/−1 and no skips: score = N×(5f − 1) where f = corrects/N and
 *   maxMarks = 4N ⇒ score/maxMarks = (5f − 1)/4 — independent of N.
 *   So equal marks-fraction ⇔ equal corrects-fraction, and
 *   score_anchor = score_pattern × (anchorMax / patternMax).
 *
 * The bridge is LINEAR and exact at the endpoints (pattern max → anchor max,
 * pattern floor → anchor floor). Integer maxima are used in a fixed
 * multiply-then-divide order to keep representable values exact.
 *
 * When the 2026 official distribution is published and ingested, the anchor
 * becomes same-pattern and the bridge disappears (buildPatternBridge returns
 * null) — no engine change needed.
 */

const BRIDGE_ID = 'fraction-parity-v1';

function sameMarking(a, b) {
  return a.positive === b.positive && a.negative === b.negative;
}

/**
 * @param {object} args
 *   pattern:            current exam pattern {totalQuestions, positive, negative, maxMarks, version?}
 *   anchorPattern:      the distribution snapshot's pattern (same fields)
 *   patternVersion:     optional explicit version (defaults to pattern.version)
 *   anchorPatternVersion: optional explicit version (defaults to anchorPattern.version)
 * @returns {object|null} frozen bridge, or null when the patterns are the
 *   same scale (identity — no conversion, no provenance noise)
 * @throws {Error} when the marking schemes differ — marks-fraction parity is
 *   only corrects-fraction parity under identical marking, so a differing
 *   scheme must not be bridged silently.
 */
function buildPatternBridge({ pattern, anchorPattern, patternVersion, anchorPatternVersion }) {
  for (const [name, p] of [['pattern', pattern], ['anchorPattern', anchorPattern]]) {
    if (!p || !Number.isFinite(p.maxMarks) || !Number.isFinite(p.positive) || !Number.isFinite(p.negative)) {
      throw new TypeError(`buildPatternBridge needs a complete ${name} (maxMarks, positive, negative)`);
    }
  }
  const fromVersion = patternVersion || pattern.version || 'unversioned pattern';
  const toVersion = anchorPatternVersion || anchorPattern.version || 'unversioned anchor pattern';
  if (pattern.maxMarks === anchorPattern.maxMarks && sameMarking(pattern, anchorPattern)) {
    return null; // same scale — identity bridge
  }
  if (!sameMarking(pattern, anchorPattern)) {
    throw new Error(
      `patternBridge: ${fromVersion} and ${toVersion} differ in marking scheme ` +
        `(+${pattern.positive}/−${pattern.negative} vs +${anchorPattern.positive}/−${anchorPattern.negative}) — ` +
        'fraction parity is invalid here; an explicit conversion decision is required.'
    );
  }
  const fromMax = pattern.maxMarks;
  const toMax = anchorPattern.maxMarks;
  return Object.freeze({
    id: BRIDGE_ID,
    patternVersion: fromVersion,
    anchorPatternVersion: toVersion,
    basis: 'fraction-of-max-marks parity (≡ fraction-correct parity under identical marking)',
    /** Current-pattern score → equivalent score on the distribution's scale. */
    toAnchorScore(score) {
      return (score * toMax) / fromMax;
    },
    /** Distribution-scale score → equivalent score on the current pattern. */
    toPatternScore(anchorScore) {
      return (anchorScore * fromMax) / toMax;
    },
  });
}

module.exports = { buildPatternBridge, BRIDGE_ID };
