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
  return {
    [EXAMS.NEET_PG.id]: createNeetPgStrategy({ loadDistribution, loadCounselling, cohortProvider }),
    [EXAMS.INI_CET.id]: createIniCetStrategy({
      loadDistribution: loadIniCetDistribution,
      loadPrior: loadIniCetPrior,
      loadCounselling: loadIniCetCounselling,
    }),
  };
}

module.exports = { buildStrategies };
