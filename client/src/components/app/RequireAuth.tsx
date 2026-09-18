import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAppAuth } from '../../context/AppAuthContext';

/** Route guard for the student area: loading → spinner, anonymous → home. */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAppAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin" />
      </div>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

export default RequireAuth;
