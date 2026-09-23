'use strict';

const { EXAMS } = require('../config');
const { createNeetPgStrategy } = require('./neetPg');
const { createIniCetStrategy } = require('./iniCet');

/**
 * Exam-strategy registry (spec §9: per-exam strategy behind a common
 * interface; §19.9: NEET PG and INI-CET strategies stay separate).
 *
 * @param {object} deps
 *   loadDistribution:   () => {snapshotId, data}          — verified snapshot loader (NEET PG)
 *   loadCounselling:    (examYear) => {snapshotId, data}  — verified snapshot loader (NEET PG)
 *   cohortProvider:     optional (gtId) => null | {size, corrects[]}
 *   loadIniCetDistribution: (session) => {snapshotId, data} — INI-CET official distribution
 *   loadIniCetPrior:    () => {snapshotId, data}          — INI-CET crowd prior (ladder)
 *   loadIniCetCounselling: (session) => {snapshotId, data} — INI-CET final-state cutoffs
 */
function buildStrategies({
  loadDistribution,
  loadCounselling,
  cohortProvider,
  loadIniCetDistribution,
  loadIniCetPrior,
  loadIniCetCounselling,
}) {
  const strategies = {
    [EXAMS.NEET_PG.id]: createNeetPgStrategy({ loadDistribution, loadCounselling, cohortProvider }),
    [EXAMS.INI_CET.id]: createIniCetStrategy({
      loadDistribution: loadIniCetDistribution,
      loadPrior: loadIniCetPrior,
      loadCounselling: loadIniCetCounselling,
    }),
  };

  /**
   * Retired pattern profiles (§10 pattern history; NEET PG migration
   * 2026-09-24). `legacyEntry(examId, methodVersion)` returns the
   * patternHistory entry whose forward OR desired method version matches —
   * used only to re-derive STORED predictions/queries byte-identically.
   * INI-CET has no retired profiles (its methodology is unchanged).
   *
   * Both helpers are NON-ENUMERABLE so the registry's own contract holds:
   * Object.keys(registry) lists exactly the exam ids.
   */
  const legacyCache = new Map();
  const legacyEntry = (examId, methodVersion) => {
    if (typeof methodVersion !== 'string' || !examId) return null;
    const exam = EXAMS[examId];
    if (!exam || !Array.isArray(exam.patternHistory)) return null;
    return (
      exam.patternHistory.find(
        (e) => e.methodVersion === methodVersion || e.desiredMethodVersion === methodVersion
      ) || null
    );
  };
  Object.defineProperty(strategies, 'legacyEntry', { value: legacyEntry, enumerable: false });
  Object.defineProperty(strategies, 'legacy', {
    value: (examId, methodVersion) => {
      const entry = legacyEntry(examId, methodVersion);
      if (!entry) return null;
      if (!legacyCache.has(entry.methodVersion)) {
        legacyCache.set(
          entry.methodVersion,
          createNeetPgStrategy({ loadDistribution, loadCounselling, cohortProvider, profile: entry })
        );
      }
      return legacyCache.get(entry.methodVersion);
    },
    enumerable: false,
  });

  return strategies;
}

module.exports = { buildStrategies };
