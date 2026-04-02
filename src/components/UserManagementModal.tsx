
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authService } from '../services/authService';
import { Button } from './Button';
import { X, UserPlus, Shield, UserX, CheckCircle, Trash2, Clock, Mail, Copy, Key, AlertTriangle } from 'lucide-react';

interface UserManagementModalProps {
  onClose: () => void;
}

const generatePassword = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-secure contexts
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
};

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ onClose }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = useState<'list' | 'add' | 'invite'>('list');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Manual Form State
  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    email: '',
    role: 'Researcher' as UserRole,
    password: ''
  });

  // Quick Invite State
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedCreds, setGeneratedCreds] = useState<{username: string, password: string} | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authService.getAllUsers();
      setUsers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const created = await authService.createUser({
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        isActive: true
      }, newUser.password);

      setUsers(prev => [...prev, created]);
      setView('list');
      setNewUser({ username: '', fullName: '', email: '', role: 'Researcher', password: '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    }
  };

  const handleQuickInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inviteEmail.includes('@')) {
      setError("Invalid email address");
      return;
    }

    const username = inviteEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const password = generatePassword();
    const fullName = inviteEmail.split('@')[0];

    try {
      const created = await authService.createUser({
        username,
        fullName,
        email: inviteEmail,
        role: 'Researcher',
        isActive: true
      }, password);

      setUsers(prev => [...prev, created]);
      setGeneratedCreds({ username, password });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    }
  };

  const toggleStatus = async (user: User) => {
    setError('');
    try {
      await authService.updateUser(user.id, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    }
  };

  const confirmDelete = async (id: string) => {
    setError('');
    try {
      await authService.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
      setConfirmDeleteId(null);
    }
  };

  const roleBadgeClass = (role: UserRole) => {
    if (role === 'Admin') return 'bg-purple-100 text-purple-800';
    if (role === 'Researcher') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="User Management">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-middle bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:max-w-4xl sm:w-full">
          <div className="bg-white flex flex-col max-h-[90vh]">

            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                <Shield className="mr-2 h-5 w-5 text-indigo-600"/> User Management
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex items-center mb-4">
                  <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0" /> {error}
                </div>
              )}

              {loading && view === 'list' && <div className="text-center py-4 text-gray-500">Loading users...</div>}

              {!loading && view === 'list' && (
                <>
                  <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                    <p className="text-sm text-gray-500 self-center">Approve researcher registrations or manage access.</p>
                    <div className="flex space-x-2">
                      <Button variant="secondary" icon={<Mail size={16}/>} onClick={() => { setView('invite'); setGeneratedCreds(null); setInviteEmail(''); setError(''); }}>
                        Quick Invite
                      </Button>
                      <Button variant="primary" icon={<UserPlus size={16}/>} onClick={() => { setView('add'); setError(''); }}>
                        Manually Add
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {users.map(u => (
                          <tr key={u.id}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{u.fullName}</div>
                              <div className="text-xs text-gray-500">{u.username}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(u.role)}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {u.isActive ? (
                                <span className="flex items-center text-xs text-green-600"><CheckCircle size={12} className="mr-1"/> Active</span>
                              ) : (
                                <span className="flex items-center text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-1 rounded-full"><Clock size={12} className="mr-1"/> Pending Approval</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                              {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                              {confirmDeleteId === u.id ? (
                                <span className="inline-flex items-center space-x-2">
                                  <span className="text-xs text-gray-600 mr-1">Delete?</span>
                                  <button
                                    onClick={() => confirmDelete(u.id)}
                                    className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                                    aria-label="Confirm delete"
                                  >Yes</button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-300"
                                    aria-label="Cancel delete"
                                  >No</button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-2">
                                  <button
                                    onClick={() => toggleStatus(u)}
                                    className={`${u.isActive ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800 font-bold'}`}
                                    aria-label={u.isActive ? `Deactivate ${u.username}` : `Approve ${u.username}`}
                                    title={u.isActive ? "Deactivate User" : "Approve User"}
                                  >
                                    {u.isActive ? <UserX size={16}/> : <CheckCircle size={18}/>}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(u.id)}
                                    className="text-gray-400 hover:text-red-600"
                                    aria-label={`Delete ${u.username}`}
                                    title="Delete"
                                  >
                                    <Trash2 size={16}/>
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {view === 'add' && (
                <div className="max-w-md mx-auto">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Create New Account Manually</h4>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Full Name</label>
                      <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email Address</label>
                      <input type="email" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Username</label>
                      <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Temporary Password</label>
                      <input type="password" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Role</label>
                      <select className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
                        <option value="Researcher">Researcher</option>
                        <option value="Admin">Administrator</option>
                        <option value="Visitor">Visitor</option>
                      </select>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                      <Button type="button" variant="secondary" onClick={() => setView('list')}>Cancel</Button>
                      <Button type="submit" variant="primary">Create User</Button>
                    </div>
                  </form>
                </div>
              )}

              {view === 'invite' && (
                <div className="max-w-md mx-auto">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Quick Invite Researcher</h4>

                  {!generatedCreds ? (
                    <form onSubmit={handleQuickInvite} className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Enter the researcher's email address. The system will auto-generate a username and password.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Researcher Email</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="email"
                            required
                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                            placeholder="researcher@university.edu"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end space-x-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setView('list')}>Cancel</Button>
                        <Button type="submit" variant="primary" icon={<Key size={16}/>}>Generate Credentials</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-md p-4">
                      <div className="flex items-center mb-3">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                        <h5 className="text-sm font-medium text-green-800">Account Created Successfully</h5>
                      </div>
                      <p className="text-sm text-green-700 mb-4">
                        Copy these credentials and send them to the researcher securely.
                      </p>

                      <div className="bg-white border border-gray-200 rounded p-3 space-y-3 mb-4">
                        <div>
                          <label className="block text-xs text-gray-500 uppercase">Username</label>
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-medium text-gray-800">{generatedCreds.username}</span>
                            <button
                              onClick={() => copyToClipboard(generatedCreds.username)}
                              className="text-gray-400 hover:text-indigo-600"
                              aria-label="Copy username"
                            ><Copy size={14}/></button>
                          </div>
                        </div>
                        <div className="border-t border-gray-100 pt-2">
                          <label className="block text-xs text-gray-500 uppercase">Auto-Generated Password</label>
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-medium text-gray-800">{generatedCreds.password}</span>
                            <button
                              onClick={() => copyToClipboard(generatedCreds.password)}
                              className="text-gray-400 hover:text-indigo-600"
                              aria-label="Copy password"
                            ><Copy size={14}/></button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="button" variant="primary" onClick={() => { setView('list'); setGeneratedCreds(null); }}>Done</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
