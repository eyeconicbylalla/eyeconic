import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config/api';
import type { PlatformChoiceContext, RecommendRequest, RecommendResponse } from '../types/platformChoice';

/**
 * Client for the Platform Choice Recommender API (/api/platform-choice/*).
 * Auth is the student's App session (encrypted HttpOnly cookie), same as
 * /api/app/* — withCredentials only, no token handling in JS. 401s dispatch
 * the shared app-session-expired event so the auth surface reacts identically.
 */
export { APP_SESSION_EXPIRED_EVENT } from './appClient';

export const platformChoiceApi = axios.create({
  baseURL: `${API_BASE_URL}/platform-choice`,
  withCredentials: true,
  timeout: 60000,
});

platformChoiceApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('app:session-expired'));
    }
    return Promise.reject(error);
  }
);

/** Human-friendly message for recommender failures (server messages are safe to show). */
export function platformChoiceErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { msg?: string; message?: string } | undefined;
    const message = data?.msg || data?.message;
    if (message) return message;
    if (!error.response) {
      return 'Cannot reach Eyeconic right now. Please check your connection and try again.';
    }
  }
  return fallback;
}

export function isPlatformChoiceUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 502 || status === 503;
}

/** Server field name from a validation error, for inline form errors. */
export function platformChoiceErrorField(error: unknown): string | null {
  if (axios.isAxiosError(error)) {
    const field = (error.response?.data as { field?: string } | undefined)?.field;
    if (typeof field === 'string' && field) return field;
  }
  return null;
}

export const platformChoice = {
  context: () =>
    platformChoiceApi.get<PlatformChoiceContext>('/context').then((r) => r.data),
  recommend: (body: RecommendRequest) =>
    platformChoiceApi.post<RecommendResponse>('/recommend', body).then((r) => r.data),
};
