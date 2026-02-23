import { Subject, SubjectHistoryEntry, User } from '../types';
import { API_BASE_URL, USE_CLOUD_STORAGE } from '../config';

const SUBJECTS_KEY = 'biomech_subjects_db';
const USERS_KEY = 'biomech_users_db'; // Reference for full backup
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

const getSessionToken = (): string | null => {
  return safeGetItem(SESSION_TOKEN_STORAGE_KEY);
};

const notifySessionExpired = (message: string) => {
  safeRemoveItem(SESSION_TOKEN_STORAGE_KEY);
  safeRemoveItem(SESSION_STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('biomech:session-expired', { detail: { message } }));
  }
};

// --- Internal Helper ---
const getStorage = (): Subject[] => {
  const data = safeGetItem(SUBJECTS_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === 'object');
  } catch {
    safeSetItem(SUBJECTS_KEY, JSON.stringify([]));
    return [];
  }
};

const setStorage = (data: Subject[]) => {
  safeSetItem(SUBJECTS_KEY, JSON.stringify(data));
};

const SUBJECT_SYSTEM_FIELDS = new Set(['id', 'version', 'history', 'createdAt', 'updatedAt', 'lastModifiedBy', 'isDeleted']);
const valueEqual = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right);

const tryThreeWayMerge = (current: Subject, updates: Partial<Subject>, baseState?: Partial<Subject>) => {
  if (!baseState || typeof baseState !== 'object') {
    return { canMerge: false, mergedFields: [] as string[], conflictFields: [] as string[] };
  }

  const updateKeys = Object.keys(updates || {}).filter((key) => !SUBJECT_SYSTEM_FIELDS.has(key));
  const clientChangedFields = updateKeys.filter((key) => !valueEqual((updates as any)[key], (baseState as any)[key]));
  const serverChangedFields = Object.keys(current || {})
    .filter((key) => !SUBJECT_SYSTEM_FIELDS.has(key))
    .filter((key) => !valueEqual((current as any)[key], (baseState as any)[key]));

  const serverChangedSet = new Set(serverChangedFields);
  const conflictFields = clientChangedFields.filter((key) => serverChangedSet.has(key));
  if (conflictFields.length > 0) {
    return { canMerge: false, mergedFields: [] as string[], conflictFields };
  }

  const mergedState: Subject = { ...current };
  clientChangedFields.forEach((key) => {
    (mergedState as any)[key] = (updates as any)[key];
  });

  return { canMerge: true, mergedState, mergedFields: clientChangedFields, conflictFields: [] as string[] };
};

