import React, { useEffect, useState } from 'react';
import { User, UserRole } from '../types';
import { authService } from '../services/authService';
import { Button } from './Button';
import { X, User as UserIcon, Lock, LogIn, AlertCircle, UserPlus, ArrowLeft, CheckCircle } from 'lucide-react';

interface LoginModalProps {
  onLogin: (user: User) => void;
  onCancel: () => void;
  language?: 'en' | 'zh';
}

const LOGIN_TEXT = {
  en: {
    signIn: 'Sign In',
    registration: 'Create Account',
    loginFailed: 'Login failed',
    researcherRegistrationSuccess: 'Researcher request submitted. Your account is pending admin approval.',
    adminRegistrationSuccess: 'Admin request submitted. Your account is pending Primary Admin approval.',
    registrationFailed: 'Registration failed',
    username: 'Username',
    password: 'Password',
    fullName: 'Full Name',
    email: 'Email',
    selectAdmin: 'Select Admin',
    accountType: 'Account Type',
    registerAsResearcher: 'Researcher',
    registerAsAdmin: 'Admin',
    primaryAdmin: 'Primary Admin',
    admin: 'Admin',
    chooseAdmin: 'Choose an Admin account',
    loadingAdmins: 'Loading admins...',
    noAdmins: 'No active admin accounts found.',
    authenticating: 'Authenticating...',
    processing: 'Processing...',
    register: 'Register as Researcher',
    noAccount: 'No account? Register as Researcher',
    backToSignIn: 'Back to Sign In'
  },
  zh: {
    signIn: '登录',
    registration: '创建账户',
    loginFailed: '登录失败',
    researcherRegistrationSuccess: '研究者申请已提交，等待管理员审批。',
    adminRegistrationSuccess: '管理员申请已提交，等待主管理员审批。',
    registrationFailed: '注册失败',
    username: '用户名',
    password: '密码',
    fullName: '姓名',
    email: '邮箱',
    selectAdmin: '选择管理员',
    accountType: '账户类型',
    registerAsResearcher: '研究者',
    registerAsAdmin: '管理员',
    primaryAdmin: '主管理员',
    admin: '管理员',
    chooseAdmin: '请选择管理员账户',
    loadingAdmins: '正在加载管理员列表...',
    noAdmins: '暂无可用管理员账户。',
    authenticating: '登录中...',
    processing: '处理中...',
    register: '注册为研究者',
    noAccount: '没有账号？注册为研究者',
    backToSignIn: '返回登录'
  }
};

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onCancel, language = 'en' }) => {
  const t = LOGIN_TEXT[language];
  const [view, setView] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register State
  const [regData, setRegData] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    role: 'Researcher' as UserRole,
    requestedAdminId: ''
  });
  const [adminOptions, setAdminOptions] = useState<Array<{ id: string; username: string; fullName: string }>>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);

  useEffect(() => {
    if (view !== 'register') return;
    let mounted = true;

    const loadAdmins = async () => {
      setAdminsLoading(true);
      try {
        const admins = await authService.getPublicAdmins();
        if (mounted) {
          setAdminOptions(admins);
          if (!regData.requestedAdminId && admins.length > 0) {
            setRegData((prev) => ({ ...prev, requestedAdminId: admins[0].id }));
          }
        }
      } catch {
        if (mounted) setAdminOptions([]);
      } finally {
        if (mounted) setAdminsLoading(false);
      }
    };

    loadAdmins();
    return () => {
      mounted = false;
    };
  }, [view]);

  useEffect(() => {
    if (view !== 'register' || adminOptions.length === 0) return;
    const filtered = adminOptions.filter((admin) => regData.role === 'Admin' ? admin.adminTier === 1 : true);
    if (filtered.length === 0) {
      setRegData((prev) => ({ ...prev, requestedAdminId: '' }));
      return;
    }
    if (!filtered.some((admin) => admin.id === regData.requestedAdminId)) {
      setRegData((prev) => ({ ...prev, requestedAdminId: filtered[0].id }));
    }
  }, [regData.role, adminOptions, view]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await authService.login(username.trim(), password.trim());
      onLogin(user);
    } catch (err: any) {
      setError(err.message || t.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      await authService.register({
        username: regData.username,
        password: regData.password,
        fullName: regData.fullName,
        email: regData.email,
        role: regData.role,
        requestedAdminId: regData.requestedAdminId
      });
      setSuccessMsg(regData.role === 'Admin' ? t.adminRegistrationSuccess : t.researcherRegistrationSuccess);
      setView('login');
      setRegData({ username: '', password: '', fullName: '', email: '', role: 'Researcher', requestedAdminId: '' });
    } catch (err: any) {
      setError(err.message || t.registrationFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCancel}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-middle bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:max-w-md sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                {view === 'login' ? (
                  <><LogIn className="mr-2 h-5 w-5 text-indigo-600"/> {t.signIn}</>
                ) : (
                  <><UserPlus className="mr-2 h-5 w-5 text-indigo-600"/> {t.registration}</>
                )}
              </h3>
              <button onClick={onCancel} className="text-gray-400 hover:text-gray-500">
                <X size={24} />
              </button>
            </div>
            
            {/* Messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex items-center mb-4">
                <AlertCircle className="h-4 w-4 mr-2" /> {error}
              </div>
            )}
            {successMsg && (
               <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm flex items-center mb-4">
                <CheckCircle className="h-4 w-4 mr-2" /> {successMsg}
              </div>
            )}

            {/* LOGIN FORM */}
            {view === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.username}</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                      placeholder={t.username}
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.password}</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                      placeholder={t.password}
                    />
                  </div>
                </div>
                
                <div className="pt-2">
                  <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                    {loading ? t.authenticating : t.signIn}
                  </Button>
                </div>
                
                <div className="text-center mt-4">
                  <button 
                    type="button" 
                    onClick={() => { setView('register'); setError(''); setSuccessMsg(''); }}
                    className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                  >
                    {t.noAccount}
                  </button>
                </div>
              </form>
            )}

            {/* REGISTER FORM */}
            {view === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.fullName}</label>
                  <input
                    type="text"
                    required
                    value={regData.fullName}
                    onChange={(e) => setRegData({...regData, fullName: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.email}</label>
                  <input
                    type="email"
                    required
                    value={regData.email}
                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.username}</label>
                  <input
                    type="text"
                    required
                    value={regData.username}
                    onChange={(e) => setRegData({...regData, username: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.password}</label>
                  <input
                    type="password"
                    required
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.accountType}</label>
                  <select
                    value={regData.role}
                    onChange={(e) => setRegData({ ...regData, role: e.target.value as UserRole })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="Researcher">{t.registerAsResearcher}</option>
                    <option value="Admin">{t.registerAsAdmin}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.selectAdmin}</label>
                  {adminsLoading ? (
                    <div className="mt-1 text-sm text-gray-500">{t.loadingAdmins}</div>
                  ) : adminOptions.length === 0 ? (
                    <div className="mt-1 text-sm text-red-600">{t.noAdmins}</div>
                  ) : (
                    <select
                      required
                      value={regData.requestedAdminId}
                      onChange={(e) => setRegData({ ...regData, requestedAdminId: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">{t.chooseAdmin}</option>
                      {adminOptions
                        .filter((admin) => regData.role === 'Admin' ? admin.adminTier === 1 : true)
                        .map((admin) => (
                        <option key={admin.id} value={admin.id}>{admin.adminTier === 1 ? t.primaryAdmin : t.admin}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center"
                    disabled={loading || !regData.requestedAdminId}
                  >
                    {loading ? t.processing : t.register}
                  </Button>
                </div>

                <div className="text-center mt-4">
                  <button 
                    type="button" 
                    onClick={() => { setView('login'); setError(''); }}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center"
                  >
                    <ArrowLeft size={14} className="mr-1"/> {t.backToSignIn}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};