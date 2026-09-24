import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import StudentLoginModal from '../auth/StudentLoginModal';
import { useAppAuth } from '../../context/AppAuthContext';

/**
 * Guard for the Free Users tab inside the Admin Portal (Feature 08).
 *
 * The Admin Portal login gates the whole console; this guard additionally
 * requires an App session carrying the mentor/admin role, because that is
 * exactly what /api/mentor-dashboard/* authorizes server-side (session +
 * role, re-checked upstream against the live database role). A portal admin
 * without such a session is invited to sign in here in place; a signed-in
 * student sees a 403 notice and no data — the API would reject them anyway.
 */
const RequireMentor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user, refresh } = useAppAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  if (status === 'loading') {
    return (
      <div className="py-14 flex items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'mentor' && user.role !== 'admin')) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-8 text-center max-w-xl mx-auto">
        <ShieldAlert size={36} className="mx-auto text-orange-400 mb-4" />
        <h3 className="text-xl font-bold text-[#F8FAFC] mb-2">Mentor access required</h3>
        {user ? (
          <p className="text-sm text-[#94A3B8]">
            Signed in as <span className="text-[#CBD5E1]">{user.name}</span> — this account does not
            carry the mentor/admin role, so free-user analytics stay locked. The server rejects its
            requests regardless of this page.
          </p>
        ) : (
          <>
            <p className="text-sm text-[#94A3B8] mb-6">
              Free-user analytics are available to Eyeconic mentors and admins. Sign in with your
              mentor account to unlock this tab.
            </p>
            <button
              onClick={() => setLoginOpen(true)}
              className="btn btn-primary text-sm px-4 py-2"
            >
              Sign in as Mentor
            </button>
          </>
        )}
        <StudentLoginModal
          isOpen={loginOpen}
          onClose={() => setLoginOpen(false)}
          onSuccess={() => {
            setLoginOpen(false);
            refresh();
          }}
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireMentor;
