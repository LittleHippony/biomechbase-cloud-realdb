
import { Subject, SubjectHistoryEntry, User } from '../types';
import { API_BASE_URL, USE_CLOUD_STORAGE } from '../config';

const SUBJECTS_KEY = 'biomech_subjects_db';
const USERS_KEY = 'biomech_users_db';

// --- Local Storage Helpers (Fallback) ---
const getStorage = (): Subject[] => {
  const data = localStorage.getItem(SUBJECTS_KEY);
  return data ? JSON.parse(data) : [];
};
const setStorage = (data: Subject[]) => {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(data));
};

// --- API Helper ---
const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
  const headers = { 'Content-Type': 'application/json' };
  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);
  
  // Ensure we don't get double slashes if API_BASE_URL is empty
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const response = await fetch(url, config);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }
  return response.json();
};

export const dataService = {
  
  // --- Reads ---
  
  getAll: async (includeDeleted = false): Promise<Subject[]> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/subjects');
      return includeDeleted ? data : data.filter((s: Subject) => !s.isDeleted);
    } else {
      // Simulate Async for LocalStorage
      return new Promise(resolve => {
        const all = getStorage();
        resolve(includeDeleted ? all : all.filter(s => !s.isDeleted));
      });
    }
  },

  getDeleted: async (): Promise<Subject[]> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/subjects?deleted=true');
      return data;
    } else {
      return new Promise(resolve => resolve(getStorage().filter(s => s.isDeleted)));
    }
  },

  // --- Writes ---

  create: async (data: Omit<Subject, 'id' | 'isDeleted' | 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'history'>, user: User): Promise<Subject> => {
    if (USE_CLOUD_STORAGE) {
       return await apiCall('/subjects', 'POST', { data, user });
    } else {
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
    }
  },

  update: async (id: string, updates: Partial<Subject>, user: User): Promise<Subject> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall(`/subjects/${id}`, 'PUT', { updates, user });
    } else {
      const subjects = getStorage();
      const index = subjects.findIndex(s => s.id === id);
      if (index === -1) throw new Error("Record not found");

      const current = subjects[index];
      const historyEntry: SubjectHistoryEntry = {
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
    }
  },

  // --- Safety / Deletion ---

  softDelete: async (id: string, user: User): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}/soft-delete`, 'POST', { user });
    } else {
      const subjects = getStorage();
      const index = subjects.findIndex(s => s.id === id);
      if (index === -1) return;
      subjects[index].isDeleted = true;
      subjects[index].updatedAt = new Date().toISOString();
      subjects[index].lastModifiedBy = user.username;
      setStorage(subjects);
    }
  },

  restore: async (id: string, user: User): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
       await apiCall(`/subjects/${id}/restore`, 'POST', { user });
    } else {
      const subjects = getStorage();
      const index = subjects.findIndex(s => s.id === id);
      if (index === -1) return;
      subjects[index].isDeleted = false;
      subjects[index].updatedAt = new Date().toISOString();
      subjects[index].lastModifiedBy = user.username;
      setStorage(subjects);
    }
  },

  hardDelete: async (id: string): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/subjects/${id}`, 'DELETE');
    } else {
      let subjects = getStorage();
      subjects = subjects.filter(s => s.id !== id);
      setStorage(subjects);
    }
  },

  // --- Backup ---

  generateBackup: async (): Promise<string> => {
    if (USE_CLOUD_STORAGE) {
      const data = await apiCall('/backup/export');
      return JSON.stringify(data, null, 2);
    } else {
      const subjects = getStorage();
      const users = localStorage.getItem(USERS_KEY);
      const backupPayload = {
        meta: { timestamp: new Date().toISOString(), version: "1.0", app: "BiomechBase" },
        data: { subjects, users: users ? JSON.parse(users) : [] }
      };
      return JSON.stringify(backupPayload, null, 2);
    }
  },

  restoreBackup: async (jsonContent: string): Promise<boolean> => {
    const parsed = JSON.parse(jsonContent);
    if (!parsed.meta || !parsed.data) throw new Error("Invalid format");

    if (USE_CLOUD_STORAGE) {
      await apiCall('/backup/import', 'POST', parsed);
      return true;
    } else {
      setStorage(parsed.data.subjects);
      if (Array.isArray(parsed.data.users)) {
        localStorage.setItem(USERS_KEY, JSON.stringify(parsed.data.users));
      }
      return true;
    }
  }
};
