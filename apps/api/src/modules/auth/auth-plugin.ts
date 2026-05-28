import { DomainError } from '@mata/shared/errors';
import type { User, UserRole, UserStatus } from '@prisma/client';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../../lib/prisma.js';
import { InvalidTokenError, type KeycloakVerifier } from './keycloak-verifier.js';

export type AuthenticatedUser = {
  id: string;
  keycloakId: string;
  role: UserRole;
  status: UserStatus;
  displayName: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    actingOnBehalfOf?: AuthenticatedUser;
  }
}

type AuthPluginOptions = {
  verifier: KeycloakVerifier;
  /** Routes publiques exemptées de vérification JWT (préfixes). */
  publicPrefixes?: readonly string[];
};

const DEFAULT_PUBLIC_PREFIXES = ['/v1/health', '/v1/guest', '/v1/payments/webhook'] as const;

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  app: FastifyInstance,
  opts: AuthPluginOptions,
) => {
  const publicPrefixes = opts.publicPrefixes ?? DEFAULT_PUBLIC_PREFIXES;

  app.addHook('onRequest', async (req) => {
    if (publicPrefixes.some((prefix) => req.url.startsWith(prefix))) return;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new DomainError('UNAUTHORIZED', 'Missing Bearer token');
    }

    const token = authHeader.slice('bearer '.length).trim();
    let claims: Awaited<ReturnType<typeof opts.verifier.verify>>;
    try {
      claims = await opts.verifier.verify(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        throw new DomainError('UNAUTHORIZED', 'Invalid or expired token');
      }
      throw err;
    }

    // Résolution du user MATA depuis keycloak_id
    const dbUser = await prisma.user.findUnique({
      where: { keycloakId: claims.sub },
      select: { id: true, keycloakId: true, role: true, status: true, displayName: true },
    });

    if (!dbUser) {
      throw new DomainError('FORBIDDEN', 'Keycloak user not provisioned in MATA', {
        details: { keycloakId: claims.sub },
      });
    }
    if (dbUser.status !== 'active') {
      throw new DomainError('FORBIDDEN', `Account ${dbUser.status}`, {
        details: { status: dbUser.status },
      });
    }

    req.user = userToAuthenticated(dbUser);
  });
};

function userToAuthenticated(
  user: Pick<User, 'id' | 'keycloakId' | 'role' | 'status' | 'displayName'>,
): AuthenticatedUser {
  return {
    id: user.id,
    keycloakId: user.keycloakId,
    role: user.role,
    status: user.status,
    displayName: user.displayName,
  };
}

export default fp(authPlugin, { name: 'mata-auth', fastify: '5.x' });

/**
 * Récupère l'utilisateur authentifié, lance UNAUTHORIZED s'il n'y en a pas.
 * Utile dans les handlers de route pour éviter les checks répétés.
 */
export function requireUser(req: FastifyRequest): AuthenticatedUser {
  if (!req.user) {
    throw new DomainError('UNAUTHORIZED', 'Authentication required');
  }
  return req.user;
}
