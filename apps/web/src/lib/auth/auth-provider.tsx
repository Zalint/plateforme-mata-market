'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * AuthProvider · gère l'access token Keycloak EN MÉMOIRE uniquement.
 *
 * Le refresh token vit dans un cookie HttpOnly (path /api/auth) que le
 * navigateur ne voit jamais en JS. On appelle POST /api/auth/refresh pour
 * obtenir un access token, et on planifie un re-refresh ~60s avant
 * l'expiration.
 *
 * Référence : ARCHITECTURE.md §9 « Stockage tokens (PWA) ».
 */

type AuthState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'authenticated'; accessToken: string; expiresAt: number }
  | { status: 'anonymous' };

type AuthContextValue = AuthState & {
  refresh(): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [state, setState] = useState<AuthState>({ status: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setState((prev) => (prev.status === 'authenticated' ? prev : { status: 'loading' }));
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        setState({ status: 'anonymous' });
        return;
      }
      const data = (await res.json()) as { access_token: string; expires_in: number };
      const expiresAt = Date.now() + data.expires_in * 1000;
      setState({ status: 'authenticated', accessToken: data.access_token, expiresAt });
    } catch {
      setState({ status: 'anonymous' });
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(
      () => undefined,
    );
    setState({ status: 'anonymous' });
  }, []);

  // Premier refresh au mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-refresh ~60s avant l'expiration
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const delay = Math.max(state.expiresAt - Date.now() - 60_000, 5_000);
    timerRef.current = setTimeout(() => {
      void refresh();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refresh, logout }),
    [state, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used within <AuthProvider>');
  }
  return ctx;
}
