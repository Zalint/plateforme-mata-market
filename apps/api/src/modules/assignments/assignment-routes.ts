import {
  AssignmentContextResponseSchema,
  AssignmentScopeInputSchema,
  AssignmentScopeOutputSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { assignmentService } from './assignment-service.js';

/**
 * Routes Affectations producteur ↔ téléconseiller — ADMIN ONLY.
 *
 *  - GET  /v1/assignments/context                 → données de l'écran admin
 *  - GET  /v1/assignments/:teleconsultantUserId   → portée d'un téléconseiller
 *  - PUT  /v1/assignments/:teleconsultantUserId   → remplace sa portée
 *
 * Référence : CLAUDE.md §G8 (permissions explicites par endpoint).
 */
export async function assignmentRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const TcParamSchema = z.object({ teleconsultantUserId: UuidSchema });

  typed.get(
    '/v1/assignments/context',
    { schema: { response: { 200: AssignmentContextResponseSchema } } },
    async (req) => {
      requireRole(req, 'admin');
      return assignmentService.getAssignmentContext();
    },
  );

  typed.get(
    '/v1/assignments/:teleconsultantUserId',
    {
      schema: { params: TcParamSchema, response: { 200: AssignmentScopeOutputSchema } },
    },
    async (req) => {
      requireRole(req, 'admin');
      const scope = await assignmentService.getScopeForTeleconsultant(
        req.params.teleconsultantUserId,
      );
      return { teleconsultantUserId: req.params.teleconsultantUserId, ...scope };
    },
  );

  typed.put(
    '/v1/assignments/:teleconsultantUserId',
    {
      schema: {
        params: TcParamSchema,
        body: AssignmentScopeInputSchema,
        response: { 200: AssignmentScopeOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const actor = requireUser(req);
      const scope = await assignmentService.setScopeForTeleconsultant({
        teleconsultantUserId: req.params.teleconsultantUserId,
        allProducers: req.body.allProducers,
        producerUserIds: req.body.producerUserIds,
        actorUserId: actor.id,
        request: req,
      });
      return { teleconsultantUserId: req.params.teleconsultantUserId, ...scope };
    },
  );
}
