import { User, UserRole } from "../types";
import { API_BASE_URL, USE_CLOUD_STORAGE } from '../config';

const USERS_STORAGE_KEY = 'biomech_users_db';
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

const notifySessionExpired = (message: string) => {
  safeRemoveItem(SESSION_TOKEN_STORAGE_KEY);
  safeRemoveItem(SESSION_STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('biomech:session-expired', { detail: { message } }));
  }
};

// Default initial users - Only Admin as requested
const DEFAULT_USERS: any[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: 'Dongweiliu', // Specific password as requested
    fullName: 'System Administrator',
    email: 'admin@biomech.sys',
    role: 'Admin',
    adminTier: 1,
    firstLoginCompleted: true,
    isActive: true
  }
];

// Helper to get users from "DB"
const getUsersDB = (): any[] => {
  const stored = safeGetItem(USERS_STORAGE_KEY);
  if (!stored) {
    safeSetItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid users format');
    }
    return parsed;
  } catch {
    safeSetItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
};

const saveUsersDB = (users: any[]) => {
  safeSetItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

const getSessionToken = (): string | null => {
  return safeGetItem(SESSION_TOKEN_STORAGE_KEY);
};

type RegistrationPayload = {
  username: string;
  password: string;
  fullName: string;
  email: string;
  role: UserRole;
  requestedAdminId?: string;
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
    let message = 'Auth request failed';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // noop
    }
    if (response.status === 401 && token) {
      const sessionMessage = message || 'Session expired or invalid. Please sign in again.';
      notifySessionExpired(sessionMessage);
      throw new Error(sessionMessage);
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
    if (USE_CLOUD_STORAGE) {
      const user = await apiCall('/auth/login', 'POST', { username, password });
      if (user?.sessionToken) {
        safeSetItem(SESSION_TOKEN_STORAGE_KEY, user.sessionToken);
      }
      safeSetItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      return user;
    }

    const users = getUsersDB();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      throw new Error("Invalid credentials.");
    }
    
    if (!user.isActive) {
      throw new Error("Account is pending approval. Please contact the Administrator.");
    }

    // Create session object (safe, no password)
    const sessionUser: User = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role as UserRole,
      adminTier: user.adminTier,
      isActive: user.isActive,
      lastLogin: new Date().toISOString(),
      confidentialAccess: user.role === 'Admin'
    };

    safeSetItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  },

  register: async (userData: { username: string; password: string; fullName: string; email: string; role: UserRole; requestedAdminId?: string }) => {
    const normalized: RegistrationPayload = {
      ...userData,
      username: userData.username.trim(),
      fullName: userData.fullName.trim(),
      email: userData.email.trim(),
      role: userData.role
    };

    if (normalized.role !== 'Admin' && normalized.role !== 'Researcher') {
      throw new Error('Only Admin or Researcher registration is supported.');
    }

    if (USE_CLOUD_STORAGE) {
      return await apiCall('/auth/register', 'POST', normalized);
    }

    const users = getUsersDB();
    
    if (users.find(u => u.username === normalized.username)) {
      throw new Error("Username already taken.");
    }

    if (!normalized.requestedAdminId) {
      throw new Error('Please select an Admin account for approval.');
    }

    const newUser = {
      id: crypto.randomUUID(),
      username: normalized.username,
      password: normalized.password,
      fullName: normalized.fullName,
      email: normalized.email,
      role: normalized.role,
      isActive: false,
      lastLogin: undefined,
      adminTier: normalized.role === 'Admin' ? 2 : undefined,
      firstLoginCompleted: normalized.role === 'Admin',
      assignedAdminId: normalized.requestedAdminId,
      assignedAdminUsername: undefined
    };

    const assignedAdmin = users.find((u) => u.role === 'Admin' && u.isActive && u.id === normalized.requestedAdminId);
    if (!assignedAdmin) {
      throw new Error('Selected Admin account was not found.');
    }
    if (normalized.role === 'Admin' && assignedAdmin.adminTier !== 1) {
      throw new Error('Admin registration must be assigned to a Primary Admin.');
    }
    newUser.assignedAdminUsername = assignedAdmin.username;

    users.push(newUser);
    saveUsersDB(users);
    return newUser;
  },

  getPublicAdmins: async (): Promise<Array<Pick<User, 'id' | 'username' | 'fullName' | 'adminTier'>>> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/auth/admins');
    }

    const users = getUsersDB();
    return users
      .filter((user) => user.role === 'Admin' && user.isActive)
      .map((user) => ({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        adminTier: user.adminTier
      }));
  },

  logout: async () => {
    if (USE_CLOUD_STORAGE) {
      try {
        await apiCall('/auth/logout', 'POST');
      } catch {
        // ignore server-side logout failures; always clear local session
      }
    }
    safeRemoveItem(SESSION_STORAGE_KEY);
    safeRemoveItem(SESSION_TOKEN_STORAGE_KEY);
  },

  getCurrentUser: (): User | null => {
    const stored = safeGetItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      safeRemoveItem(SESSION_STORAGE_KEY);
      return null;
    }
  },

  // --- User Management (Admin) ---

  getAllUsers: async (): Promise<User[]> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/users');
    }

    const users = getUsersDB();
    // Return users without passwords
    return users.map(({ password, ...u }) => u as User);
  },

  createUser: async (userData: Omit<User, 'id' | 'lastLogin'>, tempPassword: string) => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/users', 'POST', { ...userData, password: tempPassword });
    }

    const current = authService.getCurrentUser();
    if (!current || current.role !== 'Admin' || current.adminTier !== 1) {
      throw new Error('Primary Admin access required.');
    }

    const users = getUsersDB();
    if (users.find(u => u.username === userData.username)) {
      throw new Error("Username already exists.");
    }

    if (userData.role !== 'Researcher' && userData.role !== 'Admin') {
      throw new Error('Only Researcher or Admin accounts can be created.');
    }

    const newUser = {
      ...userData,
      id: crypto.randomUUID(),
      password: tempPassword,
      adminTier: userData.role === 'Admin' ? 2 : undefined,
      firstLoginCompleted: userData.role === 'Researcher' ? false : true,
      assignedAdminId: userData.role === 'Researcher' ? current?.id : undefined,
      assignedAdminUsername: userData.role === 'Researcher' ? current?.username : undefined
    };

    users.push(newUser);
    saveUsersDB(users);
    return newUser;
  },

  updateUser: async (id: string, updates: Partial<User>) => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}`, 'PUT', updates);
    } else {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'Admin' || currentUser.adminTier !== 1) {
      throw new Error('Primary Admin access required.');
    }

    const users = getUsersDB();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error("User not found");

    if ((updates as any).adminTier === 1) {
      throw new Error('Primary Admin cannot be created or assigned.');
    }

    if (users[index].role === 'Admin' && users[index].adminTier === 1) {
      throw new Error('Primary Admin profile cannot be modified from this endpoint.');
    }

    // Prevent removing the last admin
    if (users[index].role === 'Admin' && updates.role && updates.role !== 'Admin') {
      const adminCount = users.filter(u => u.role === 'Admin').length;
      if (adminCount <= 1) throw new Error("Cannot modify the last Administrator.");
    }

    const safeUpdates: any = { ...updates };
    if (safeUpdates.role && safeUpdates.role !== 'Admin') {
      delete safeUpdates.adminTier;
    }

    if (safeUpdates.role === 'Admin' && safeUpdates.adminTier === undefined) {
      safeUpdates.adminTier = 2;
    }

    users[index] = { ...users[index], ...safeUpdates };
    saveUsersDB(users);
  }
    
    // If updating current user, update session
    const current = authService.getCurrentUser();
    if (current && current.id === id) {
       const updatedSession = { ...current, ...updates };
       safeSetItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    }
  },

  resetUserPassword: async (id: string, tempPassword: string) => {
    if (!tempPassword || tempPassword.trim().length < 8) {
      throw new Error('Temporary password must be at least 8 characters.');
    }

    if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}/reset-password`, 'POST', { password: tempPassword.trim() });
      return;
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'Admin' || currentUser.adminTier !== 1) {
      throw new Error('Primary Admin access required.');
    }

    const users = getUsersDB();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    users[index].password = tempPassword.trim();
    if (users[index].role === 'Researcher') {
      users[index].firstLoginCompleted = false;
    }
    saveUsersDB(users);
  },

    deleteUser: async (id: string) => {
      if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}`, 'DELETE');
      return;
      }

     const currentUser = authService.getCurrentUser();
     if (!currentUser || currentUser.role !== 'Admin' || currentUser.adminTier !== 1) {
       throw new Error('Primary Admin access required.');
     }

     let users = getUsersDB();
     const target = users.find(u => u.id === id);
     
     if (target?.role === 'Admin') {
       const adminCount = users.filter(u => u.role === 'Admin').length;
       if (adminCount <= 1) throw new Error("Cannot delete the last Administrator.");
     }

     users = users.filter(u => u.id !== id);
     saveUsersDB(users);
  }
};