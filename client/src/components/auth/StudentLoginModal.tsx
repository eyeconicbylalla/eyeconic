import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { appErrorMessage } from '../../lib/appClient';
import { useAppAuth } from '../../context/AppAuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSwitchToLegacy?: () => void;
}

/**
 * Login for Eyeconic Mentorship students — the same account they use in the
 * mobile app. Authenticates against the App backend through the website
 * server's encrypted HttpOnly session (no token in JS or URLs).
 */
const StudentLoginModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, onSwitchToLegacy }) => {
  const { login } = useAppAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#18222E] border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded-2xl p-8 w-full max-w-md relative text-white">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#18B6A4] transition-colors text-2xl">&times;</button>
        <h2 className="text-2xl font-bold text-white mb-1 text-center">Student Login</h2>
        <p className="text-sm text-[#94A3B8] text-center mb-6">Use your Eyeconic Mentorship app account</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            className="w-full bg-[#151E29] border border-[#263445] text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            className="w-full bg-[#151E29] border border-[#263445] text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <div className="dark-banner-error text-center text-sm">{error}</div>}
          <button type="submit" className="btn btn-primary w-full py-3 font-bold rounded-xl" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="text-center mt-5 text-xs text-[#94A3B8]">
          Don&apos;t have an account? Ask your mentor to add you to Eyeconic.
        </p>
        {onSwitchToLegacy && (
          <p className="text-center mt-2 text-xs text-[#94A3B8]">
            <button onClick={onSwitchToLegacy} className="text-[#18B6A4] hover:text-[#1CC8B5] underline">
              Visitor account (GT Score Predictor)
            </button>
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};

export default StudentLoginModal;
