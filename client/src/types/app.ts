/** Types for the Eyeconic App (mentorship) data served through /api/app/*. */

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isFreeUser: boolean;
  profilePicture: string | null;
}

export type TestType = 'daily' | 'weekly' | 'grand' | 'mini';

export interface AttemptStatus {
  hasAttempted: boolean;
  status?: 'in_progress' | 'completed' | 'auto_submitted';
  attemptId?: string;
  score?: number;
  marksObtained?: number;
  canRetake?: boolean;
  retestRequested?: boolean;
}

export interface QuizListItem {
  _id: string;
  title: string;
  testType: TestType;
  duration: number;
  totalMarks?: number;
  subject?: { _id: string; name: string } | null;
  subjectNames?: string[];
  scheduledDate?: string | null;
  expiryDate?: string | null;
  lockSectionsAfterSubmission?: boolean;
  attemptStatus: AttemptStatus;
}

export interface Question {
  _id: string;
  question?: string;
  questionText?: string;
  questionImage?: string | null;
  questionType: string;
  options?: string[] | null;
  optionImages?: (string | null)[] | null;
  assertion?: string | null;
  reason?: string | null;
  columnA?: string[] | null;
  columnB?: string[] | null;
  marks?: number;
}

export interface SectionDefinition {
  index: number;
  name?: string;
  duration?: number;
  questionIds: string[];
}

export interface SectionState {
  index: number;
  status: 'in_progress' | 'submitted' | 'auto_submitted';
  startedAt?: string | null;
  endsAt?: string | null;
  submittedAt?: string | null;
}

export interface QuizDetail extends QuizListItem {
  instructions?: string[];
  questions: Question[];
  positiveMarks?: number;
  negativeMarks?: number;
  sections?: SectionDefinition[];
  proctoringRequired?: boolean;
}

export interface AttemptAnswer {
  questionIndex: number;
  questionId?: string;
  selectedAnswer: unknown;
  markedForReview?: boolean;
  timeSpent?: number;
}

export interface StartAttemptResponse {
  message: string;
  attemptId: string;
  attemptFinalized?: boolean;
  status?: string;
  startTime?: string;
  duration?: number;
  durationDeadline?: string | null;
  serverNow?: string;
  answers?: AttemptAnswer[];
  sectionLockEnabled?: boolean;
  sectionDefinitions?: SectionDefinition[];
  sectionStates?: SectionState[];
}

export interface AttemptState {
  _id: string;
  quiz: string;
  status: 'in_progress' | 'completed' | 'auto_submitted';
  answers: AttemptAnswer[];
  startTime: string;
  endTime?: string;
  durationDeadline?: string | null;
  sectionLockEnabled?: boolean;
  sectionDefinitions?: SectionDefinition[];
  sectionStates?: SectionState[];
  serverNow?: string;
}

export interface SubmitResponse {
  message: string;
  attemptId: string;
  isAlreadySubmitted?: boolean;
  score?: number;
  totalQuestions?: number;
  marksObtained?: number;
  totalMarks?: number;
  scorePercentage?: number;
  accuracy?: number;
  correctCount?: number;
  incorrectCount?: number;
  skippedCount?: number;
  attemptedCount?: number;
  status?: string;
}

export interface ResultSummary {
  correct: number;
  incorrect: number;
  skipped: number;
  attempted: number;
  totalQuestions: number;
  marksObtained: number;
  totalMarks: number;
  scorePercentage: number;
  accuracy: number;
  markedForReviewCount?: number;
  timeTakenSeconds?: number;
}

export interface ResultQuestion {
  questionId: string;
  questionIndex: number;
  displayNumber?: number;
  question?: string;
  questionImage?: string | null;
  questionType?: string;
  section?: string | null;
  subjectName?: string | null;
  topicName?: string | null;
  selectedAnswer?: unknown;
  selectedAnswerLabel?: string | null;
  correctAnswer?: unknown;
  correctAnswerLabel?: string | null;
  explanation?: string | null;
  explanationImage?: string | null;
}

