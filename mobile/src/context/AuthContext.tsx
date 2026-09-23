import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import * as authApi from '../api/auth';
import type { PublicUser } from '../api/types';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  loggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await authApi.fetchSession();
      // The server's /api/session always responds 200 with user:null for a
      // real "not signed in" - it never errors for that. So the catch
      // below only ever means "couldn't reach the server this time," not
      // "definitely signed out," and must never clear an existing user.
      setUser(data.user);
    } catch {
      // Deliberately does nothing to `user`. This runs on every app
      // foreground (see the AppState effect below), not just cold start -
      // WebBrowser.openBrowserAsync (meeting links, checkout, etc.)
      // backgrounds the app the same way, and a single transient network
      // blip right as it returns used to silently sign someone out with no
      // error at all. Leaving `user` as it was preserves an already-
      // established session through a blip; it still starts genuinely
      // logged-out on a real cold start, since `user` defaults to null.
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Session state only otherwise loads once, at cold start - an admin
  // approval, role change, or any other server-side account update made
  // while the app sits backgrounded would silently never reach it until the
  // user fully force-quit and relaunched (most people just switch away and
  // back, which suspends JS but never re-runs mount effects). Refetching on
  // every foreground resume closes that gap without needing a hard restart.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setUser(data.user);
  }, []);

  // "Everything stops" the instant sign-out is confirmed, rather than the
  // screen staying interactive for however long the network call to /api/
  // logout takes - loggingOut drives a full-screen blocking overlay
  // (App.tsx's Root) so there's no window where a stale, about-to-be-
  // signed-out screen can still be tapped.
  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setLoggingOut(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, loggingOut, login, logout, refresh }),
    [user, loading, loggingOut, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
