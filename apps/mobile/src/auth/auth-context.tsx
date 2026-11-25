// The signed-in session (Phase 146 Theme E6): restored from the keychain on launch, replaced on sign-in, dropped on
// sign-out or when any call comes back `kind: 'auth'`. The token lives in a ref the data source reads per request, so a
// token swap never rebuilds the source and never enters React state that a query key could capture.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearSession, loadSession, saveSession } from './token-store';

export const SESSION_ENDED_NOTICE = 'Your GitHub session ended — sign in again.';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'signed-in'; login: string };

export interface AuthApi {
  state: AuthState;
  signIn(login: string, token: string): Promise<void>;
  /** Clears the keychain and returns to sign-in, optionally with a notice line. */
  signOut(notice?: string | null): Promise<void>;
  /** The current token, for the data source only. */
  getToken(): string | null;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadSession().then((session) => {
      if (!live) return;
      tokenRef.current = session?.token ?? null;
      setState(session ? { status: 'signed-in', login: session.login } : { status: 'signed-out', notice: null });
    });
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback(async (login: string, token: string) => {
    await saveSession(login, token);
    tokenRef.current = token;
    setState({ status: 'signed-in', login });
  }, []);

  const signOut = useCallback(async (notice: string | null = null) => {
    tokenRef.current = null;
    setState({ status: 'signed-out', notice });
    await clearSession();
  }, []);

  const getToken = useCallback(() => tokenRef.current, []);
  const api = useMemo<AuthApi>(() => ({ state, signIn, signOut, getToken }), [state, signIn, signOut, getToken]);
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const api = useContext(AuthContext);
  if (!api) throw new Error('useAuth must be used inside <AuthProvider>');
  return api;
}
