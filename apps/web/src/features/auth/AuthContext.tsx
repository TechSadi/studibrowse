import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, PublicUser } from '@studibrowse/shared';
import { authApi, refreshSession, setAccessToken, setSessionEndedHandler } from '../../lib/api';

type AuthState =
  | { status: 'loading'; user: null }
  /** `loggedOut` is true after the user chose to log out (vs. never signed in or the session expiring). */
  | { status: 'signedOut'; user: null; loggedOut?: boolean }
  | { status: 'signedIn'; user: PublicUser };

interface AuthContextValue {
  state: AuthState;
  signIn: (session: AuthResponse) => void;
  /** Replaces the signed-in user with a fresh copy from the API (after a profile update or a follow). */
  setUser: (user: PublicUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT = { status: 'signedOut', user: null } as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  // Restore the session from the refresh cookie on load. refreshSession() is single-flight, so StrictMode's
  // double effect shares one request instead of tripping the server's refresh-token reuse detection.
  useEffect(() => {
    let active = true;
    refreshSession().then(
      (session) => active && setState({ status: 'signedIn', user: session.user }),
      () => active && setState(SIGNED_OUT),
    );
    setSessionEndedHandler(() => setState(SIGNED_OUT));
    return () => {
      active = false;
      setSessionEndedHandler(null);
    };
  }, []);

  const signIn = useCallback((session: AuthResponse) => {
    setAccessToken(session.accessToken);
    setState({ status: 'signedIn', user: session.user });
  }, []);

  const setUser = useCallback((user: PublicUser) => {
    setState((current) => (current.status === 'signedIn' ? { status: 'signedIn', user } : current));
  }, []);

  const logout = useCallback(async () => {
    // Logging out locally must work even if the request fails (offline); the server answers 204 regardless.
    await authApi.logout().catch(() => undefined);
    setAccessToken(null);
    queryClient.clear();
    setState({ ...SIGNED_OUT, loggedOut: true });
  }, [queryClient]);

  const value = useMemo(() => ({ state, signIn, setUser, logout }), [state, signIn, setUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
