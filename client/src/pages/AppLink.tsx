import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { appAuth, appErrorMessage } from '../lib/appClient';
import { useAppAuth } from '../context/AppAuthContext';

type Phase = 'working' | 'done' | 'error';

/**
 * App → Website handoff landing (/app-link?code=...&dest=...).
 *
 * The code is a short-lived, single-use value minted by the app for the
 * signed-in user — it carries no credentials. We exchange it server-side
 * (HttpOnly session set by our server) and continue to `dest`, which is
 * validated to be a website-relative path before we navigate.
 */
const AppLink: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAppAuth();
  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = (params.get('code') || '').trim();
    const dest = (params.get('dest') || '').trim();

    const safeDest =
      dest.startsWith('/') && !dest.startsWith('//') && dest.length <= 200 ? dest : '/dashboard';

    if (!code) {
      setPhase('error');
      setMessage('This link is incomplete. Please reopen the website from the Eyeconic app.');
      return;
    }

    (async () => {
      try {
        await appAuth.handoff(code, safeDest);
        await refresh();
        setPhase('done');
        // Clean the code out of the address bar, then continue.
        window.history.replaceState(null, '', safeDest);
        navigate(safeDest, { replace: true });
      } catch (err) {
        setPhase('error');
        setMessage(
          appErrorMessage(err, 'This link is invalid or has expired. Please reopen the website from the Eyeconic app.')
        );
      }
    })();
  }, [params, navigate, refresh]);

  return (
    <section className="min-h-[70vh] bg-[#0A0F14] flex items-center justify-center py-12">
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl shadow-card-dark p-8 max-w-md w-full text-center mx-4">
        {phase === 'working' && (
          <>
            <Loader2 className="w-10 h-10 text-[#18B6A4] animate-spin mx-auto mb-4" />
            <p className="text-[#CBD5E1]">Signing you in to the Eyeconic website…</p>
          </>
        )}
        {phase === 'done' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
            <p className="text-[#CBD5E1]">You&apos;re signed in. Taking you to your dashboard…</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <p className="text-[#CBD5E1] mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
              <Link to="/" className="btn btn-outline">Back to Home</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default AppLink;
