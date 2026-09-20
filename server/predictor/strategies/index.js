'use strict';

const { EXAMS } = require('../config');
const { createNeetPgStrategy } = require('./neetPg');
const { createIniCetStrategy } = require('./iniCet');

/**
 * Exam-strategy registry (spec §9: per-exam strategy behind a common
 * interface; §19.9: NEET PG and INI-CET strategies stay separate).
 *
 * @param {object} deps
 *   loadDistribution:  () => {snapshotId, data}          — verified snapshot loader
 *   loadCounselling:   (examYear) => {snapshotId, data}  — verified snapshot loader
 *   cohortProvider:    optional (gtId) => null | {size, corrects[]}
 */
function buildStrategies({ loadDistribution, loadCounselling, cohortProvider }) {
  return {
    [EXAMS.NEET_PG.id]: createNeetPgStrategy({ loadDistribution, loadCounselling, cohortProvider }),
    [EXAMS.INI_CET.id]: createIniCetStrategy(),
  };
}

module.exports = { buildStrategies };
