import { API_BASE_URL } from '../config';

const SESSION_KEY = 'biomech_current_session';

const getAuthHeader = (): Record<string, string> => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return {};
  try {
    const session = JSON.parse(raw);
    return session?.sessionToken ? { Authorization: `Bearer ${session.sessionToken}` } : {};
  } catch {
    return {};
  }
};

export const apiCall = async (endpoint: string, method = 'GET', body?: unknown): Promise<unknown> => {
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
  };

  const config: RequestInit = { method, headers };
  if (body !== undefined) config.body = JSON.stringify(body);

  const response = await fetch(url, config);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message || 'Request failed');
  }
  return response.json();
};
