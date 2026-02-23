import { API_BASE_URL, USE_CLOUD_STORAGE } from '../config';
import { StudyProtocol, User } from '../types';

const STUDY_PROTOCOLS_KEY = 'biomech_study_protocols_db';
const SESSION_STORAGE_KEY = 'biomech_current_session';
const SESSION_TOKEN_STORAGE_KEY = 'biomech_session_token';

const memoryStorage = new Map<string, string>();

const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStorage.has(key) ? memoryStorage.get(key)! : null;
  }
};

const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryStorage.set(key, value);
  }
};

const safeRemoveItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    memoryStorage.delete(key);
  }
};

const getSessionToken = (): string | null => safeGetItem(SESSION_TOKEN_STORAGE_KEY);

const PROTOCOL_SYSTEM_FIELDS = new Set(['id', 'version', 'history', 'createdAt', 'updatedAt', 'createdBy', 'lastModifiedBy', 'isDeleted']);
const valueEqual = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right);

const tryThreeWayMerge = (current: StudyProtocol, updates: Partial<StudyProtocol>, baseState?: Partial<StudyProtocol>) => {
  if (!baseState || typeof baseState !== 'object') {
    return { canMerge: false, mergedFields: [] as string[], conflictFields: [] as string[] };
  }

  const updateKeys = Object.keys(updates || {}).filter((key) => !PROTOCOL_SYSTEM_FIELDS.has(key));
  const clientChangedFields = updateKeys.filter((key) => !valueEqual((updates as any)[key], (baseState as any)[key]));
  const serverChangedFields = Object.keys(current || {})
    .filter((key) => !PROTOCOL_SYSTEM_FIELDS.has(key))
    .filter((key) => !valueEqual((current as any)[key], (baseState as any)[key]));

  const serverChangedSet = new Set(serverChangedFields);
  const conflictFields = clientChangedFields.filter((key) => serverChangedSet.has(key));
  if (conflictFields.length > 0) {
    return { canMerge: false, mergedFields: [] as string[], conflictFields };
  }

  const mergedState: StudyProtocol = { ...current };
  clientChangedFields.forEach((key) => {
    (mergedState as any)[key] = (updates as any)[key];
  });

  return { canMerge: true, mergedState, mergedFields: clientChangedFields, conflictFields: [] as string[] };
};

const notifySessionExpired = (message: string) => {
  safeRemoveItem(SESSION_TOKEN_STORAGE_KEY);
  safeRemoveItem(SESSION_STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('biomech:session-expired', { detail: { message } }));
  }
};

const getStorage = (): StudyProtocol[] => {
  const data = safeGetItem(STUDY_PROTOCOLS_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const now = new Date().toISOString();
        return {
          ...item,
          isDeleted: Boolean(item.isDeleted),
          version: Number.isFinite(Number(item.version)) && Number(item.version) > 0 ? Number(item.version) : 1,
          createdAt: item.createdAt || now,
          updatedAt: item.updatedAt || item.createdAt || now,
          createdBy: item.createdBy || 'System',
          lastModifiedBy: item.lastModifiedBy || item.createdBy || 'System',
          history: Array.isArray(item.history) ? item.history : []
        } as StudyProtocol;
      });
  } catch {
    safeSetItem(STUDY_PROTOCOLS_KEY, JSON.stringify([]));
    return [];
  }
};

const setStorage = (data: StudyProtocol[]) => {
  safeSetItem(STUDY_PROTOCOLS_KEY, JSON.stringify(data));
};

