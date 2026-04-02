
import { User, UserRole } from "../types";
import { USE_CLOUD_STORAGE } from '../config';
import { apiCall } from './apiClient';

const USERS_STORAGE_KEY = 'biomech_users_db';
const SESSION_STORAGE_KEY = 'biomech_current_session';

interface StoredUser extends User {
  password: string;
}

// On first run with no .env, generate a random admin password and log it once.
const getDefaultAdminPassword = (): string => {
  const envPw = import.meta.env.VITE_DEFAULT_ADMIN_PASSWORD;
  if (envPw) return envPw;

  const stored = localStorage.getItem('biomech_admin_init_pw');
  if (stored) return stored;

  const pw = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  localStorage.setItem('biomech_admin_init_pw', pw);
  console.info(
    '%c[BiomechBase] First-run admin password: ' + pw + '\nChange this via User Management after login.',
    'color: orange; font-weight: bold'
  );
  return pw;
};

const DEFAULT_USERS: StoredUser[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: getDefaultAdminPassword(),
    fullName: 'System Administrator',
    email: 'admin@biomech.sys',
    role: 'Admin',
    isActive: true
  }
];

const getUsersDB = (): StoredUser[] => {
  const stored = localStorage.getItem(USERS_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored) as StoredUser[];
};

const saveUsersDB = (users: StoredUser[]) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

const isLastAdmin = (users: StoredUser[], excludeId?: string): boolean => {
  const admins = users.filter(u => u.role === 'Admin' && u.id !== excludeId);
  return admins.length === 0;
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
    if (USE_CLOUD_STORAGE) {
      const user = await apiCall('/auth/login', 'POST', { username, password }) as User;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      return user;
    }

    const users = getUsersDB();
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) throw new Error("Invalid credentials.");
    if (!user.isActive) throw new Error("Account is pending approval.");

    const { password: _pw, ...sessionUser } = user;
    const session: User = { ...sessionUser, lastLogin: new Date().toISOString() };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  },

  register: async (userData: { username: string; password: string; fullName: string; email: string; role: UserRole }) => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/auth/register', 'POST', userData);
    }

    const users = getUsersDB();
    if (users.find(u => u.username === userData.username)) {
      throw new Error("Username already taken.");
    }

    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      username: userData.username,
      password: userData.password,
      fullName: userData.fullName,
      email: userData.email,
      role: userData.role,
      isActive: false,
    };
    users.push(newUser);
    saveUsersDB(users);
    return newUser;
  },

  logout: () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as User) : null;
  },

  getAllUsers: async (): Promise<User[]> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/users') as User[];
    }

    const users = getUsersDB();
    return users.map(({ password: _pw, ...u }) => u as User);
  },

  createUser: async (userData: Omit<User, 'id' | 'lastLogin'>, tempPassword: string): Promise<User> => {
    if (USE_CLOUD_STORAGE) {
      return await apiCall('/users', 'POST', { ...userData, password: tempPassword }) as User;
    }

    const users = getUsersDB();
    if (users.find(u => u.username === userData.username)) {
      throw new Error("Username already exists.");
    }

    const newUser: StoredUser = { ...userData, id: crypto.randomUUID(), password: tempPassword };
    users.push(newUser);
    saveUsersDB(users);

    const { password: _pw, ...publicUser } = newUser;
    return publicUser as User;
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}`, 'PUT', updates);
    } else {
      const users = getUsersDB();
      const index = users.findIndex(u => u.id === id);
      if (index === -1) throw new Error("User not found");

      if (users[index].role === 'Admin' && updates.role && updates.role !== 'Admin') {
        if (isLastAdmin(users, id)) throw new Error("Cannot modify the last Administrator.");
      }

      users[index] = { ...users[index], ...updates };
      saveUsersDB(users);
    }

    const current = authService.getCurrentUser();
    if (current?.id === id) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    }
  },

  deleteUser: async (id: string): Promise<void> => {
    if (USE_CLOUD_STORAGE) {
      await apiCall(`/users/${id}`, 'DELETE');
      return;
    }

    const users = getUsersDB();
    const target = users.find(u => u.id === id);
    if (target?.role === 'Admin' && isLastAdmin(users, id)) {
      throw new Error("Cannot delete the last Administrator.");
    }
    saveUsersDB(users.filter(u => u.id !== id));
  }
};
