import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../modules/auth/index.js';

const AuthMeResponseSchema = z.object({
  id: z.string().uuid(),
  keycloakId: z.string(),
  role: z.enum([
    'producer',
    'client_pro',
    'client_particulier',
    'admin',
    'teleconsultant',
    'super_admin',
  ]),
  status: z.enum(['active', 'suspended', 'blacklisted']),
  displayName: z.string(),
  actingOnBehalfOf: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
    })
    .nullable(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/auth/me',
    {
      schema: { response: { 200: AuthMeResponseSchema } },
    },
    async (req) => {
      const user = requireUser(req);
      return {
        id: user.id,
        keycloakId: user.keycloakId,
        role: user.role,
        status: user.status,
        displayName: user.displayName,
        actingOnBehalfOf: req.actingOnBehalfOf
          ? { id: req.actingOnBehalfOf.id, displayName: req.actingOnBehalfOf.displayName }
          : null,
      };
    },
  );

  // Logout : c'est Keycloak qui fait la vraie session invalidation. Côté API on
  // ne fait que vider l'éventuel state serveur (rien à ce stade) et retourner OK.
  // La PWA appellera ensuite /realms/<realm>/protocol/openid-connect/logout côté
  // Keycloak avec le refresh token.
  app.post(
    '/v1/auth/logout',
    {
      schema: { response: { 204: z.null() } },
    },
    async (_req, reply) => {
      return reply.code(204).send();
    },
  );
}
