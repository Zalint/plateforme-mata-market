import { NextResponse } from 'next/server';
import { COOKIE_PKCE, pkceCookieOptions } from '../../../../src/lib/auth/cookies';
import { authorizeUrl } from '../../../../src/lib/auth/keycloak-client';
import { generatePkce, generateRandomState } from '../../../../src/lib/auth/pkce';
import { getEnv } from '../../../../src/lib/env';

/**
 * GET /api/auth/login
 *
 * Démarre le flow OIDC Authorization Code + PKCE. Génère un `code_verifier`,
 * le stocke en cookie HttpOnly (le navigateur ne le voit jamais), puis redirige
 * le navigateur vers Keycloak.
 */
export async function GET(): Promise<NextResponse> {
  const env = getEnv();
  const { verifier, challenge } = generatePkce();
  const state = generateRandomState();

  const url = authorizeUrl(
    {
      url: env.KEYCLOAK_URL,
      realm: env.KEYCLOAK_REALM,
      clientId: env.KEYCLOAK_CLIENT_ID,
    },
    { redirectUri: env.KEYCLOAK_REDIRECT_URI, codeChallenge: challenge, state },
  );

  const response = NextResponse.redirect(url);
  response.cookies.set(COOKIE_PKCE, JSON.stringify({ verifier, state }), pkceCookieOptions());
  return response;
}
