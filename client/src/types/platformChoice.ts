/** Types for the Platform Choice Recommender (Feature 06, /api/platform-choice). */

// ---- Config echo (GET /context) -----------------------------------------------

export interface PlatformSession {
  id: string;
  label: string;
}

export interface PlatformExam {
  id: string;
  label: string;
  defaultSession: string;
  sessions: PlatformSession[];
  note: string | null;
}

export interface ResourceOption {
  id: string;
  label: string;
}

export interface SubjectOption {
  key: string;
  label: string;
}

export interface PlatformChoiceWeights {
  examCompatibility: number;
  weakSubjects: number;
  conceptRevision: number;
  desiredBranch: number;
  studyHours: number;
  switching: number;
}

export type FactorKey = keyof PlatformChoiceWeights;

export interface PlatformChoiceConfig {
  methodVersion: string;
  exams: PlatformExam[];
  resourceOptions: ResourceOption[];
  subjects: SubjectOption[];
  studyHours: { min: number; max: number; lowMax: number; moderateMax: number };
  weights: PlatformChoiceWeights;
  factorLabels: Record<FactorKey, string>;
}

// ---- Context (GET /context) ----------------------------------------------------

export interface MiniCctContext {
  attemptId: string | null;
  quizTitle: string | null;
  endedAt: string | null;
  subjectRanking: { subjectName: string; accuracy: number | null }[];
  weakTagCount: number | null;
}

export interface LatestRecommendation {
  recommendationId: string;
  createdAt: string;
  exam: string;
  tiers: { tier: string; tierLabel: string; platformName: string | null; matchScore: number }[];
}

export interface PlatformChoiceContext {
  config: PlatformChoiceConfig;
  autofill: {
    exam: string | null;
    targetSession: string | null;
    previousResource: string | null;
    weakestSubjects: string[];
    desiredBranch: string | null;
  };
  miniCct: MiniCctContext | null;
  latest: LatestRecommendation | null;
  notes: string[];
}

// ---- Recommendation (POST /recommend) ------------------------------------------

export interface RecommendFactor {
  key: FactorKey;
  label: string;
  score: number;
  weight: number;
  contribution: number;
}

export interface RecommendedPlatform {
  key: string;
  name: string;
  tagline: string;
  keyStrength: string;
  bestFor: string[];
  logoUrl: string | null;
  accent: string;
  /** Server-resolved outbound link (affiliate override → website). */
  visitUrl: string | null;
}

export interface RecommendationTier {
  tier: 'highly_recommended' | 'good_alternative' | 'also_consider';
  tierLabel: string;
  platform: RecommendedPlatform;
  matchScore: number;
  reason: string;
  highlight: { label: string };
  factors: RecommendFactor[];
}

export interface Recommendation {
  method: { version: string; weights: PlatformChoiceWeights };
  exam: string;
  examLabel: string;
  targetSession: string;
  targetSessionLabel: string;
  tiers: RecommendationTier[];
  notes: string[];
  generatedAt: string;
}

export interface RecommendResponse {
  recommendationId: string;
  persisted: boolean;
  recommendation: Recommendation;
}

// ---- Request --------------------------------------------------------------------

export interface RecommendRequest {
  exam: string;
  targetSession: string;
  studyHoursPerDay: number;
  previousResource: string;
  likelyToSwitch: 'yes' | 'no';
  weakestSubjects: string[];
}
