import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import type {
  MentorOverview, MentorPerformance, MentorUserDetail, MentorUsersPage,
} from '../types/mentorDashboard';

/**
 * Client for the Free Login User Dashboard surface (/api/mentor-dashboard/*).
 * Same encrypted App-session cookie as the student area; the server (and the
 * App API behind it) enforce the mentor/admin role — a student session gets
 * 403 here, which this surface surfaces as a friendly error.
 */

export const mentorApi = axios.create({
  baseURL: `${API_BASE_URL}/mentor-dashboard`,
  withCredentials: true,
  timeout: 90000, // overviews aggregate on both backends; Render cold starts
});

export const mentorErrorMessage = (error: unknown, fallback = 'Could not load dashboard data.') => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { msg?: string; message?: string } | undefined;
    if (data?.msg) return data.msg;
    if (data?.message) return data.message;
    if (!error.response) {
      return 'Cannot reach the Eyeconic server. Please check your connection and try again.';
    }
  }
  return fallback;
};

export const isMentorUnavailable = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const code = (error.response.data as { code?: string })?.code;
  return error.response.status >= 502 || code === 'APP_UNAVAILABLE' || code === 'APP_TIMEOUT';
};

export interface MentorUsersQuery {
  page?: number;
  limit?: number;
  q?: string;
  from?: string;
  to?: string;
  exam?: 'NEET_PG' | 'INI_CET' | 'none';
  sort?: 'newest' | 'oldest' | 'name';
}

export const mentorDashboardApi = {
  overview: () => mentorApi.get<MentorOverview>('/overview').then((r) => r.data),
  performance: (dropOffDays?: number) =>
    mentorApi
      .get<MentorPerformance>('/performance', { params: dropOffDays ? { dropOffDays } : {} })
      .then((r) => r.data),
  users: (query: MentorUsersQuery) =>
    mentorApi.get<MentorUsersPage>('/users', { params: query }).then((r) => r.data),
  user: (id: string) => mentorApi.get<MentorUserDetail>(`/users/${id}`).then((r) => r.data),
  exportCsv: async (query: MentorUsersQuery) => {
    const response = await mentorApi.get('/export/users', {
      params: { ...query, format: 'csv' },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eyeconic-free-users.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  exportRows: (query: MentorUsersQuery) =>
    mentorApi
      .get<{ rows: Record<string, string | number>[]; total: number }>('/export/users', {
        params: { ...query, format: 'json' },
      })
      .then((r) => r.data),
};
