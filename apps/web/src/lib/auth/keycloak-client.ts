/**
 * Helpers pour appeler les endpoints Keycloak OpenID Connect côté serveur Next.
 *
 * Référence : ARCHITECTURE.md §3 « Authentification (Keycloak) ».
 */

export type KeycloakConfig = {
  url: string;
  realm: string;
  clientId: string;
};

export type KeycloakTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
  id_token?: string;
  scope?: string;
};

export function authorizeUrl(
  config: KeycloakConfig,
  params: { redirectUri: string; codeChallenge: string; state: string; scope?: string },
): string {
  const url = new URL(
    `${config.url.replace(/\/$/, '')}/realms/${config.realm}/protocol/openid-connect/auth`,
  );
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope ?? 'openid profile email');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode(
  config: KeycloakConfig,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<KeycloakTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  return keycloakTokenRequest(config, body);
}

export async function refreshTokens(
  config: KeycloakConfig,
  refreshToken: string,
): Promise<KeycloakTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  });
  return keycloakTokenRequest(config, body);
}

export async function endSession(config: KeycloakConfig, refreshToken: string): Promise<void> {
  const url = `${config.url.replace(/\/$/, '')}/realms/${config.realm}/protocol/openid-connect/logout`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: refreshToken,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Keycloak logout failed: ${res.status} ${await res.text()}`);
  }
}

async function keycloakTokenRequest(
  config: KeycloakConfig,
  body: URLSearchParams,
): Promise<KeycloakTokens> {
  const url = `${config.url.replace(/\/$/, '')}/realms/${config.realm}/protocol/openid-connect/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    // Timeout 10s — pattern httpFetch standard MATA (cf. CLAUDE.md §G5)
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Keycloak token request failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as KeycloakTokens;
}
