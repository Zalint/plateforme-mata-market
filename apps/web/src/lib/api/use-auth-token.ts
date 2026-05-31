'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-provider';

/**
 * Récupère l'access token courant (null si non authentifié ou en cours de
 * refresh). Helper utilisé par tous les hooks API pour ne pas répéter le
 * narrowing à chaque hook.
 *
 * Pattern hybride :
 *   1. Lit en priorité le state de l'AuthProvider (path nominal).
 *   2. Fallback : si `auth.status` ne passe pas à `authenticated` rapidement
 *      (cas observé en dev avec Next 15 / React 19 Strict Mode où le useEffect
 *      initial de l'AuthProvider ne tourne pas systématiquement), fetch
 *      directement `/api/auth/refresh` et garde le token local au hook.
 *
 * Ce fallback est sûr car `/api/auth/refresh` retourne 401 si pas de cookie
 * refresh — donc tant qu'on n'est pas authentifié réellement côté Keycloak,
 * `localToken` reste `null` et les hooks `useQuery` restent disabled.
 */
export function useAuthToken(): string | null {
  const auth = useAuth();
  const [localToken, setLocalToken] = useState<string | null>(null);

  // Bootstrap fallback : si AuthProvider n'a pas obtenu de token après 1s,
  // on tente le refresh nous-mêmes.
  useEffect(() => {
    if (auth.status === 'authenticated') return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          });
          if (!res.ok) return;
          const data = (await res.json()) as { access_token: string; expires_in: number };
          setLocalToken(data.access_token);
        } catch {
          // ignore — l'AuthProvider gérera l'état "anonymous" et le middleware
          // redirigera vers /auth/login le cas échéant.
        }
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [auth.status]);

  if (auth.status === 'authenticated') return auth.accessToken;
  return localToken;
}
