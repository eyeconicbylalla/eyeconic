/**
 * Types for the Readiness Score API (Feature 09 — /api/predictor/readiness*).
 *
 * These mirror the shipped Phase-4 contract exactly (server/routes/predictor.js
 * + server/predictor/readiness.js). The server is the single source of truth:
 * every derived value shown in the UI (state, required corrects, budget, exam
 * date, days remaining) arrives in these payloads — the client never computes
 * one. Fields the UI does not render are still typed (faithfully, loosely where
 * engine-internal) so the contract stays reviewable against the server.
 */

import type { GtProvenance } from './predictor';

export type ReadinessState = 'READY' | 'MODERATELY_READY' | 'BARELY_READY';
export type ReadinessInputMode = 'corrects' | 'score';

export interface ReadinessWarning {
  code: string;
  note: string;
}

/** The exam pattern echo (same shape the predictor's method blocks carry). */
export interface ReadinessPattern {
  totalQuestions: number;
  positive: number;
  negative: number;
  maxMarks: number;
  version?: string;
}

/**
 * One resolved calendar session (the calendar module's echo contract, §7.2.5).
 * examDate is an IST calendar date 'YYYY-MM-DD'; daysRemaining/monthsRemaining
 * are server-computed — the client only formats them.
 */
export interface ReadinessCalendarEntry {
  exam: string;
  session: string;
  examDate: string;
  status: 'announced' | 'expected';
  sourceUrl: string;
  verifiedAsOf: string;
  note: string | null;
  daysRemaining: number;
  monthsRemaining: number;
  warnings: ReadinessWarning[];
  asOfIstDate: string;
  calendarVersion: string;
  horizonDays: number;
}

/** GET /readiness/calendar — routine-empty exams are a 200-shaped null. */
export interface ReadinessCalendarResponse {
  calendarVersion: string;
  exams: Record<string, { next: ReadinessCalendarEntry | null; horizonDays: number }>;
}

// ---- Request bodies (§15) ---------------------------------------------------------

/** Corrects-mode rows: one full-length Grand Test per row. */
export interface ReadinessCorrectsRow {
  corrects: number;
  provenance?: GtProvenance;
  attemptedAt?: string | number | null;
  gtId?: string | null;
}

/** Score-mode input: the §15 single row, or an array of rows (§3 step 5). */
export type ReadinessScoreInput =
  | { value: number; source?: string | null }
  | Array<{ value: number; source?: string | null }>;

export interface ReadinessRequestBody {
  exam: string;
  gts?: ReadinessCorrectsRow[];
  score?: ReadinessScoreInput;
  /**
   * Optional explicit listed session (planning mode). The readiness form never
   * sends it — the server re-resolves the calendar at request time (FR-3) and
   * annotates a rollover if the page's session passed meanwhile.
   */
  session?: string;
}

// ---- Result record (the engine's §10 output, served verbatim) ----------------------

export interface ReadinessScoreRowEcho {
  value: number;
  corrects: number;
  onLattice: boolean;
  residueMarks: number;
  source: string | null;
}

export interface ReadinessInputEcho {
  mode: ReadinessInputMode;
  rows: Array<{
    corrects: number;
    provenance: GtProvenance;
    attemptedAt: string | number | null;
    gtId: string | null;
  }>;
  scoreRows?: ReadinessScoreRowEcho[];
  aggregation: {
    n: number;
    values: number[];
    mean: number;
    median: number;
    trimmedMean: number | null;
    sd: number;
    min: number;
    max: number;
    range: number;
  };
  meanCorrects: number;
}

export interface ReadinessStanding {
  meanCorrects: number;
  /** NEET "score" / INI "marks" on the current pattern (§5.4/§6.2 arithmetic). */
  projectedScore: number;
  percentile: {
    range: [number, number];
    center: number;
    definition?: string;
    coverage: string;
  };
  /** Engine's performance estimate — rendered loosely; the point value is used. */
  performance: {
    centerCorrects: number;
    halfWidthCorrects?: number;
    correctsRange?: [number, number];
    scoreRange?: [number, number];
    patternVersion?: string | null;
    pattern?: ReadinessPattern;
  };
  /** Engine-internal transfer tiers — never rendered (P0 vocabulary rule). */
  transfer: Record<string, unknown>;
  rank: {
    stage: string;
    examYear: number;
    session?: string;
    rankRange: [number | null, number | null];
    bestRank: number | null;
    worstRank: number | null;
    bestBeyondData: boolean;
    worstBeyondData: boolean;
    beyondLastRecordedRank: number | null;
    beyondLadderMaxAir?: number | null;
    coverage: string;
    definition?: string;
  };
  coverage: string;
}

export interface ReadinessAnchorSource {
  kind: string;
  snapshotId?: string;
  snapshotIds?: string[];
  examYear?: number;
  filters?: Record<string, unknown>;
  trailingSessions?: number;
  qualifyingScoreAnchor?: number;
  loadedSnapshotId?: string;
}

export interface ReadinessAnchor {
  id: string;
  role: 'default' | 'context';
  rank: number;
  definition: string;
  /** Integer corrects, or null when open-ended (above-ladder, §18.5). */
  requiredCorrects: number | null;
  requiredState: string;
  bounded: boolean;
  ladderEndCorrects?: number;
  note?: string;
  source: ReadinessAnchorSource;
  evidence?: Record<string, unknown> | null;
  reverse?: Record<string, unknown>;
}

export interface ReadinessTarget {
  id: string;
  rank: number;
  requiredCorrects: number;
  requiredState: string;
  definition: string;
  source: ReadinessAnchorSource;
  evidence: Record<string, unknown> | null;
}

export interface ReadinessGap {
  requiredCorrects: number;
  meanCorrects: number;
  /** requiredCorrects − meanCorrects; may be ≤ 0 (cleared). */
  gapCorrects: number;
  budget: number;
  rate: number;
  monthsRemaining: number;
  cappedMonths: number;
  capped: boolean;
  significantGap: boolean;
  budgetArithmetic: string;
}

export interface ReadinessExplanation {
  stateLine: string;
  timeRemainingText: string;
  budgetArithmetic: string;
}

export interface ReadinessMethod {
  version: string;
  anchorSetRuleId: string;
  timeAllowanceRuleId: string;
  defaultAnchor: string;
  significantGapFactor: number;
  daysPerMonth: number;
  timeAllowance: {
    provisional: boolean;
    rateCorrectsPerMonth: number;
    capMonths: number;
    note: string;
  };
  calendarVersion: string;
  pattern: ReadinessPattern;
  patternVersion: string;
  distribution?: Record<string, unknown> | null;
  aggregation: { method: string; dedupRuleId: string };
  inheritedForwardMethodVersion: string;
}

export interface ReadinessResult {
  exam: string;
  examLabel: string;
  state: ReadinessState;
  methodVersion: string;
  method: ReadinessMethod;
  request: Record<string, unknown>;
  input: ReadinessInputEcho;
  standing: ReadinessStanding;
  calendar: ReadinessCalendarEntry;
  anchors: ReadinessAnchor[];
  target: ReadinessTarget;
  gap: ReadinessGap;
  explanation: ReadinessExplanation;
  warnings: ReadinessWarning[];
  notes: string[];
}

/** §18.2 session-rollover annotation (server's resolution wins). */
export interface ReadinessRollover {
  requestedSession: string;
  resolvedSession: string;
  note: string;
}

/** POST /readiness — 201 with the persisted record. */
export interface ReadinessResponse {
  readinessId: string;
  persisted: boolean;
  rollover?: ReadinessRollover;
  result: ReadinessResult;
}
