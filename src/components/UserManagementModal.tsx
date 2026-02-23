
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authService } from '../services/authService';
import { Button } from './Button';
import { X, UserPlus, Shield, UserX, CheckCircle, RefreshCcw, Trash2, Clock, Mail, Copy, Key } from 'lucide-react';

interface UserManagementModalProps {
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ onClose }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = useState<'list' | 'add' | 'invite'>('list');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
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

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await authService.getAllUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authService.createUser({
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        isActive: true
      }, newUser.password);
      
      await loadUsers();
      setView('list');
      setNewUser({ username: '', fullName: '', email: '', role: 'Researcher', password: '' });
    } catch (err: any) {
      setError(err.message);
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
    const password = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4);
    const fullName = inviteEmail.split('@')[0];

    try {
        await authService.createUser({
            username,
            fullName,
            email: inviteEmail,
            role: 'Researcher',
            isActive: true
        }, password);

        setGeneratedCreds({ username, password });
        await loadUsers();
    } catch (err: any) {
        setError(err.message);
    }
  };

  const toggleStatus = async (user: User) => {
    try {
      await authService.updateUser(user.id, { isActive: !user.isActive });
      await loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const deleteUser = async (id: string) => {
    if(window.confirm("Permanently delete this user?")) {
      try {
        await authService.deleteUser(id);
        await loadUsers();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-middle bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:max-w-4xl sm:w-full">
          <div className="bg-white flex flex-col max-h-[90vh]">
            
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                <Shield className="mr-2 h-5 w-5 text-indigo-600"/> User Management
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
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
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                u.role === 'Admin' ? 'bg-purple-100 text-purple-800' : 
                                u.role === 'Researcher' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                              }`}>
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
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                               <button 
                                onClick={() => toggleStatus(u)}
                                className={`${u.isActive ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800 font-bold'}`}
                                title={u.isActive ? "Deactivate User" : "Approve User"}
                               >
                                 {u.isActive ? <UserX size={16}/> : <CheckCircle size={18}/>}
                               </button>
                               <button 
                                onClick={() => deleteUser(u.id)}
                                className="text-gray-400 hover:text-red-600"
                                title="Delete"
                               >
                                 <Trash2 size={16}/>
                               </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              
              {/* Add & Invite Views remain largely similar, they just call handleCreateUser or handleQuickInvite which are now async */}
              {view === 'add' && (
                <div className="max-w-md mx-auto">
                   <h4 className="text-lg font-medium text-gray-900 mb-4">Create New Account Manually</h4>
                   {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
                   <form onSubmit={handleCreateUser} className="space-y-4">
                      {/* Form fields identical to original */}
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
                             {/* ... Invite fields identical ... */}
                            <p className="text-sm text-gray-500">
                                Enter the researcher's email address. The system will auto-generate a username and password.
                            </p>
                            {error && <div className="text-red-600 text-sm">{error}</div>}
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
                            {/* ... Success View ... */}
                            <p className="text-sm text-green-700 mb-4">
                                Please copy these credentials and send them to the researcher securely.
                            </p>
                            
                            <div className="bg-white border border-gray-200 rounded p-3 space-y-3 mb-4">
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase">Username</label>
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono font-medium text-gray-800">{generatedCreds.username}</span>
                                        <button onClick={() => copyToClipboard(generatedCreds.username)} className="text-gray-400 hover:text-indigo-600"><Copy size={14}/></button>
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 pt-2">
                                    <label className="block text-xs text-gray-500 uppercase">Auto-Generated Password</label>
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono font-medium text-gray-800">{generatedCreds.password}</span>
                                        <button onClick={() => copyToClipboard(generatedCreds.password)} className="text-gray-400 hover:text-indigo-600"><Copy size={14}/></button>
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
