import { API_BASE_URL } from '../config';

const SESSION_TOKEN_KEY = 'biomech_session_token';
const SESSION_KEY = 'biomech_current_session';

const memoryStorage = new Map<string, string>();

const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStorage.has(key) ? memoryStorage.get(key)! : null;
  }
};

const safeRemoveItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    memoryStorage.delete(key);
  }
};

export const notifySessionExpired = (message: string) => {
  safeRemoveItem(SESSION_TOKEN_KEY);
  safeRemoveItem(SESSION_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('biomech:session-expired', { detail: { message } }));
  }
};

export const apiCall = async (endpoint: string, method = 'GET', body?: unknown): Promise<unknown> => {
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = safeGetItem(SESSION_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const config: RequestInit = { method, headers };
  if (body !== undefined) config.body = JSON.stringify(body);

  const response = await fetch(url, config);
  if (!response.ok) {
    let message = 'Request failed';
    try {
      const error = await response.json();
      message = (error as { message?: string }).message || message;
    } catch { /* noop */ }

    if (response.status === 401 && token) {
      const sessionMessage = message || 'Session expired. Please sign in again.';
      notifySessionExpired(sessionMessage);
      throw new Error(sessionMessage);
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
};
