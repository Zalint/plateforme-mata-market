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
  client_pro: '/client/home',
  client_particulier: '/client/home',
  admin: '/admin/dashboard',
  super_admin: '/admin/dashboard',
  // Le téléconseiller a un menu restreint (créer producteur / offres / commandes).
  // On l'atterrit sur les commandes (vue d'activité), pas sur /admin/teleconseil
  // qui n'est plus dans son périmètre.
  teleconsultant: '/admin/orders',
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
  // Origine PUBLIQUE de l'app. On NE PEUT PAS se fier à `req.url` : derrière le
  // reverse-proxy (Caddy), Next dev voit l'hôte interne du conteneur
  // (localhost:3000) → la redirection post-login partirait vers localhost.
  // L'URL de callback Keycloak est configurée avec le domaine public, donc son
  // origine = l'origine publique de l'app (https://app.<domaine>, ou
  // http://localhost:3000 en dev local — comportement inchangé).
  const appOrigin = new URL(env.KEYCLOAK_REDIRECT_URI).origin;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const pkceCookie = req.cookies.get(COOKIE_PKCE)?.value;

  if (!code || !state || !pkceCookie) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', appOrigin));
  }

  let parsed: { verifier: string; state: string };
  try {
    parsed = JSON.parse(pkceCookie) as { verifier: string; state: string };
  } catch {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_pkce', appOrigin));
  }

  if (parsed.state !== state) {
    return NextResponse.redirect(new URL('/auth/login?error=state_mismatch', appOrigin));
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
    return NextResponse.redirect(new URL('/auth/login?error=exchange_failed', appOrigin));
  }

  const landing = await resolveLanding(env.API_BASE_URL, tokens.access_token);
  const response = NextResponse.redirect(new URL(landing, appOrigin));
  response.cookies.set(
    COOKIE_REFRESH,
    tokens.refresh_token,
    refreshCookieOptions(tokens.refresh_expires_in),
  );
  // Purge le cookie PKCE (à usage unique)
  response.cookies.set(COOKIE_PKCE, '', { ...pkceCookieOptions(0), maxAge: 0 });
  return response;
}
