import { type NextRequest, NextResponse } from 'next/server';
import { COOKIE_REFRESH, refreshCookieOptions } from '../../../../src/lib/auth/cookies';
import { refreshTokens } from '../../../../src/lib/auth/keycloak-client';
import { getEnv } from '../../../../src/lib/env';

/**
 * POST /api/auth/refresh
 *
 * Échange le refresh_token (lu depuis le cookie HttpOnly) contre un nouvel
 * access_token. Le navigateur reçoit uniquement l'access_token + expires_in
 * dans la réponse JSON ; le refresh_token est mis à jour côté cookie.
 *
 * Pattern : l'AuthProvider appelle cette route au mount initial et à chaque
 * approche de l'expiration du access_token.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const refresh = req.cookies.get(COOKIE_REFRESH)?.value;
  if (!refresh) {
    return NextResponse.json({ error: 'no_refresh_token' }, { status: 401 });
  }

  let tokens: Awaited<ReturnType<typeof refreshTokens>>;
  try {
    tokens = await refreshTokens(
      {
        url: env.KEYCLOAK_URL,
        realm: env.KEYCLOAK_REALM,
        clientId: env.KEYCLOAK_CLIENT_ID,
      },
      refresh,
    );
  } catch {
    // refresh expiré ou invalide → on purge le cookie pour forcer re-login
    const response = NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
    response.cookies.set(COOKIE_REFRESH, '', { ...refreshCookieOptions(0), maxAge: 0 });
    return response;
  }

  const response = NextResponse.json({
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
  });
  // Rotation du refresh token (Keycloak rotation activée par défaut)
  response.cookies.set(
    COOKIE_REFRESH,
    tokens.refresh_token,
    refreshCookieOptions(tokens.refresh_expires_in),
  );
  return response;
}
