import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignupSuccess: (token: string) => void;
  onSwitchToLogin: () => void;
}

const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onSignupSuccess, onSwitchToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!name || !email || !phone || !password) {
      setError('All fields are required');
      setLoading(false);
      return;
    }
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/signup`, { name, email, phone, password });
      localStorage.setItem('token', res.data.token); // Save token
      onSignupSuccess(res.data.token);
      onClose();
      window.location.href = '/dashboard'; // Redirect to dashboard
    } catch (err) {
      setError('Signup failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-teal-600">&times;</button>
        <h2 className="text-2xl font-bold text-teal-700 mb-6 text-center">Sign Up for Eyeconic</h2>
        <form onSubmit={handleSignup} className="space-y-4">
          <input
            type="text"
            className="w-full border border-teal-200 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500 bg-transparent text-black"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoComplete="off"
          />
          <input
            type="email"
            className="w-full border border-teal-200 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500 bg-transparent text-black"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="off"
          />
          <input
            type="text"
            className="w-full border border-teal-200 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500 bg-transparent text-black"
            placeholder="Phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            autoComplete="off"
          />
          <input
            type="password"
            className="w-full border border-teal-200 rounded-lg px-4 py-2 focus:outline-none focus:border-teal-500 bg-transparent text-black"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="off"
          />
          {error && <div className="text-red-600 text-sm text-center">{error}</div>}
          <button
            type="submit"
            className="w-full bg-teal-600 text-white font-semibold rounded-lg py-2 hover:bg-teal-700 transition-colors"
            disabled={loading}
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <div className="text-center mt-4 text-sm text-black">
          Already have an account?{' '}
          <button onClick={onSwitchToLogin} className="text-teal-700 font-semibold hover:underline">Login</button>
        </div>
      </div>
    </div>
  );
};

export default SignupModal;
