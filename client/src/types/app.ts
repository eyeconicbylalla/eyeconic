/** Types for the Eyeconic App (mentorship) data served through /api/app/*. */

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isFreeUser: boolean;
  profilePicture: string | null;
}

export type TestType = 'daily' | 'weekly' | 'grand';

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