const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const response = await fetch(url, config);
  if (!response.ok) {
    let message = 'API request failed';
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

export const dataService = {
  
  // --- Reads ---
  
  getAll: async (includeDeleted = false): Promise<Subject[]> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/subjects');
      return includeDeleted ? data : data.filter((s: Subject) => !s.isDeleted);
    }

    const all = getStorage();
    if (includeDeleted) return all;
    return all.filter(s => !s.isDeleted);
  },

  getDeleted: async (): Promise<Subject[]> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/subjects?deleted=true');
      return data;
    }

    return getStorage().filter(s => s.isDeleted);
  },

  // --- Writes (With Version Control) ---

  create: async (data: Omit<Subject, 'id' | 'isDeleted' | 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'history'>, user: User): Promise<Subject> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/subjects', 'POST', { data, user });
    }

    const subjects = getStorage();
    
    // Uniqueness Check (Simple 3NF check for primary key violation)
    if (subjects.some(s => s.subject_id === data.subject_id)) {
      throw new Error(`Subject ID ${data.subject_id} already exists.`);
    }

    const newSubject: Subject = {
      ...data,
      id: crypto.randomUUID(),
      isDeleted: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastModifiedBy: user.username,
      history: [
        {
          changeId: crypto.randomUUID(),
          operation: 'CREATE',
          version: 1,
          timestamp: new Date().toISOString(),
          modifiedBy: user.username,
          expectedVersion: 0,
          previousState: {}
        }
      ]
    };

    subjects.push(newSubject);
    setStorage(subjects);
    return newSubject;
  },

  update: async (id: string, updates: Partial<Subject>, user: User, baseState?: Partial<Subject>): Promise<Subject> => {
    if (USE_CLOUD_STORAGE) {
      const expectedVersion = Number((updates as any)?.version);
      return await apiCall(`/subjects/${id}`, 'PUT', { updates: { ...updates, version: expectedVersion }, baseState, user });
    }

    const subjects = getStorage();
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Record not found");

    const current = subjects[index];
    const expectedVersion = Number((updates as any)?.version);
    if (!Number.isNaN(expectedVersion) && expectedVersion !== current.version) {
      const mergeResult = tryThreeWayMerge(current, updates, baseState);
      if (!mergeResult.canMerge) {
        throw new Error(`Version conflict detected. Current version is v${current.version}. Please reload before saving.`);
      }

      const mergedHistoryEntry: SubjectHistoryEntry = {
        changeId: crypto.randomUUID(),
        operation: 'UPDATE',
        version: current.version + 1,
        timestamp: new Date().toISOString(),
        modifiedBy: user.username,
        expectedVersion: Number.isNaN(expectedVersion) ? undefined : expectedVersion,
        mergeApplied: true,
        mergedFields: mergeResult.mergedFields,
        conflictFields: [],
        previousState: { ...current }
      };

      const mergedUpdatedSubject: Subject = {
        ...(mergeResult.mergedState as Subject),
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
        lastModifiedBy: user.username,
        history: [...(current.history || []), mergedHistoryEntry]
      };

      subjects[index] = mergedUpdatedSubject;
      setStorage(subjects);
      return mergedUpdatedSubject;
    }
    
    // Create History Snapshot
    const historyEntry: SubjectHistoryEntry = {
      changeId: crypto.randomUUID(),
      operation: 'UPDATE',
      version: current.version + 1,
      timestamp: new Date().toISOString(),
      modifiedBy: user.username,
      expectedVersion: Number.isNaN(expectedVersion) ? undefined : expectedVersion,
      mergeApplied: false,
      mergedFields: [],
      conflictFields: [],
      previousState: { ...current } // Shallow copy of old state
    };

    const nextUpdates = { ...updates } as any;
    delete nextUpdates.version;

    const updatedSubject: Subject = {
      ...current,
      ...nextUpdates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: user.username,
      history: [...(current.history || []), historyEntry]
    };

    subjects[index] = updatedSubject;
    setStorage(subjects);
    return updatedSubject;
  },

  // --- Safety / Deletion ---

  softDelete: async (id: string, user: User, expectedVersion?: number): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}/soft-delete`, 'POST', { expectedVersion });
      return;
    }

    const subjects = getStorage();
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) return;

    const current = subjects[index];
    const expected = Number(expectedVersion);
    if (!Number.isNaN(expected) && expected !== current.version) {
      throw new Error(`Version conflict detected. Current version is v${current.version}. Please reload before deleting.`);
    }

    const nextVersion = current.version + 1;
    subjects[index].isDeleted = true;
    subjects[index].version = nextVersion;
    subjects[index].updatedAt = new Date().toISOString();
    subjects[index].lastModifiedBy = user.username;
    subjects[index].history = [
      ...(current.history || []),
      {
        changeId: crypto.randomUUID(),
        operation: 'SOFT_DELETE',
        version: nextVersion,
        timestamp: new Date().toISOString(),
        modifiedBy: user.username,
        expectedVersion: Number.isNaN(expected) ? current.version : expected,
        previousState: { ...current }
      }
    ];
    
    setStorage(subjects);
  },

  restore: async (id: string, user: User, expectedVersion?: number): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}/restore`, 'POST', { expectedVersion });
      return;
    }

    const subjects = getStorage();
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) return;

    const current = subjects[index];
    const expected = Number(expectedVersion);
    if (!Number.isNaN(expected) && expected !== current.version) {
      throw new Error(`Version conflict detected. Current version is v${current.version}. Please reload before restoring.`);
    }

    const nextVersion = current.version + 1;
    subjects[index].isDeleted = false;
    subjects[index].version = nextVersion;
    subjects[index].updatedAt = new Date().toISOString();
    subjects[index].lastModifiedBy = user.username;
    subjects[index].history = [
      ...(current.history || []),
      {
        changeId: crypto.randomUUID(),
        operation: 'RESTORE',
        version: nextVersion,
        timestamp: new Date().toISOString(),
        modifiedBy: user.username,
        expectedVersion: Number.isNaN(expected) ? current.version : expected,
        previousState: { ...current }
      }
    ];
    
    setStorage(subjects);
  },

  hardDelete: async (id: string): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}`, 'DELETE');
      return;
    }

    // Permanent removal - only for admins via Recycle Bin
    let subjects = getStorage();
    subjects = subjects.filter(s => s.id !== id);
    setStorage(subjects);
  },

  // --- Full Database Operations ---

  generateBackup: async (): Promise<string> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/backup/export');
      return JSON.stringify(data, null, 2);
    }

    const subjects = getStorage();
    const users = safeGetItem(USERS_KEY);
    const studyProtocols = safeGetItem(STUDY_PROTOCOLS_KEY);
    
    const backupPayload = {
      meta: {
        timestamp: new Date().toISOString(),
        version: "1.0",
        app: "BiomechBase"
      },
      data: {
        subjects,
        users: users ? JSON.parse(users) : [],
        studyProtocols: studyProtocols ? JSON.parse(studyProtocols) : []
      }
    };

    return JSON.stringify(backupPayload, null, 2);
  },

  restoreBackup: async (jsonContent: string) => {
    try {
      const parsed = JSON.parse(jsonContent);

      if (USE_CLOUD_STORAGE) {
        await apiCall('/backup/import', 'POST', parsed);
        return true;
      }
      
      // Basic validation
      if (!parsed.meta || !parsed.data || !Array.isArray(parsed.data.subjects)) {
        throw new Error("Invalid backup file format.");
      }

      // Restore Subjects
      setStorage(parsed.data.subjects);
      
      // Restore Users
      if (Array.isArray(parsed.data.users)) {
        safeSetItem(USERS_KEY, JSON.stringify(parsed.data.users));
      }

      if (Array.isArray(parsed.data.studyProtocols)) {
        safeSetItem(STUDY_PROTOCOLS_KEY, JSON.stringify(parsed.data.studyProtocols));
      }

      return true;
    } catch (e) {
      console.error(e);
      throw new Error("Failed to restore database. File might be corrupted.");
    }
  }
};
