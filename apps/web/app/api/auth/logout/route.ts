import { type NextRequest, NextResponse } from 'next/server';
import { COOKIE_REFRESH, refreshCookieOptions } from '../../../../src/lib/auth/cookies';
import { endSession } from '../../../../src/lib/auth/keycloak-client';
import { getEnv } from '../../../../src/lib/env';

/**
 * POST /api/auth/logout
 *
 * Termine la session côté Keycloak puis purge le cookie refresh.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const refresh = req.cookies.get(COOKIE_REFRESH)?.value;
  if (refresh) {
    try {
      await endSession(
        {
          url: env.KEYCLOAK_URL,
          realm: env.KEYCLOAK_REALM,
          clientId: env.KEYCLOAK_CLIENT_ID,
        },
        refresh,
      );
    } catch {
      // On ne bloque pas le logout si Keycloak ne répond pas — on purge quand même.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_REFRESH, '', { ...refreshCookieOptions(0), maxAge: 0 });
  return response;
}
