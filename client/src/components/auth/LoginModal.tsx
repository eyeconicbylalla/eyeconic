import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppAuth } from '../../context/AppAuthContext';
import { appErrorMessage } from '../../lib/appClient';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Runs after a successful login (the auth context is already updated). */
  onSuccess?: () => void;
  onSwitchToSignup: () => void;
  /** Pre-fills the email field (e.g. after signing up). */
  defaultEmail?: string;
}

/**
 * Visitor/free-user login (the "Visitor account (GT Score Predictor)" flow).
 * Authenticates against the same App identity system Student Login and the
 * sign-up modal use, so every account works everywhere. Failures keep the
 * user on this form with a clear message — never a silent redirect.
 */
const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToSignup,
  defaultEmail = '',
}) => {
  const { login } = useAppAuth();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Never leave a typed password behind in component state.
  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(appErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#18222E] border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded-2xl p-8 w-full max-w-md relative text-white my-8">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#18B6A4] transition-colors text-2xl"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold text-white mb-1 text-center">Login to Eyeconic</h2>
        <p className="text-sm text-[#94A3B8] text-center mb-6">Use your Eyeconic account (free GT Score Predictor access)</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="email"
              className="w-full bg-[#151E29] border border-[#263445] text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div>
            <input
              type="password"
              className="w-full bg-[#151E29] border border-[#263445] text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          {error && <div className="dark-banner-error text-center text-sm" role="alert">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary w-full py-3 font-bold rounded-xl"
            disabled={loading}
          >
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
        <div className="text-center mt-6 text-sm text-[#94A3B8]">
          Don&apos;t have an account?{' '}
          <button
            onClick={onSwitchToSignup}
            className="text-[#18B6A4] font-semibold hover:text-[#1CC8B5] transition-colors"
            disabled={loading}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LoginModal;
