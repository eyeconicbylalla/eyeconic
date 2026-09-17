import axios from 'axios';
import { API_BASE_URL } from '../config/api';

// Admin session helpers. The admin JWT lives only in sessionStorage and is
// sent via the Authorization header — credentials never appear in URLs,
// query strings, or the client bundle.
const ADMIN_TOKEN_KEY = 'eyeconic_admin_token';

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getAdminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Exchanges credentials for a short-lived admin token. The server compares
// them against environment variables; nothing is hardcoded client-side.
export async function adminLogin(email: string, password: string): Promise<string> {
  const res = await axios.post<{ token: string }>(`${API_BASE_URL}/auth/admin/login`, {
    email,
    password,
  });
  const token = res.data?.token;
  if (!token) throw new Error('Admin login failed');
  setAdminToken(token);
  return token;
}

export function isAdminSessionActive(): boolean {
  return Boolean(getAdminToken());
}
