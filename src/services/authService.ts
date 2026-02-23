
import { User, UserRole } from "../types";
import { API_BASE_URL, USE_CLOUD_STORAGE } from '../config';

const USERS_STORAGE_KEY = 'biomech_users_db';
const SESSION_STORAGE_KEY = 'biomech_current_session';

const DEFAULT_USERS: any[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: 'Dongweiliu', 
    fullName: 'System Administrator',
    email: 'admin@biomech.sys',
    role: 'Admin',
    isActive: true
  }
];

const getUsersDB = (): any[] => {
  const stored = localStorage.getItem(USERS_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored);
};

const saveUsersDB = (users: any[]) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

// --- API Helper ---
const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
  const headers = { 'Content-Type': 'application/json' };
  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);
  
  // Handle relative paths for single-server deployment
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = `${baseUrl}/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const response = await fetch(url, config);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Auth request failed');
  }
  return response.json();
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
    if (USE_CLOUD_STORAGE) {
      const user = await apiCall('/auth/login', 'POST', { username, password });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      return user;
    } else {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 500));
      const users = getUsersDB();
      const user = users.find(u => u.username === username && u.password === password);
      
      if (!user) throw new Error("Invalid credentials.");
      if (!user.isActive) throw new Error("Account is pending approval.");

      const sessionUser: User = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role as UserRole,
        isActive: user.isActive,
        lastLogin: new Date().toISOString()
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
      return sessionUser;
    }
  },

  register: async (userData: { username: string; password: string; fullName: string; email: string; role: UserRole }) => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/auth/register', 'POST', userData);
    } else {
      await new Promise(r => setTimeout(r, 500));
      const users = getUsersDB();
      if (users.find(u => u.username === userData.username)) throw new Error("Username already taken.");

      const newUser = {
        id: crypto.randomUUID(),
        username: userData.username,
        password: userData.password,
        fullName: userData.fullName,
        email: userData.email,
        role: userData.role,
        isActive: false, 
        lastLogin: undefined
      };
      users.push(newUser);
      saveUsersDB(users);
      return newUser;
    }
  },

  logout: () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  // --- User Management (Admin) ---

  getAllUsers: async (): Promise<User[]> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/users');
    } else {
      await new Promise(r => setTimeout(r, 200));
      const users = getUsersDB();
      return users.map(({ password, ...u }) => u as User);
    }
  },

  createUser: async (userData: Omit<User, 'id' | 'lastLogin'>, tempPassword: string) => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/users', 'POST', { ...userData, password: tempPassword });
    } else {
      const users = getUsersDB();
      if (users.find(u => u.username === userData.username)) throw new Error("Username already exists.");
      const newUser = {
        ...userData,
        id: crypto.randomUUID(),
        password: tempPassword
      };
      users.push(newUser);
      saveUsersDB(users);
      return newUser;
    }
  },

  updateUser: async (id: string, updates: Partial<User>) => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}`, 'PUT', updates);
    } else {
      const users = getUsersDB();
      const index = users.findIndex(u => u.id === id);
      if (index === -1) throw new Error("User not found");
      
      // Safety check for admins
      if (users[index].role === 'Admin' && updates.role && updates.role !== 'Admin') {
         const adminCount = users.filter(u => u.role === 'Admin').length;
         if (adminCount <= 1) throw new Error("Cannot modify the last Administrator.");
      }

      users[index] = { ...users[index], ...updates };
      saveUsersDB(users);
    }
    
    // Update local session if needed
    const current = authService.getCurrentUser();
    if (current && current.id === id) {
       const updatedSession = { ...current, ...updates };
       localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    }
  },

  deleteUser: async (id: string) => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}`, 'DELETE');
    } else {
       let users = getUsersDB();
       const target = users.find(u => u.id === id);
       if (target?.role === 'Admin') {
         const adminCount = users.filter(u => u.role === 'Admin').length;
         if (adminCount <= 1) throw new Error("Cannot delete the last Administrator.");
       }
       users = users.filter(u => u.id !== id);
       saveUsersDB(users);
    }
  }
};
