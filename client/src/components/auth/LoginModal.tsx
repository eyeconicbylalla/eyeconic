import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string) => void;
  onSwitchToSignup: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess, onSwitchToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
      localStorage.setItem('token', res.data.token); // Save token
      onLoginSuccess(res.data.token);
      onClose();
      window.location.href = '/dashboard'; // Redirect to dashboard
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.msg || 'Login failed');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-teal-600">&times;</button>
        <h2 className="text-2xl font-bold text-teal-700 mb-6 text-center">Login to Eyeconic</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            className="w-full border border-teal-200 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full border border-teal-200 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <div className="text-red-600 text-sm text-center">{error}</div>}
          <button
            type="submit"
            className="w-full bg-teal-600 text-white font-semibold rounded-lg py-2 hover:bg-teal-700 transition-colors"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <div className="text-center mt-4 text-sm">
          Don't have an account?{' '}
          <button onClick={onSwitchToSignup} className="text-teal-700 font-semibold hover:underline">Sign up</button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
