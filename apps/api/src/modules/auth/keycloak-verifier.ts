import { createRemoteJWKSet, type JWTPayload, type JWTVerifyResult, jwtVerify } from 'jose';
import { z } from 'zod';

/**
 * Vérification des JWT émis par Keycloak via JWKS (Json Web Key Set).
 *
 * Le JWKS est récupéré depuis `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`
 * et cache automatiquement les clés (jose gère ça en interne avec TTL).
 *
 * Référence : ARCHITECTURE.md §9 « Authentification ».
 */

const KEYCLOAK_CLAIMS_SCHEMA = z.object({
  sub: z.string(), // Keycloak user ID
  email: z.string().email().optional(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  realm_access: z
    .object({
      roles: z.array(z.string()),
    })
    .optional(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

export type KeycloakClaims = z.infer<typeof KEYCLOAK_CLAIMS_SCHEMA>;

export type KeycloakVerifierConfig = {
  /** Base URL du serveur Keycloak (ex: https://keycloak.mata.sn) */
  keycloakUrl: string;
  /** Nom du realm (ex: "mata") */
  realm: string;
  /** Audience attendue dans le JWT (ex: "mata-api") */
  audience: string;
};

export type KeycloakVerifier = {
  verify(token: string): Promise<KeycloakClaims>;
};

/**
 * Construit un vérificateur Keycloak. Récupère le JWKS au premier appel et
 * cache automatiquement les clés (jose fait du caching interne par défaut
 * de 10 minutes).
 */
export function createKeycloakVerifier(config: KeycloakVerifierConfig): KeycloakVerifier {
  const issuer = `${config.keycloakUrl.replace(/\/$/, '')}/realms/${config.realm}`;
  const jwksUrl = new URL(`${issuer}/protocol/openid-connect/certs`);
  const jwks = createRemoteJWKSet(jwksUrl, {
    cacheMaxAge: 10 * 60 * 1000, // 10 min
    cooldownDuration: 30 * 1000, // 30 s
  });

  return {
    async verify(token: string): Promise<KeycloakClaims> {
      let result: JWTVerifyResult<JWTPayload>;
      try {
        result = await jwtVerify(token, jwks, {
          issuer,
          audience: config.audience,
        });
      } catch (err) {
        throw new InvalidTokenError(err instanceof Error ? err.message : 'JWT verification failed');
      }

      const parsed = KEYCLOAK_CLAIMS_SCHEMA.safeParse(result.payload);
      if (!parsed.success) {
        throw new InvalidTokenError(`JWT payload shape invalid: ${parsed.error.message}`);
      }
      return parsed.data;
    },
  };
}

export class InvalidTokenError extends Error {
  public override readonly name = 'InvalidTokenError';
}
