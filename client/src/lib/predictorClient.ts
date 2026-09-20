import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config/api';
import type {
  BranchesResponse, BranchBand, GtsResponse, OutcomeGetResponse, OutcomePutResponse,
  OutcomeSubmission, PredictResponse, PredictorExam,
} from '../types/predictor';

/**
 * Client for the Rank & Branch Predictor API (/api/predictor/*). Auth is the
 * student's App session (encrypted HttpOnly cookie), same as /api/app/* —
 * withCredentials only, no token handling in JS. 401s dispatch the shared
 * app-session-expired event so the auth surface reacts identically.
 */
export { APP_SESSION_EXPIRED_EVENT } from './appClient';

export const predictorApi = axios.create({
  baseURL: `${API_BASE_URL}/predictor`,
  withCredentials: true,
  timeout: 60000,
});

predictorApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('app:session-expired'));
    }
    return Promise.reject(error);
  }
);

/** Human-friendly message for predictor failures (server messages are safe to show). */
export function predictorErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
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

/** Field path (e.g. "gts[2].attempts[0].corrects") → row index, for inline errors. */
export function errorRowIndices(error: unknown): Set<number> {
  const rows = new Set<number>();
  if (axios.isAxiosError(error)) {
    const field = (error.response?.data as { field?: string } | undefined)?.field || '';
    const match = field.match(/^gts\[(\d+)\]/);
    if (match) rows.add(Number(match[1]));
  }
  return rows;
}

/** Server field name (e.g. "score", "consent") from a validation error, if any. */
export function errorField(error: unknown): string | null {
  if (axios.isAxiosError(error)) {
    const field = (error.response?.data as { field?: string } | undefined)?.field;
    return typeof field === 'string' && field ? field : null;
  }
  return null;
}

export const predictorEndpoints = {
  exams: () => predictorApi.get<{ exams: PredictorExam[] }>('/exams').then((r) => r.data.exams),
  gts: () => predictorApi.get<GtsResponse>('/gts').then((r) => r.data),
  predict: (body: {
    exam: string;
    gts: Array<{ gtId?: string | null; provenance: string; attempts: Array<Record<string, unknown>> }>;
    category?: string;
    pwd?: boolean;
  }) => predictorApi.post<PredictResponse>('/predict', body).then((r) => r.data),
  branches: (
    predictionId: string,
    params: { band?: BranchBand; year?: number; page?: number; limit?: number }
  ) =>
    predictorApi
      .get<BranchesResponse>(`/predictions/${predictionId}/branches`, { params })
      .then((r) => r.data),
  outcome: (predictionId: string) =>
    predictorApi
      .get<OutcomeGetResponse>(`/predictions/${predictionId}/outcome`)
      .then((r) => r.data),
  saveOutcome: (predictionId: string, body: OutcomeSubmission) =>
    predictorApi
      .put<OutcomePutResponse>(`/predictions/${predictionId}/outcome`, body)
      .then((r) => r.data),
  withdrawOutcome: (predictionId: string) =>
    predictorApi
      .delete<{ predictionId: string; deleted: boolean }>(`/predictions/${predictionId}/outcome`)
      .then((r) => r.data),
};
