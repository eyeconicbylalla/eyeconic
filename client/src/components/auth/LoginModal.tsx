import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#18222E] border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded-2xl p-8 w-full max-w-md relative text-white">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#18B6A4] transition-colors text-2xl">&times;</button>
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Login to Eyeconic</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="email"
              className="w-full bg-[#151E29] border border-[#263445] text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <input
              type="password"
              className="w-full bg-[#151E29] border border-[#263445] text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="dark-banner-error text-center text-sm">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary w-full py-3 font-bold rounded-xl"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <div className="text-center mt-6 text-sm text-[#94A3B8]">
          Don't have an account?{' '}
          <button onClick={onSwitchToSignup} className="text-[#18B6A4] font-semibold hover:text-[#1CC8B5] transition-colors">Sign up</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LoginModal;