const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  let response = await fetch(url, config);

  if (response.status === 401) {
    const latestToken = getSessionToken();
    if (token && latestToken && latestToken !== token) {
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${latestToken}`
      };
      const retryConfig: RequestInit = { ...config, headers: retryHeaders };
      response = await fetch(url, retryConfig);
    }
  }

  if (!response.ok) {
    let message = 'Study protocol request failed';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // noop
    }
    if (response.status === 401) {
      const sessionMessage = message || 'Session expired or invalid. Please sign in again.';
      notifySessionExpired(sessionMessage);
      throw new Error(sessionMessage);
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
};

export const studyProtocolService = {
  getAll: async (): Promise<StudyProtocol[]> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/study-protocols');
    }

    const all = getStorage().filter((protocol) => !protocol.isDeleted);
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  create: async (
    data: Omit<StudyProtocol, 'id' | 'isDeleted' | 'version' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy' | 'history'>,
    user: User
  ): Promise<StudyProtocol> => {
    if (user.role !== 'Admin') {
      throw new Error('Only Admin can create or edit study protocols.');
    }

    if (USE_CLOUD_STORAGE) {
      return await apiCall('/study-protocols', 'POST', { data });
    }

    const protocols = getStorage();
    const normalizedProjectId = String(data.projectId || '').trim();
    if (!normalizedProjectId) {
      throw new Error('Project ID is required.');
    }

    if (protocols.some((p) => p.projectId.toLowerCase() === normalizedProjectId.toLowerCase())) {
      throw new Error(`Project ID ${normalizedProjectId} already exists.`);
    }

    const now = new Date().toISOString();
    const newProtocol: StudyProtocol = {
      id: crypto.randomUUID(),
      projectName: String(data.projectName || '').trim(),
      projectId: normalizedProjectId,
      executionTime: String(data.executionTime || '').trim(),
      notes: data.notes?.trim() || '',
      ethicalApproval: data.ethicalApproval,
      isDeleted: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: user.username,
      lastModifiedBy: user.username,
      history: [
        {
          changeId: crypto.randomUUID(),
          operation: 'CREATE',
          version: 1,
          timestamp: now,
          modifiedBy: user.username,
          expectedVersion: 0,
          mergeApplied: false,
          mergedFields: [],
          conflictFields: [],
          previousState: {}
        }
      ]
    };

    protocols.push(newProtocol);
    setStorage(protocols);
    return newProtocol;
  },

  update: async (id: string, updates: Partial<StudyProtocol>, user: User, baseState?: Partial<StudyProtocol>): Promise<StudyProtocol> => {
    if (user.role !== 'Admin') {
      throw new Error('Only Admin can create or edit study protocols.');
    }

    if (USE_CLOUD_STORAGE) {
      const expectedVersion = Number((updates as any)?.version);
      return await apiCall(`/study-protocols/${id}`, 'PUT', {
        updates: { ...updates, version: expectedVersion },
        baseState
      });
    }

    const protocols = getStorage();
    const index = protocols.findIndex((protocol) => protocol.id === id && !protocol.isDeleted);
    if (index === -1) throw new Error('Study protocol not found.');

    const current = protocols[index];
    const nextUpdates = { ...updates } as any;
    PROTOCOL_SYSTEM_FIELDS.forEach((field) => delete nextUpdates[field]);

    const expectedVersion = Number((updates as any)?.version);
    if (!Number.isNaN(expectedVersion) && expectedVersion !== current.version) {
      const mergeResult = tryThreeWayMerge(current, nextUpdates, baseState);
      if (!mergeResult.canMerge) {
        throw new Error(`Version conflict detected. Current version is v${current.version}. Please reload before saving.`);
      }

      const merged = mergeResult.mergedState as StudyProtocol;
      const projectName = String(merged.projectName || '').trim();
      const projectId = String(merged.projectId || '').trim();
      const executionTime = String(merged.executionTime || '').trim();
      if (!projectName || !projectId || !executionTime) {
        throw new Error('projectName, projectId and executionTime are required.');
      }

      if (protocols.some((protocol) => protocol.id !== id && !protocol.isDeleted && protocol.projectId.toLowerCase() === projectId.toLowerCase())) {
        throw new Error(`Project ID ${projectId} already exists.`);
      }

      const now = new Date().toISOString();
      const updated: StudyProtocol = {
        ...merged,
        id: current.id,
        projectName,
        projectId,
        executionTime,
        notes: String(merged.notes || '').trim(),
        version: current.version + 1,
        updatedAt: now,
        lastModifiedBy: user.username,
        history: [
          ...(current.history || []),
          {
            changeId: crypto.randomUUID(),
            operation: 'UPDATE',
            version: current.version + 1,
            timestamp: now,
            modifiedBy: user.username,
            expectedVersion: Number.isNaN(expectedVersion) ? undefined : expectedVersion,
            mergeApplied: true,
            mergedFields: mergeResult.mergedFields,
            conflictFields: [],
            previousState: { ...current }
          }
        ]
      };

      protocols[index] = updated;
      setStorage(protocols);
      return updated;
    }

    const merged = { ...current, ...nextUpdates };
    const projectName = String(merged.projectName || '').trim();
    const projectId = String(merged.projectId || '').trim();
    const executionTime = String(merged.executionTime || '').trim();
    if (!projectName || !projectId || !executionTime) {
      throw new Error('projectName, projectId and executionTime are required.');
    }

    if (protocols.some((protocol) => protocol.id !== id && !protocol.isDeleted && protocol.projectId.toLowerCase() === projectId.toLowerCase())) {
      throw new Error(`Project ID ${projectId} already exists.`);
    }

    const now = new Date().toISOString();
    const updated: StudyProtocol = {
      ...(merged as StudyProtocol),
      id: current.id,
      projectName,
      projectId,
      executionTime,
      notes: String(merged.notes || '').trim(),
      version: current.version + 1,
      updatedAt: now,
      lastModifiedBy: user.username,
      history: [
        ...(current.history || []),
        {
          changeId: crypto.randomUUID(),
          operation: 'UPDATE',
          version: current.version + 1,
          timestamp: now,
          modifiedBy: user.username,
          expectedVersion: Number.isNaN(expectedVersion) ? undefined : expectedVersion,
          mergeApplied: false,
          mergedFields: [],
          conflictFields: [],
          previousState: { ...current }
        }
      ]
    };

    protocols[index] = updated;
    setStorage(protocols);
    return updated;
  },

  softDelete: async (id: string, user: User, expectedVersion?: number): Promise<void> => {
    if (user.role !== 'Admin') {
      throw new Error('Only Admin can create or edit study protocols.');
    }

    if (USE_CLOUD_STORAGE) {
      await apiCall(`/study-protocols/${id}/soft-delete`, 'POST', { expectedVersion });
      return;
    }

    const protocols = getStorage();
    const index = protocols.findIndex((protocol) => protocol.id === id && !protocol.isDeleted);
    if (index === -1) throw new Error('Study protocol not found.');

    const current = protocols[index];
    const expected = Number(expectedVersion);
    if (!Number.isNaN(expected) && expected !== current.version) {
      throw new Error(`Version conflict detected. Current version is v${current.version}. Please reload before deleting.`);
    }

    const now = new Date().toISOString();
    protocols[index] = {
      ...current,
      isDeleted: true,
      version: current.version + 1,
      updatedAt: now,
      lastModifiedBy: user.username,
      history: [
        ...(current.history || []),
        {
          changeId: crypto.randomUUID(),
          operation: 'SOFT_DELETE',
          version: current.version + 1,
          timestamp: now,
          modifiedBy: user.username,
          expectedVersion: Number.isNaN(expected) ? undefined : expected,
          mergeApplied: false,
          mergedFields: [],
          conflictFields: [],
          previousState: { ...current }
        }
      ]
    };

    setStorage(protocols);
  }
};
