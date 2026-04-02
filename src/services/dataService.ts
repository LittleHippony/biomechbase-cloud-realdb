
import { Subject, SubjectHistoryEntry, User } from '../types';
import { USE_CLOUD_STORAGE } from '../config';
import { apiCall } from './apiClient';

const SUBJECTS_KEY = 'biomech_subjects_db';
const USERS_KEY = 'biomech_users_db';

// --- Local Storage Helpers (Fallback) ---
const getStorage = (): Subject[] => {
  const data = localStorage.getItem(SUBJECTS_KEY);
  return data ? (JSON.parse(data) as Subject[]) : [];
};

const setStorage = (data: Subject[]) => {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(data));
};

export const dataService = {

  // --- Reads ---

  getAll: async (includeDeleted = false): Promise<Subject[]> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/subjects') as Subject[];
      return includeDeleted ? data : data.filter(s => !s.isDeleted);
    }
    const all = getStorage();
    return includeDeleted ? all : all.filter(s => !s.isDeleted);
  },

  getDeleted: async (): Promise<Subject[]> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/subjects?deleted=true') as Subject[];
    }
    return getStorage().filter(s => s.isDeleted);
  },

  // --- Writes ---

  create: async (
    data: Omit<Subject, 'id' | 'isDeleted' | 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'history'>,
    user: User
  ): Promise<Subject> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/subjects', 'POST', { data, user }) as Subject;
    }

    const subjects = getStorage();
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
      history: []
    };
    subjects.push(newSubject);
    setStorage(subjects);
    return newSubject;
  },

  update: async (id: string, updates: Partial<Subject>, user: User): Promise<Subject> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall(`/subjects/${id}`, 'PUT', { updates, user }) as Subject;
    }

    const subjects = getStorage();
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Record not found");

    const current = subjects[index];
    const historyEntry: SubjectHistoryEntry = {
      changeId: crypto.randomUUID(),
      operation: 'UPDATE',
      version: current.version,
      timestamp: new Date().toISOString(),
      modifiedBy: user.username,
      previousState: { ...current }
    };

    const updatedSubject: Subject = {
      ...current,
      ...updates,
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

  softDelete: async (id: string, user: User): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}/soft-delete`, 'POST', { user });
      return;
    }

    const subjects = getStorage();
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) return;
    subjects[index].isDeleted = true;
    subjects[index].updatedAt = new Date().toISOString();
    subjects[index].lastModifiedBy = user.username;
    setStorage(subjects);
  },

  restore: async (id: string, user: User): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}/restore`, 'POST', { user });
      return;
    }

    const subjects = getStorage();
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) return;
    subjects[index].isDeleted = false;
    subjects[index].updatedAt = new Date().toISOString();
    subjects[index].lastModifiedBy = user.username;
    setStorage(subjects);
  },

  hardDelete: async (id: string): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}`, 'DELETE');
      return;
    }
    setStorage(getStorage().filter(s => s.id !== id));
  },

  // --- Backup ---

  generateBackup: async (): Promise<string> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/backup/export');
      return JSON.stringify(data, null, 2);
    }

    const subjects = getStorage();
    const rawUsers = localStorage.getItem(USERS_KEY);
    const backupPayload = {
      meta: { timestamp: new Date().toISOString(), version: "1.0", app: "BiomechBase" },
      data: { subjects, users: rawUsers ? JSON.parse(rawUsers) : [] }
    };
    return JSON.stringify(backupPayload, null, 2);
  },

  restoreBackup: async (jsonContent: string): Promise<boolean> => {
    let parsed: { meta?: unknown; data?: { subjects?: Subject[]; users?: unknown[] } };
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error("Invalid backup file: could not parse JSON.");
    }

    if (!parsed.meta || !parsed.data) throw new Error("Invalid backup format: missing required fields.");

    if (USE_CLOUD_STORAGE) {
      await apiCall('/backup/import', 'POST', parsed);
      return true;
    }

    if (!Array.isArray(parsed.data.subjects)) throw new Error("Invalid backup format: subjects must be an array.");
    setStorage(parsed.data.subjects);
    if (Array.isArray(parsed.data.users)) {
      localStorage.setItem(USERS_KEY, JSON.stringify(parsed.data.users));
    }
    return true;
  }
};
