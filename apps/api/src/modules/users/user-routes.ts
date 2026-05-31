import { AdminCreateUserInputSchema, AdminCreateUserResponseSchema } from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireRole, requireUser } from '../auth/index.js';
import { userService } from './user-service.js';

/**
 * Routes Utilisateurs (Lot 9) · création de comptes par un admin.
 *
 *  - POST /v1/admin/users : admin / super_admin. Crée un compte (tous rôles
 *    sauf super_admin) avec un mot de passe temporaire renvoyé une seule fois.
 */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/admin/users',
    {
      schema: {
        body: AdminCreateUserInputSchema,
        response: { 201: AdminCreateUserResponseSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'admin', 'super_admin');
      const user = requireUser(req);
      const result = await userService.createByAdmin({
        actorUserId: user.id,
        input: req.body,
        request: req,
      });
      return reply.code(201).send(result);
    },
  );
}