export interface ResultsPayload {
  summary: ResultSummary;
  attempt: {
    _id: string;
    status: string;
    sectionPerformance: { sectionName: string; correct: number; incorrect: number; skipped: number; accuracy?: number }[];
    retestRequested?: boolean;
    retestApproved?: boolean;
    canRequestRetest?: boolean;
  };
  quiz: { _id: string; title: string; testType?: TestType; subjectNames?: string[]; shareSolution?: boolean };
  wrongQuestions?: ResultQuestion[];
  hasSectionData: boolean;
  groupBy: string;
}

export interface AnalyticsMe {
  student?: { id: string; name: string; email: string };
  summary?: {
    totalAttempts?: number;
    averageScore?: number;
    averageAccuracy?: number;
    [key: string]: unknown;
  };
  trend?: { date?: string; label?: string; scorePercentage?: number; averageScore?: number }[];
  attempts?: {
    _id: string;
    quiz: string | { _id: string; title: string; testType?: TestType };
    marksObtained: number;
    totalMarks: number;
    scorePercentage?: number;
    accuracy?: number;
    endTime?: string;
  }[];
}

// ---- Cohort comparison (own latest test vs the same test's cohort) ----------

export interface ComparisonScoreBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface ComparisonSubjectRow {
  subjectName: string;
  questionCount: number;
  myMarks: number | null;
  myCorrect: number | null;
  myIncorrect: number | null;
  mySkipped: number | null;
  avgMarks: number;
  cohortAttempts: number;
}

export interface ComparisonPayload {
  hasEligibleAttempt: boolean;
  quiz?: { _id: string; title: string; testType?: TestType; totalMarks?: number };
  attempt?: {
    _id: string;
    status: string;
    endTime?: string;
    marksObtained: number;
    totalMarks: number;
    scorePercentage?: number | null;
    accuracy?: number | null;
    correct: number;
    incorrect: number;
    skipped: number;
    attempted: number;
    totalQuestions: number;
  };
  cohort?: {
    totalStudents: number;
    minCohortSize: number;
    sufficient: boolean;
    averageMarks: number | null;
    averageScorePercentage: number | null;
    highestMarks: number | null;
    percentile: number | null;
    topPercent: number | null;
    scoreDistribution: ComparisonScoreBucket[] | null;
    subjectWise: ComparisonSubjectRow[] | null;
  };
  generatedAt?: string;
}

// ---- Mini CCT (30-question mini grand test, 3 subjects) ----------------------

export interface MiniCctLatestQuiz {
  _id: string;
  title: string;
  testType: 'mini';
  duration: number;
  totalMarks: number;
  positiveMarks?: number;
  negativeMarks?: number;
  scheduledDate?: string | null;
  expiryDate?: string | null;
  questionCount: number;
  subjectNames: string[];
  createdAt?: string;
  attemptStatus: {
    hasAttempted: boolean;
    attemptId?: string;
    status?: 'in_progress' | 'completed' | 'auto_submitted';
    marksObtained?: number;
    totalMarks?: number;
    score?: number;
    totalQuestions?: number;
    endTime?: string | null;
  };
}

export interface MiniCctLatestPayload {
  quiz: MiniCctLatestQuiz | null;
}

export interface MiniCctAttemptSummary {
  _id: string;
  quizId: string;
  quizTitle: string;
  status: 'completed' | 'auto_submitted';
  score: number;
  totalQuestions: number;
  marksObtained: number;
  totalMarks: number;
  endTime: string;
}

export interface MiniCctHistoryPayload {
  attempts: MiniCctAttemptSummary[];
  total: number;
  page: number;
  pages: number;
}

export interface MiniCctHeatmapCell {
  questionIndex: number;
  questionId?: string | null;
  subjectName: string;
  topicName?: string | null;
  status: 'correct' | 'incorrect' | 'skipped';
}

