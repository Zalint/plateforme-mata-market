/**
 * Helpers cookies pour le flow auth.
 *
 * Tous les cookies sont HttpOnly + Secure (en prod) + SameSite=Strict, sauf
 * `mata_pkce_state` qui est SameSite=Lax car il doit survivre à la redirection
 * cross-site vers Keycloak puis retour.
 *
 * Référence : ARCHITECTURE.md §9 « Stockage tokens (PWA) ».
 */

export const COOKIE_REFRESH = 'mata_refresh';
export const COOKIE_PKCE = 'mata_pkce';

export type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge?: number;
};

export function refreshCookieOptions(maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    // path '/' (et non '/api/auth') pour que le middleware Next puisse
    // détecter la présence du cookie sur les routes protégées /producer/*,
    // /admin/*, /client/* et décider de rediriger ou non vers /auth/login.
    // Le cookie reste HttpOnly + SameSite=Strict — JS ne peut pas le voir,
    // et les CSRF cross-site sont impossibles.
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function pkceCookieOptions(maxAgeSeconds = 300): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // survit à la redirection cross-site Keycloak
    path: '/api/auth',
    maxAge: maxAgeSeconds,
  };
}
