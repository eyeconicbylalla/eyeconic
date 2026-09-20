/** Types for the Rank & Branch Predictor API (/api/predictor/*). */

export type PredictorExamId = 'NEET_PG' | 'INI_CET';

export interface PredictorExam {
  id: PredictorExamId;
  label: string;
  available: boolean;
  milestone: string;
  patternVersion: string;
}

export type GtProvenance = 'auto-captured' | 'self-reported';

export interface GtAttemptInput {
  corrects: number;
  totalQuestions?: number;
  status?: string;
  endedAt?: string | number | null;
  retestApprovedUsed?: boolean;
  skippedCount?: number;
}

export interface GtInput {
  gtId?: string | null;
  provenance: GtProvenance;
  attempts: GtAttemptInput[];
}

export interface AutoFillGt {
  gtId: string;
  title: string | null;
  provenance: 'auto-captured';
  attempts: GtAttemptInput[];
}

export interface GtsResponse {
  exam: string;
  gts: AutoFillGt[];
  selfReported: { attempts: GtAttemptInput[] }[];
  notes: string[];
}

export type BranchBand = 'COMFORTABLE' | 'WITHIN_RANGE' | 'BORDERLINE' | 'ASPIRATIONAL';

export interface BranchRow {
  institute: string;
  branch: string;
  closingRank: number;
  openingRank: number;
  allottedCount: number;
  year: number;
  /** INI-CET only: 'YYYY-MM' counselling session. */
  session?: string;
  round: string;
  category: string;
  quota: string;
  band: BranchBand;
}

export interface BranchYearSummary {
  snapshotId: string;
  year: number;
  /** INI-CET only: 'YYYY-MM' counselling session (year is its YYYYMM tag). */
  session?: string;
  state: string;
  counts: Record<string, number> & { total: number };
  coverage?: string;
  aboveAllClosings?: boolean;
  beyondAllClosings?: boolean;
  minClosingRank?: number;
  maxClosingRank?: number;
}

export interface CategoryRequiredState {
  stage: 'BRANCHES';
  coverage: 'CATEGORY_REQUIRED';
  message: string;
}

export interface BranchSummary {
  stage: 'BRANCHES';
  coverage: string;
  category: { value: string; pwd: boolean };
  quota: string;
  years: BranchYearSummary[];
  dataCoverage: {
    years: number[];
    snapshotIds: string[];
    roundConvention: string;
    margins: { borderline: number; aspirational: number; provisional: boolean };
  };
  notes: string[];
}

export interface PredictionResult {
  exam: string;
  examLabel: string;
  method: {
    version: string;
    stage: string;
    assumptions: string[];
    aggregation: { method: string; dedupRule: string };
    widthModel: { id: string; provisional: boolean };
    datasetSnapshots: { distribution: string; counselling: string[] };
  };
  input: {
    gts: Array<{
      gtId: string | null;
      provenance: GtProvenance;
      selected: {
        corrects: number;
        totalQuestions: number;
        endedAt: number | null;
        retestApprovedUsed: boolean;
        skippedCount: number;
      } | null;
      excluded: Array<{ corrects: number; reason: string }>;
    }>;
    category: { value: string; pwd: boolean } | null;
    quota: string;
    quotaLabel: string;
    quotaDefaulted: boolean;
  };
  aggregation: {
    n: number;
    values: number[];
    mean: number;
    median: number;
    trimmedMean: number | null;
    sd: number;
    lowDataCaution: boolean;
  };
  estimate: {
    performance: {
      centerCorrects: number;
      halfWidthCorrects: number;
      correctsRange: [number, number];
      scoreRange: [number, number];
      dispersion: { sdCorrects: number };
    };
    percentile: {
      range: [number, number];
      center: number;
      coverage: string;
    };
    transfer: {
      tiers: { TIER_1: number; TIER_2: number };
      mixedTiers: boolean;
    };
    warnings: Array<{ code: string; note: string }>;
    notes: string[];
  };
  rank: {
    rankRange: [number | null, number | null];
    bestRank: number | null;
    worstRank: number | null;
    bestBeyondData: boolean;
    worstBeyondData: boolean;
    beyondLastRecordedRank: number | null;
    coverage: string;
    examYear: number;
    /** INI-CET only: the official session this rank range resolved against. */
    session?: string;
  };
  branches: BranchSummary | CategoryRequiredState;
}

export interface PredictResponse {
  predictionId: string;
  persisted: boolean;
  prediction: PredictionResult;
}

export interface BranchesResponse {
  predictionId: string;
  filters: { year: number | null; band: BranchBand | null; page: number; limit: number };
  total: number;
  totalPages: number;
  rows: BranchRow[];
  coverage: string;
  dataCoverage: BranchSummary['dataCoverage'];
  notes: string[];
  verified: boolean;
}

// ---- Outcome capture (§18 Phases 10a+10b) --------------------------------------

export interface OutcomeValues {
  score: number | null;
  percentile: number | null;
  rank: number | null;
}

/** Counselling outcome (Phase 10b, §15) — null until shared. */
export interface OutcomeCounselling {
  status: 'ALLOTTED' | 'NOT_ALLOTTED';
  allottedInstitute: string | null;
  allottedBranch: string | null;
  round: string | null;
}

export interface OutcomeLinkage {
  methodVersion: string;
  datasetSnapshots: { distribution: string; counselling: string[] };
  predictionCreatedAt: string;
  gtsUsed: number | null;
}

export interface OutcomeCaptureRecord {
  predictionId: string;
  outcomeId: string;
  exam: string;
  consentGivenAt: string;
  outcome: OutcomeValues;
  counselling: OutcomeCounselling | null;
  linkage: OutcomeLinkage;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutcomePutResponse extends OutcomeCaptureRecord {
  created: boolean;
}

export interface OutcomeRecordResponse extends OutcomeCaptureRecord {
  linkageCheck: { matches: boolean };
}

export interface OutcomePredictionSummary {
  methodVersion: string;
  percentileRange: [number, number] | null;
  rankRange: [number | null, number | null] | null;
  gtsUsed: number | null;
}

/**
 * GET /predictions/:id/outcome — "nothing recorded yet" is the routine state
 * on every result page, so it is a 200 (recorded: false), never a 404:
 * browsers log every non-2xx XHR to the console.
 */
export interface OutcomeStatusResponse {
  predictionId: string;
  recorded: boolean;
  outcomeRecord: OutcomeRecordResponse | null;
  predictionSummary: OutcomePredictionSummary;
}

export interface OutcomeSubmission {
  consent: true;
  score?: number | null;
  percentile?: number | null;
  rank?: number | null;
  /** Phase 10b (§15): counselling outcome + allotted branch, if shared. */
  counselling?: {
    status: 'ALLOTTED' | 'NOT_ALLOTTED';
    allottedInstitute?: string | null;
    allottedBranch?: string | null;
    round?: string | null;
  };
}
