import React, { useState } from 'react';
import { LogIn, Target } from 'lucide-react';
import StudentLoginModal from '../../components/auth/StudentLoginModal';

/**
 * P3 — anonymous visitors opening /predictor (e.g. via a shared link) used to
 * be silently redirected to the homepage. This gate explains what they're
 * looking at and offers App sign-in right here; after a successful login the
 * auth context flips and the predictor renders in place (no navigation away).
 */
const SignInGate: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="ec-predictor py-16 md:py-24 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-4 max-w-md">
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-8 text-center" data-anim="fade-up">
          <Target size={30} className="text-[#4DD7C8] mx-auto mb-4" />
          <h2 className="text-xl md:text-2xl font-bold text-[#F8FAFC] mb-2">
            Rank &amp; Branch Predictor
          </h2>
          <p className="text-sm text-[#94A3B8] mb-6">
            See where your Grand Test performance could land you in NEET PG or INI-CET — as an
            honest range, not a promise. Sign in with your Eyeconic Mentorship account to use it.
          </p>
          <button type="button" onClick={() => setOpen(true)} className="btn btn-primary w-full py-3">
            <LogIn size={16} className="mr-2" /> Sign in to predict
          </button>
          <p className="text-[11px] text-[#94A3B8] mt-4">
            Same account as your Eyeconic mobile app. Your predictions stay private to your account.
          </p>
        </div>
        <StudentLoginModal isOpen={open} onClose={() => setOpen(false)} />
      </div>
    </section>
  );
};

export default SignInGate;
