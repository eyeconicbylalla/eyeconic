import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';
import { appAuth, appErrorMessage } from '../../lib/appClient';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the signed-up email when the user clicks "Continue to Login". */
  onContinueToLogin: (email: string) => void;
  onSwitchToLogin: () => void;
}

/**
 * Free visitor sign-up (the "Visitor account (GT Score Predictor)" funnel).
 * Creates the account in the App identity system — the same one the login
 * modal authenticates against — so a freshly created account can log in
 * immediately. Sign-up deliberately does not sign the user in: on success
 * the form is replaced by a clear confirmation with a "Continue to Login"
 * action.
 */
const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onContinueToLogin, onSwitchToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [createdEmail, setCreatedEmail] = useState('');

  // Never leave a typed password behind in component state.
  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Name is required';
    if (!email.trim()) errors.email = 'Email is required';
    if (!phone.trim()) errors.phone = 'Phone is required';
    if (!password) errors.password = 'Password is required';
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await appAuth.signup(name.trim(), email.trim(), phone.trim(), password);
      setCreatedEmail(email.trim().toLowerCase());
    } catch (err) {
      setError(appErrorMessage(err, 'Something went wrong while creating your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setError('');
    setFieldErrors({});
    setCreatedEmail('');
  };

  if (!isOpen) return null;

  const inputClass = (field: string) =>
    `w-full bg-[#151E29] border ${fieldErrors[field] ? 'border-red-500/60' : 'border-[#263445]'} text-[#F8FAFC] placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)] rounded-xl px-4 py-3 focus:outline-none transition-all duration-200`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#18222E] border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded-2xl p-8 w-full max-w-md relative text-white my-8">
        <button
          onClick={() => { onClose(); resetForm(); }}
          aria-label="Close"
          className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#18B6A4] transition-colors text-2xl"
        >
          &times;
        </button>

        {createdEmail ? (
          <div className="text-center" data-testid="signup-success">
            <CheckCircle2 size={44} className="text-[#18B6A4] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Account created successfully!</h2>
            <p className="text-sm text-[#94A3B8] mb-1">
              Your Eyeconic account has been created.
            </p>
            <p className="text-sm text-[#94A3B8] mb-6">
              You can now log in using your email (<span className="text-[#F8FAFC]">{createdEmail}</span>) and password.
            </p>
            <button
              type="button"
              className="btn btn-primary w-full py-3 font-bold rounded-xl"
              onClick={() => {
                const nextEmail = createdEmail;
                resetForm();
                onContinueToLogin(nextEmail);
              }}
            >
              Continue to Login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-1 text-center">Sign Up for Eyeconic</h2>
            <p className="text-sm text-[#94A3B8] text-center mb-6">Free access to the GT Score Predictor</p>
            <form onSubmit={handleSignup} className="space-y-4" noValidate>
              <div>
                <input
                  type="text"
                  className={inputClass('name')}
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  disabled={loading}
                />
                {fieldErrors.name && <p className="text-xs text-red-400 mt-1 ml-1">{fieldErrors.name}</p>}
              </div>
              <div>
                <input
                  type="email"
                  className={inputClass('email')}
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
                {fieldErrors.email && <p className="text-xs text-red-400 mt-1 ml-1">{fieldErrors.email}</p>}
              </div>
              <div>
                <input
                  type="tel"
                  className={inputClass('phone')}
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  disabled={loading}
                />
                {fieldErrors.phone && <p className="text-xs text-red-400 mt-1 ml-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <input
                  type="password"
                  className={inputClass('password')}
                  placeholder="Password (6+ characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                />
                {fieldErrors.password && <p className="text-xs text-red-400 mt-1 ml-1">{fieldErrors.password}</p>}
              </div>
              {error && <div className="dark-banner-error text-center text-sm" role="alert">{error}</div>}
              <button
                type="submit"
                className="btn btn-primary w-full py-3 font-bold rounded-xl"
                disabled={loading}
              >
                {loading ? 'Creating account…' : 'Sign Up'}
              </button>
            </form>
            <div className="text-center mt-6 text-sm text-[#94A3B8]">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-[#18B6A4] font-semibold hover:text-[#1CC8B5] transition-colors"
                disabled={loading}
              >
                Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SignupModal;
