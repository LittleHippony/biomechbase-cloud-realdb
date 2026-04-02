
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import { Button } from './Button';
import { X, User as UserIcon, Lock, LogIn, AlertCircle, UserPlus, ArrowLeft, CheckCircle } from 'lucide-react';

interface LoginModalProps {
  onLogin: (user: User) => void;
  onCancel: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onCancel }) => {
  const [view, setView] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);
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
    email: ''
  });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await authService.login(username.trim(), password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "Login failed");
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
        ...regData,
        role: 'Researcher' // Default role for registration
      });
      setSuccessMsg("Registration successful! Your account is pending Admin approval.");
      setView('login');
      setRegData({ username: '', password: '', fullName: '', email: '' });
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
                  <><LogIn className="mr-2 h-5 w-5 text-indigo-600"/> Sign In</>
                ) : (
                  <><UserPlus className="mr-2 h-5 w-5 text-indigo-600"/> Researcher Registration</>
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
                  <label className="block text-sm font-medium text-gray-700">Username</label>
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
                      placeholder="Username"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
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
                      placeholder="Password"
                    />
                  </div>
                </div>
                
                <div className="pt-2">
                  <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                    {loading ? 'Authenticating...' : 'Sign In'}
                  </Button>
                </div>
                
                <div className="text-center mt-4">
                  <button 
                    type="button" 
                    onClick={() => { setView('register'); setError(''); setSuccessMsg(''); }}
                    className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                  >
                    No account? Register as Researcher
                  </button>
                </div>
              </form>
            )}

            {/* REGISTER FORM */}
            {view === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={regData.fullName}
                    onChange={(e) => setRegData({...regData, fullName: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={regData.email}
                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    required
                    value={regData.username}
                    onChange={(e) => setRegData({...regData, username: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    required
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                    {loading ? 'Processing...' : 'Register'}
                  </Button>
                </div>

                <div className="text-center mt-4">
                  <button 
                    type="button" 
                    onClick={() => { setView('login'); setError(''); }}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center"
                  >
                    <ArrowLeft size={14} className="mr-1"/> Back to Sign In
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
