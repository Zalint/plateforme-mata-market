import { AuthMeResponseSchema, type UserRoleValue } from '@mata/shared/schemas';
import { type NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_PKCE,
  COOKIE_REFRESH,
  pkceCookieOptions,
  refreshCookieOptions,
} from '../../../../src/lib/auth/cookies';
import { exchangeCode } from '../../../../src/lib/auth/keycloak-client';
import { getEnv } from '../../../../src/lib/env';

/** Espace d'atterrissage par rôle après login (chacun arrive chez lui). */
const LANDING_BY_ROLE: Record<UserRoleValue, string> = {
  producer: '/producer/home',
  client_pro: '/client/catalog',
  client_particulier: '/client/catalog',
  admin: '/admin/dashboard',
  super_admin: '/admin/dashboard',
  teleconsultant: '/admin/teleconseil',
};

/**
 * Résout l'espace d'atterrissage via `/v1/auth/me` avec le token frais (le rôle
 * vient de la table `users`, pas du JWT). En cas d'échec on dégrade vers le
 * catalogue (lisible par tout JWT) — le login ne doit pas échouer dur si `/me`
 * est momentanément indisponible.
 */
async function resolveLanding(apiBaseUrl: string, accessToken: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(`${apiBaseUrl}/v1/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return '/client/catalog';
    const me = AuthMeResponseSchema.parse(await res.json());
    return LANDING_BY_ROLE[me.role];
  } catch {
    return '/client/catalog';
  }
}

/**
 * GET /api/auth/callback?code=XXX&state=YYY
 *
 * Échange le code d'autorisation contre des tokens Keycloak.
 *  - Vérifie le state (anti-CSRF) contre la valeur du cookie PKCE
 *  - Pose le refresh_token en cookie HttpOnly SameSite=Strict, path /api/auth
 *  - Redirige vers la home (le composant AuthProvider appellera /api/auth/refresh
 *    pour récupérer l'access token initial)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const pkceCookie = req.cookies.get(COOKIE_PKCE)?.value;

  if (!code || !state || !pkceCookie) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', req.url));
  }

  let parsed: { verifier: string; state: string };
  try {
    parsed = JSON.parse(pkceCookie) as { verifier: string; state: string };
  } catch {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_pkce', req.url));
  }

  if (parsed.state !== state) {
    return NextResponse.redirect(new URL('/auth/login?error=state_mismatch', req.url));
  }

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    tokens = await exchangeCode(
      {
        url: env.KEYCLOAK_URL,
        realm: env.KEYCLOAK_REALM,
        clientId: env.KEYCLOAK_CLIENT_ID,
      },
      { code, codeVerifier: parsed.verifier, redirectUri: env.KEYCLOAK_REDIRECT_URI },
    );
  } catch {
    return NextResponse.redirect(new URL('/auth/login?error=exchange_failed', req.url));
  }

  const landing = await resolveLanding(env.API_BASE_URL, tokens.access_token);
  const response = NextResponse.redirect(new URL(landing, req.url));
  response.cookies.set(
    COOKIE_REFRESH,
    tokens.refresh_token,
    refreshCookieOptions(tokens.refresh_expires_in),
  );
  // Purge le cookie PKCE (à usage unique)
  response.cookies.set(COOKIE_PKCE, '', { ...pkceCookieOptions(0), maxAge: 0 });
  return response;
}
