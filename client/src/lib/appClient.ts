import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config/api';
import type {
  AnalyticsMe, AttemptState, DailyPyqHistoryPayload, DailyPyqSubmitPayload,
  DailyPyqTodayPayload, DailyPyqAttempt, QuizDetail, QuizListItem, ResultsPayload,
  StartAttemptResponse, SubmitResponse,
} from '../types/app';

/**
 * Client for the website's App-integration proxy (/api/app/*). The student's
 * App JWT lives in an encrypted HttpOnly cookie set by /api/app-auth/*, so
 * this instance only needs withCredentials — no token handling in JS.
 */

export const APP_SESSION_EXPIRED_EVENT = 'app:session-expired';

export const appApi = axios.create({
  baseURL: `${API_BASE_URL}/app`,
  withCredentials: true,
  timeout: 60000,
});

appApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ msg?: string; code?: string }>) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent(APP_SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** Human-friendly message for any failure from the app surface. */
export function appErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { msg?: string; message?: string } | undefined;
    const message = data?.msg || data?.message;
    if (message) return message;
    if (!error.response) {
      if (error.code === 'ECONNABORTED') return 'The request timed out. Check your connection and try again.';
      return 'Cannot reach Eyeconic right now. Please check your connection and try again.';
    }
  }
  return fallback;
}

export function isAppUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const code = (error.response.data as { code?: string })?.code;
  return error.response.status >= 502 || code === 'APP_UNAVAILABLE' || code === 'APP_TIMEOUT';
}

// ---- Auth surface (not under /app) -----------------------------------------

export const appAuth = {
  async login(email: string, password: string) {
    const response = await axios.post<{ user: import('../types/app').AppUser }>(
      `${API_BASE_URL}/app-auth/login`, { email, password }, { withCredentials: true }
    );
    return response.data.user;
  },
  async session() {
    // Contract: 200 {user: null} when anonymous — the probe must never fail.
    const response = await axios.get<{ user: import('../types/app').AppUser | null; stale?: boolean }>(
      `${API_BASE_URL}/app-auth/session`, { withCredentials: true, timeout: 15000 }
    );
    return response.data;
  },
  async logout() {
    await axios.post(`${API_BASE_URL}/app-auth/logout`, {}, { withCredentials: true });
  },
  async handoff(code: string, dest: string) {
    const response = await axios.post<{ user: import('../types/app').AppUser; dest: string }>(
      `${API_BASE_URL}/app-auth/handoff`, { code, dest }, { withCredentials: true }
    );
    return response.data;
  },
};

// ---- Quiz surface -----------------------------------------------------------

export const appQuizApi = {
  list: () => appApi.get<QuizListItem[]>('/quizzes').then((r) => r.data),
  detail: (quizId: string) => appApi.get<QuizDetail>(`/quizzes/${quizId}`).then((r) => r.data),
  start: (quizId: string) => appApi.post<StartAttemptResponse>(`/quizzes/${quizId}/start`, {}).then((r) => r.data),
  attemptState: (attemptId: string) => appApi.get<AttemptState>(`/quizzes/attempt/${attemptId}`).then((r) => r.data),
  saveAnswer: (quizId: string, attemptId: string, body: Record<string, unknown>) =>
    appApi.put(`/quizzes/${quizId}/attempt/${attemptId}/answer`, body).then((r) => r.data),
  submitSection: (quizId: string, attemptId: string, sectionIndex: number, isAutoSubmit: boolean) =>
    appApi.post(`/quizzes/${quizId}/attempt/${attemptId}/sections/${sectionIndex}/submit`, { isAutoSubmit }).then((r) => r.data),
  submit: (quizId: string, attemptId: string, isAutoSubmit: boolean) =>
    appApi.post<SubmitResponse>(`/quizzes/${quizId}/attempt/${attemptId}/submit`, { isAutoSubmit }).then((r) => r.data),
  tabSwitch: (quizId: string, attemptId: string) =>
    appApi.post(`/quizzes/${quizId}/attempt/${attemptId}/tab-switch`, {}),
  results: (quizId: string, attemptId: string, groupBy = 'section') =>
    appApi.get<ResultsPayload>(`/quizzes/${quizId}/attempt/${attemptId}/results`, { params: { groupBy } }).then((r) => r.data),
  requestRetest: (quizId: string, attemptId: string) =>
    appApi.post(`/quizzes/${quizId}/attempt/${attemptId}/request-retest`, {}).then((r) => r.data),
  analyticsMe: (params?: { range?: string; page?: number; limit?: number }) =>
    appApi.get<AnalyticsMe>('/analytics/me', { params }).then((r) => r.data),
};

// ---- Daily PYQ surface ------------------------------------------------------

export const dailyPyqApi = {
  today: () => appApi.get<DailyPyqTodayPayload>('/daily-pyq/today').then((r) => r.data),
  submit: (
    date: string,
    answers: { questionId: string; selectedAnswer: number | null }[],
    timeTakenSeconds: number
  ) =>
    appApi
      .post<DailyPyqSubmitPayload>('/daily-pyq/submit', { date, answers, timeTakenSeconds })
      .then((r) => r.data),
  history: (params?: { page?: number; limit?: number }) =>
    appApi.get<DailyPyqHistoryPayload>('/daily-pyq/history', { params }).then((r) => r.data),
  attempt: (attemptId: string) =>
    appApi.get<{ attempt: DailyPyqAttempt }>(`/daily-pyq/attempts/${attemptId}`).then((r) => r.data),
};
