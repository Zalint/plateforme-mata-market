import { type NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_PKCE,
  COOKIE_REFRESH,
  pkceCookieOptions,
  refreshCookieOptions,
} from '../../../../src/lib/auth/cookies';
import { exchangeCode } from '../../../../src/lib/auth/keycloak-client';
import { getEnv } from '../../../../src/lib/env';

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

  const response = NextResponse.redirect(new URL('/producer/home', req.url));
  response.cookies.set(
    COOKIE_REFRESH,
    tokens.refresh_token,
    refreshCookieOptions(tokens.refresh_expires_in),
  );
  // Purge le cookie PKCE (à usage unique)
  response.cookies.set(COOKIE_PKCE, '', { ...pkceCookieOptions(0), maxAge: 0 });
  return response;
}
