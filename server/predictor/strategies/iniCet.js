'use strict';

const { EXAMS } = require('../config');
const { examNotAvailable, stepNotImplemented } = require('../errors');

/**
 * INI-CET strategy — SCAFFOLD ONLY (spec §18 Phase 3 done-when: "The INI-CET
 * strategy is scaffolded by the interface but implemented in Phase 5 (M2)").
 *
 * Registered so the exam list, registry shape, and interface contract are
 * real from day one (extensibility is a §2/§19 requirement), but every step
 * refuses loudly. INI-CET differs structurally from NEET PG (AIIMS never
 * publishes marks — §9): its corrects→percentile step will rest on
 * crowd-sourced labelled priors (UR-only) and must never be built by copying
 * the NEET PG pipeline with new constants.
 */
const INI_CET = EXAMS.INI_CET;

function notAvailable() {
  throw examNotAvailable(
    `INI-CET is scaffolded but not implemented yet — it lands in milestone M2 / Phase 5 (spec §9).`,
    { exam: 'INI_CET', milestone: 'M2' }
  );
}

function createIniCetStrategy() {
  return {
    id: INI_CET.id,
    label: INI_CET.label,
    available: INI_CET.available,
    milestone: INI_CET.milestone,

    validate: notAvailable,
    aggregate: notAvailable,
    estimatePercentileRange() {
      throw stepNotImplemented('INI-CET estimatePercentileRange', 'Phase 5 (M2)');
    },
    resolveRankRange() {
      throw stepNotImplemented('INI-CET resolveRankRange', 'Phase 5 (M2)');
    },
    resolveBranches() {
      throw stepNotImplemented('INI-CET resolveBranches', 'Phase 6 M2 portion');
    },
  };
}

module.exports = { createIniCetStrategy };
