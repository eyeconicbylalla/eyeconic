/** Types for the Free Login User Dashboard (Feature 08) — /api/mentor-dashboard/*. */

export interface MentorOverview {
  totals: { freeUsers: number; freeUsersThisMonth: number };
  active: { dau: number; wau: number; mau: number };
  miniCct: { attemptsTotal: number; attemptingUsers: number };
  dailyPyq: {
    attemptsTotal: number;
    attemptingUsers: number;
    attemptsToday: number;
    attemptsLast7d: number;
  };
  platformChoice: { platform: string; count: number }[];
  rankPredictor: {
    predictionsTotal: number;
    desiredBranchQueriesTotal: number;
    usingUsers: number;
    examDistribution: { exam: string; count: number }[];
  };
  window?: { today: string };
}

export interface MentorUserRow {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  registeredAt: string;
  isActive: boolean;
  isProfileComplete: boolean;
  year: string | null;
  platforms: string[];
  miniCct: {
    attempts: number;
    avgScorePercentage: number | null;
    lastAttemptAt: string | null;
  };
  dailyPyq: {
    attempts: number;
    currentStreak: number;
    bestStreak: number;
    lastAttemptAt: string | null;
  };
  predictions: number;
  desiredBranchQueries: number;
  desiredBranch: string | null;
  examSelected: string | null;
  lastActiveAt: string | null;
}

export interface MentorUsersPage {
  users: MentorUserRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface MiniCctAttemptRow {
  _id: string;
  quizId: string | null;
  quizTitle: string;
  testType: string | null;
  subjectName: string | null;
  score: number;
  totalQuestions: number;
  marksObtained: number;
  totalMarks: number;
  scorePercentage: number | null;
  endTime: string | null;
}

export interface DailyPyqHistoryRow {
  _id: string;
  date: string;
  score: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  totalQuestions: number;
  submittedAt: string;
}

export interface GtCorrectRow {
  gtTitle: string | null;
  provenance: string | null;
  corrects: number;
  totalQuestions: number | null;
}

export interface MentorUserDetail {
  user: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    registeredAt: string;
    isActive: boolean;
    isProfileComplete: boolean;
    freeUserProfile: {
      year?: string;
      issues?: string;
      resources?: string[];
      isReadyToTransform?: boolean;
    } | null;
  };
  miniCct: {
    attempts: MiniCctAttemptRow[];
    capped: boolean;
    summary: {
      totalAttempts: number;
      avgScorePercentage: number | null;
      bestScorePercentage: number | null;
    };
  };
  dailyPyq: {
    attempts: DailyPyqHistoryRow[];
    totalAttempts: number;
    averageScore: number | null;
    streaks: { current: number; best: number };
  };
  predictor: {
    predictions: { _id: string; exam: string | null; createdAt: string }[];
    desiredBranchQueries: { _id: string; exam: string | null; branch: string | null; createdAt: string }[];
    totals: { predictions: number; desiredBranchQueries: number };
    gtCorrects: GtCorrectRow[];
  };
  lastActiveAt: string | null;
}

export interface SubjectAverageRow {
  subjectName: string;
  attempts: number;
  avgScorePercentage: number | null;
}

export interface StreakLeaderRow {
  userId: string;
  name: string;
  email: string;
  currentStreak: number;
  bestStreak: number;
  lastAttemptAt: string | null;
}

export interface DropoffRow {
  userId: string;
  name: string;
  email: string;
  registeredAt: string;
  lastActiveAt: string | null;
  neverActive: boolean;
}

export interface FeatureUsageRow {
  feature: string;
  counts: number[];
}

export interface MentorPerformance {
  miniCct: {
    totalAttempts: number;
    avgScorePercentage: number | null;
    subjectWise: SubjectAverageRow[];
  };
  dailyPyq: {
    usersWithAttempt: number;
    completionRate: number | null;
    activeUsersLast7d: number;
    attemptsToday: number;
  };
  streakLeaderboard: StreakLeaderRow[];
  dropoff: {
    thresholdDays: number;
    totalDropoffUsers: number;
    removedByWebsiteActivity?: number;
    users: DropoffRow[];
  };
  featureUsage: {
    weekLabels: string[];
    rows: FeatureUsageRow[];
  };
  examDistribution: { exam: string; count: number }[];
  desiredBranchTop: { branch: string; count: number }[];
  rankPredictor: {
    predictionsTotal: number;
    desiredBranchQueriesTotal: number;
  };
}
