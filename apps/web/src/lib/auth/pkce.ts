import { createHash, randomBytes } from 'node:crypto';

/**
 * Génération d'un couple `code_verifier` / `code_challenge` selon RFC 7636
 * (PKCE S256). Utilisé par le flow Authorization Code Keycloak.
 *
 * Référence : ARCHITECTURE.md §3 « mata-web : public, PKCE S256 ».
 */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function generateRandomState(): string {
  return base64UrlEncode(randomBytes(16));
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
