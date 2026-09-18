import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { appAuth, APP_SESSION_EXPIRED_EVENT } from '../lib/appClient';
import type { AppUser } from '../types/app';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AppAuthContextValue {
  user: AppUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AppAuthContext = createContext<AppAuthContextValue | undefined>(undefined);

export const AppAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const refresh = useCallback(async () => {
    try {
      const data = await appAuth.session();
      if (data.user) {
        setUser(data.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => {
      setUser(null);
      setStatus('anonymous');
    };
    window.addEventListener(APP_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(APP_SESSION_EXPIRED_EVENT, onExpired);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const loggedIn = await appAuth.login(email, password);
    setUser(loggedIn);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await appAuth.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, refresh }),
    [user, status, login, logout, refresh]
  );

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
};

export function useAppAuth(): AppAuthContextValue {
  const context = useContext(AppAuthContext);
  if (!context) throw new Error('useAppAuth must be used inside AppAuthProvider');
  return context;
}