export interface MiniCctSubjectRow {
  subjectName: string;
  questionCount: number;
  correct: number;
  incorrect: number;
  skipped: number;
  attempted: number;
  accuracy: number | null;
  marks: number;
  cohortAvgMarks: number | null;
  cohortAvgAccuracy: number | null;
  cohortAttempts: number;
}

export interface MiniCctTopicRow {
  label: string;
  subjectName: string;
  questionCount: number;
  attempted: number;
  correct: number;
  incorrect: number;
  skipped: number;
  accuracy: number | null;
}

export interface MiniCctTagRow extends MiniCctTopicRow {
  subjects: string[];
  status: 'weak' | 'strong' | 'neutral';
}

export interface MiniCctAnalysis {
  quiz: { _id: string; title: string; testType: string; totalMarks: number };
  attempt: { _id: string; status: string; startTime: string; endTime?: string | null; timeTakenSeconds: number };
  summary: {
    correct: number;
    incorrect: number;
    skipped: number;
    attempted: number;
    totalQuestions: number;
    marksObtained: number;
    totalMarks: number;
    scorePercentage: number | null;
    accuracy: number | null;
    timeTakenSeconds: number;
  };
  heatmap?: MiniCctHeatmapCell[];
  subjects: MiniCctSubjectRow[];
  overall: {
    scorePercentage: number | null;
    accuracy: number | null;
    cohortAvgScorePercentage: number | null;
    cohortAvgAccuracy: number | null;
  };
  cohort: {
    totalStudents: number;
    minCohortSize: number;
    sufficient: boolean;
    percentile: number | null;
    topPercent: number | null;
    averageMarks: number | null;
    averageScorePercentage: number | null;
    highestMarks: number | null;
  };
  insight: {
    tier: { key: string; label: string } | null;
    strongestSubject: { subjectName: string; accuracy: number | null } | null;
    weakestSubject: { subjectName: string; accuracy: number | null } | null;
    message: string;
  };
  topics?: MiniCctTopicRow[];
  tags?: MiniCctTagRow[];
  access: {
    level: 'full' | 'limited';
    gatedSections: string[];
    message?: string;
  };
  generatedAt?: string;
}

// ---- Daily PYQ (10 past questions per IST calendar day) ---------------------

export interface DailyPyqStreak {
  current: number;
  best: number;
}

/** Player-facing question — the answer key and explanation are stripped upstream. */
export interface DailyPyqQuestion {
  _id: string;
  question: string;
  questionImage?: string | null;
  questionType: string;
  options?: string[] | null;
  optionImages?: (string | null)[] | null;
  assertion?: string | null;
  reason?: string | null;
  subject?: { _id: string; name: string } | null;
  topicName?: string;
}

/** Per-question snapshot stored with the attempt at submit time. */
export interface DailyPyqAnswer {
  question: string;
  questionType?: string;
  questionText: string;
  questionImage?: string | null;
  options?: string[] | null;
  optionImages?: (string | null)[] | null;
  assertion?: string | null;
  reason?: string | null;
  selectedAnswer: unknown;
  correctAnswer: unknown;
  answered: boolean;
  isCorrect: boolean;
  explanation: string;
  explanationImage?: string | null;
}

export interface DailyPyqAttempt {
  _id: string;
  date: string;
  score: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  submittedAt: string;
  /** Present on today's payload and attempt-detail fetches; absent in history summaries. */
  answers?: DailyPyqAnswer[];
}

export interface DailyPyqTodayPayload {
  date: string;
  serverTime: string;
  totalQuestions: number;
  status: 'pending' | 'completed';
  streak: DailyPyqStreak;
  questions: DailyPyqQuestion[];
  attempt: DailyPyqAttempt | null;
}

export interface DailyPyqSubmitPayload {
  attempt: DailyPyqAttempt;
  duplicate: boolean;
  streak: DailyPyqStreak;
}

export interface DailyPyqHistoryPayload {
  attempts: DailyPyqAttempt[];
  total: number;
  page: number;
  pages: number;
}
