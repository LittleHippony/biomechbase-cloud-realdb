import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authService } from '../services/authService';
import { Button } from './Button';
import { X, UserPlus, Shield, UserX, CheckCircle, Trash2, Clock, Mail, Copy, Key, AlertTriangle } from 'lucide-react';

interface UserManagementModalProps {
  onClose: () => void;
  language?: 'en' | 'zh';
  currentUser: User;
}

const USER_MGMT_TEXT = {
  en: {
    title: 'User Management',
    subtitle: 'Approve researcher registrations or manage access.',
    quickInvite: 'Quick Invite',
    manualAdd: 'Manually Add',
    user: 'User',
    role: 'Role',
    accountType: 'Account Type',
    tierOneAdmin: 'Primary Admin',
    tierTwoAdmin: 'Admin',
    createTierTwoHint: 'Admin accounts are created as pending and must be authorized.',
    inviteHintAdmin: 'Enter the admin email. Account will be created pending authorization.',
    inviteHintResearcher: 'Enter the researcher email address. The system will auto-generate a username and password.',
    status: 'Status',
    assignedAdmin: 'Assigned Admin',
    lastLogin: 'Last Login',
    actions: 'Actions',
    active: 'Active',
    pendingApproval: 'Pending Approval',
    never: 'Never',
    deactivateUser: 'Deactivate User',
    approveUser: 'Approve User',
    resetPassword: 'Reset Password',
    delete: 'Delete',
    createManual: 'Create New Account Manually',
    createManualHint: 'Create a researcher account and assign it to your admin account.',
    fullName: 'Full Name',
    emailAddress: 'Email Address',
    username: 'Username',
    tempPassword: 'Temporary Password',
    admin: 'Administrator',
    researcher: 'Researcher',
    visitor: 'Visitor',
    cancel: 'Cancel',
    createUser: 'Create User',
    inviteResearcher: 'Quick Invite Researcher',
    inviteHint: 'Enter the researcher\'s email address. The system will auto-generate a username and password.',
    researcherEmail: 'Researcher Email',
    generateCreds: 'Generate Credentials',
    accountCreated: 'Account Created Successfully',
    copyHint: 'Please copy these credentials and send them to the researcher securely.',
    autoPassword: 'Auto-Generated Password',
    done: 'Done',
    invalidEmail: 'Invalid email address',
    deleteConfirm: 'Permanently delete this user?',
    resetPrompt: 'Set a temporary password for this account (minimum 8 characters):',
    resetSuccess: 'Temporary password updated successfully.'
  },
  zh: {
    title: '用户管理',
    subtitle: '审批研究者注册申请或管理访问权限。',
    quickInvite: '快速邀请',
    manualAdd: '手动新增',
    user: '用户',
    role: '角色',
    accountType: '账户类型',
    tierOneAdmin: '主管理员',
    tierTwoAdmin: '管理员',
    createTierTwoHint: '管理员账户创建后为待审批状态，需授权后启用。',
    inviteHintAdmin: '输入管理员邮箱，系统将创建待授权账户。',
    inviteHintResearcher: '输入研究者邮箱地址，系统将自动生成用户名和密码。',
    status: '状态',
    assignedAdmin: '所属管理员',
    lastLogin: '最近登录',
    actions: '操作',
    active: '已启用',
    pendingApproval: '待审批',
    never: '从未',
    deactivateUser: '停用用户',
    approveUser: '批准用户',
    resetPassword: '重置密码',
    delete: '删除',
    createManual: '手动创建新账户',
    createManualHint: '创建研究者账户，并自动归属到当前管理员。',
    fullName: '姓名',
    emailAddress: '邮箱地址',
    username: '用户名',
    tempPassword: '临时密码',
    admin: '管理员',
    researcher: '研究者',
    visitor: '访客',
    cancel: '取消',
    createUser: '创建用户',
    inviteResearcher: '快速邀请研究者',
    inviteHint: '输入研究者邮箱地址，系统将自动生成用户名和密码。',
    researcherEmail: '研究者邮箱',
    generateCreds: '生成凭据',
    accountCreated: '账户创建成功',
    copyHint: '请复制以下凭据并通过安全方式发送给研究者。',
    autoPassword: '自动生成密码',
    done: '完成',
    invalidEmail: '邮箱地址无效',
    deleteConfirm: '确认永久删除该用户？',
    resetPrompt: '请为该账户设置临时密码（至少8个字符）：',
    resetSuccess: '临时密码重置成功。'
  }
};

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ onClose, language = 'en', currentUser }) => {
  const t = USER_MGMT_TEXT[language];
  const isSessionError = (message: string) => {
    const text = String(message || '').toLowerCase();
    return text.includes('session expired') || text.includes('missing or invalid authorization token');
  };
  const isTierOneAdmin = currentUser.role === 'Admin' && currentUser.adminTier === 1;
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = useState<'list' | 'add' | 'invite'>('list');
  const [error, setError] = useState('');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [resetPwState, setResetPwState] = useState<{ user: User; value: string } | null>(null);
  
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
  const [inviteRole, setInviteRole] = useState<UserRole>('Researcher');
  const [generatedCreds, setGeneratedCreds] = useState<{username: string, password: string} | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setUsers(await authService.getAllUsers());
    } catch (err: any) {
      if (isSessionError(err?.message)) return;
      setError(err.message || 'Failed to load users');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTierOneAdmin) {
      setError('Primary Admin access required.');
      return;
    }
    try {
      await authService.createUser({
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.role === 'Admin' ? false : true
      }, newUser.password);
      
      await loadUsers();
      setView('list');
      setNewUser({ username: '', fullName: '', email: '', role: 'Researcher', password: '' });
    } catch (err: any) {
      if (isSessionError(err?.message)) return;
      setError(err.message);
    }
  };

  const handleQuickInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isTierOneAdmin) {
      setError('Primary Admin access required.');
      return;
    }
    
    // Simple validation
    if (!inviteEmail.includes('@')) {
      setError(t.invalidEmail);
        return;
    }

    // Derive username from email (remove special chars)
    const username = inviteEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const password = generateSecurePassword();
    const fullName = inviteEmail.split('@')[0]; // Use part of email as name initially

    try {
        await authService.createUser({
            username,
            fullName,
            email: inviteEmail,
        role: inviteRole,
        isActive: inviteRole === 'Admin' ? false : true
        }, password);

        setGeneratedCreds({ username, password });
        await loadUsers();
        // Don't switch view yet, let them copy creds
    } catch (err: any) {
      if (isSessionError(err?.message)) return;
        setError(err.message);
    }
  };

  const generateSecurePassword = (): string => {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  };

  const toggleStatus = async (user: User) => {
    if (!isTierOneAdmin) { setError('Primary Admin access required.'); return; }
    setError('');
    try {
      await authService.updateUser(user.id, { isActive: !user.isActive });
      await loadUsers();
    } catch (err: any) {
      if (isSessionError(err?.message)) return;
      setError(err.message);
    }
  };

  const confirmDelete = async (id: string) => {
    setError('');
    try {
      await authService.deleteUser(id);
      await loadUsers();
    } catch (err: any) {
      if (isSessionError(err?.message)) return;
      setError(err.message);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const submitResetPassword = async () => {
    if (!resetPwState) return;
    const { user, value } = resetPwState;
    const tempPassword = value.trim();
    if (tempPassword.length < 8) { setError(t.resetPrompt); return; }
    setError('');
    try {
      setProcessingUserId(user.id);
      await authService.resetUserPassword(user.id, tempPassword);
      setResetPwState(null);
      setError('');
    } catch (err: any) {
      if (isSessionError(err?.message)) return;
      setError(err.message);
    } finally {
      setProcessingUserId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
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
                <Shield className="mr-2 h-5 w-5 text-indigo-600"/> {t.title}
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
              {view === 'list' && (
                <>
                  <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                    <p className="text-sm text-gray-500 self-center">{t.subtitle}</p>
                    <div className="flex space-x-2">
                         <Button variant="secondary" icon={<Mail size={16}/>} disabled={!isTierOneAdmin} onClick={() => { setView('invite'); setGeneratedCreds(null); setInviteEmail(''); setError(''); }}>
                         {t.quickInvite}
                         </Button>
                         <Button variant="primary" icon={<UserPlus size={16}/>} disabled={!isTierOneAdmin} onClick={() => { setView('add'); setError(''); }}>
                         {t.manualAdd}
                         </Button>
                    </div>
                  </div>

                  {!isTierOneAdmin && <div className="text-amber-700 text-sm mb-3">Primary Admin access required for account actions.</div>}

                  <div className="border rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.user}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.role}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.status}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.assignedAdmin}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.lastLogin}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t.actions}</th>
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
                                {u.role === 'Admin'
                                  ? (u.adminTier === 1 ? t.tierOneAdmin : t.tierTwoAdmin)
                                  : (u.role === 'Researcher' ? t.researcher : t.visitor)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                               {u.isActive ? (
                                 <span className="flex items-center text-xs text-green-600"><CheckCircle size={12} className="mr-1"/> {t.active}</span>
                               ) : (
                                 <span className="flex items-center text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-1 rounded-full"><Clock size={12} className="mr-1"/> {t.pendingApproval}</span>
                               )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                              {u.role === 'Researcher' ? (u.assignedAdminUsername || '-') : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                              {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : t.never}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                              {confirmDeleteId === u.id ? (
                                <span className="inline-flex items-center space-x-2">
                                  <span className="text-xs text-gray-600 mr-1">{t.deleteConfirm}</span>
                                  <button onClick={() => confirmDelete(u.id)} className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded" aria-label="Confirm delete">Yes</button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-300" aria-label="Cancel delete">No</button>
                                </span>
                              ) : resetPwState?.user.id === u.id ? (
                                <span className="inline-flex items-center space-x-2">
                                  <input
                                    type="text"
                                    className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="New password"
                                    value={resetPwState.value}
                                    onChange={e => setResetPwState({ ...resetPwState, value: e.target.value })}
                                    autoFocus
                                  />
                                  <button onClick={submitResetPassword} className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded" aria-label="Confirm reset password">Set</button>
                                  <button onClick={() => setResetPwState(null)} className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-300" aria-label="Cancel password reset">✕</button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-2">
                                  <button
                                    onClick={() => toggleStatus(u)}
                                    disabled={processingUserId === u.id || !isTierOneAdmin}
                                    className={`${u.isActive ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800 font-bold'}`}
                                    aria-label={u.isActive ? `${t.deactivateUser}: ${u.username}` : `${t.approveUser}: ${u.username}`}
                                    title={u.isActive ? t.deactivateUser : t.approveUser}
                                  >
                                    {u.isActive ? <UserX size={16}/> : <CheckCircle size={18}/>}
                                  </button>
                                  <button
                                    onClick={() => setResetPwState({ user: u, value: generateSecurePassword() })}
                                    disabled={processingUserId === u.id || !isTierOneAdmin}
                                    className="text-indigo-500 hover:text-indigo-700"
                                    aria-label={`${t.resetPassword}: ${u.username}`}
                                    title={t.resetPassword}
                                  >
                                    <Key size={16}/>
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(u.id)}
                                    disabled={processingUserId === u.id || !isTierOneAdmin}
                                    className="text-gray-400 hover:text-red-600"
                                    aria-label={`${t.delete}: ${u.username}`}
                                    title={t.delete}
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
                   <h4 className="text-lg font-medium text-gray-900 mb-4">{t.createManual}</h4>
                   <p className="text-sm text-gray-500 mb-4">{newUser.role === 'Admin' ? t.createTierTwoHint : t.createManualHint}</p>
                   {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
                   <form onSubmit={handleCreateUser} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t.accountType}</label>
                        <select className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
                            <option value="Researcher">{t.researcher}</option>
                            <option value="Admin">{t.tierTwoAdmin}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t.fullName}</label>
                        <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t.emailAddress}</label>
                        <input type="email" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t.username}</label>
                        <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{t.tempPassword}</label>
                        <input type="password" required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                      </div>
                      <div className="flex justify-end space-x-3 pt-4">
                           <Button type="button" variant="secondary" onClick={() => setView('list')}>{t.cancel}</Button>
                           <Button type="submit" variant="primary">{t.createUser}</Button>
                      </div>
                   </form>
                </div>
              )}

              {view === 'invite' && (
                  <div className="max-w-md mx-auto">
                        <h4 className="text-lg font-medium text-gray-900 mb-4">{t.inviteResearcher}</h4>
                    
                    {!generatedCreds ? (
                        <form onSubmit={handleQuickInvite} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{t.accountType}</label>
                                <select
                                  value={inviteRole}
                                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                >
                                  <option value="Researcher">{t.researcher}</option>
                                  <option value="Admin">{t.tierTwoAdmin}</option>
                                </select>
                            </div>
                            <p className="text-sm text-gray-500">
                              {inviteRole === 'Admin' ? t.inviteHintAdmin : t.inviteHintResearcher}
                            </p>
                            {error && <div className="text-red-600 text-sm">{error}</div>}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{t.researcherEmail}</label>
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
                              <Button type="button" variant="secondary" onClick={() => setView('list')}>{t.cancel}</Button>
                              <Button type="submit" variant="primary" icon={<Key size={16}/>}>{t.generateCreds}</Button>
                            </div>
                        </form>
                    ) : (
                        <div className="bg-green-50 border border-green-200 rounded-md p-4">
                            <div className="flex items-center mb-3">
                                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                              <h5 className="text-sm font-medium text-green-800">{t.accountCreated}</h5>
                            </div>
                            <p className="text-sm text-green-700 mb-4">
                              {t.copyHint}
                            </p>
                            
                            <div className="bg-white border border-gray-200 rounded p-3 space-y-3 mb-4">
                                <div>
                                  <label className="block text-xs text-gray-500 uppercase">{t.username}</label>
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono font-medium text-gray-800">{generatedCreds.username}</span>
                                        <button onClick={() => copyToClipboard(generatedCreds.username)} className="text-gray-400 hover:text-indigo-600" aria-label="Copy username"><Copy size={14}/></button>
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 pt-2">
                                  <label className="block text-xs text-gray-500 uppercase">{t.autoPassword}</label>
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono font-medium text-gray-800">{generatedCreds.password}</span>
                                        <button onClick={() => copyToClipboard(generatedCreds.password)} className="text-gray-400 hover:text-indigo-600" aria-label="Copy password"><Copy size={14}/></button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button type="button" variant="primary" onClick={() => { setView('list'); setGeneratedCreds(null); }}>{t.done}</Button>
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