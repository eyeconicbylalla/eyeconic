import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAppAuth } from '../../context/AppAuthContext';

/**
 * Route guard for the student area: loading → spinner, anonymous → home.
 *
 * `intercept`: optional node rendered INSTEAD of the redirect when anonymous —
 * used by the predictor routes, where a silent bounce to the homepage would
 * strand a visitor who arrived via a shared link (they get a sign-in gate
 * with return-in-place instead).
 */
const RequireAuth: React.FC<{ children: React.ReactNode; intercept?: React.ReactNode }> = ({
  children,
  intercept,
}) => {
  const { status } = useAppAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin" />
      </div>
    );
  }
  if (status === 'anonymous') {
    return <>{intercept ?? <Navigate to="/" replace />}</>;
  }
  return <>{children}</>;
};

export default RequireAuth;
