import {
  PickupAdminListQuerySchema,
  PickupCancelSchema,
  PickupCreateSchema,
  PickupItemCheckSchema,
  PickupListResponseSchema,
  PickupOutputSchema,
  PickupTransitionSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { pickupService } from './pickup-service.js';

/**
 * Routes /v1/pickups/* · tournées de collecte (Lot 7).
 *
 * Permissions (CLAUDE.md §G8, lisibles dans la route) :
 *  - création / transition / cancel : admin only (orchestration MATA).
 *  - cochage item : admin (le chauffeur agit via un compte admin au MVP).
 *  - GET /v1/pickups : admin (vue calendrier complète).
 *  - GET /v1/pickups/mine : producer OU admin (le producteur voit ses collectes).
 */

const PickupIdParamSchema = z.object({ id: UuidSchema });
const PickupItemParamSchema = z.object({ id: UuidSchema, itemId: UuidSchema });

export async function pickupRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // POST /v1/pickups · créer une tournée (admin)

  typed.post(
    '/v1/pickups',
    {
      schema: {
        body: PickupCreateSchema,
        response: { 201: PickupOutputSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      const pickup = await pickupService.createPickup({
        actorUserId: user.id,
        input: req.body,
        request: req,
      });
      return reply.code(201).send(pickup);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/pickups · calendrier admin (filtres status / zoneId)

  typed.get(
    '/v1/pickups',
    {
      schema: {
        querystring: PickupAdminListQuerySchema,
        response: { 200: PickupListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const pickups = await pickupService.listAdmin(req.query);
      return { pickups };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/pickups/mine · collectes du producteur (producer OU admin)

  typed.get(
    '/v1/pickups/mine',
    {
      schema: { response: { 200: PickupListResponseSchema } },
    },
    async (req) => {
      requireRole(req, 'producer', 'admin');
      const user = requireUser(req);
      const pickups = await pickupService.listForProducer(user.id);
      return { pickups };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/pickups/:id/status · transition (admin)

  typed.post(
    '/v1/pickups/:id/status',
    {
      schema: {
        params: PickupIdParamSchema,
        body: PickupTransitionSchema,
        response: { 200: PickupOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return pickupService.transitionStatus({
        actorUserId: user.id,
        pickupId: req.params.id,
        to: req.body.to,
        request: req,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/pickups/:id/items/:itemId/check · cocher un item collecté (admin)

  typed.post(
    '/v1/pickups/:id/items/:itemId/check',
    {
      schema: {
        params: PickupItemParamSchema,
        body: PickupItemCheckSchema,
        response: { 200: PickupOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return pickupService.checkItem({
        actorUserId: user.id,
        pickupId: req.params.id,
        itemId: req.params.itemId,
        collected: req.body.collected,
        notes: req.body.notes,
        request: req,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/pickups/:id/cancel · annuler + libérer les items (admin)

  typed.post(
    '/v1/pickups/:id/cancel',
    {
      schema: {
        params: PickupIdParamSchema,
        body: PickupCancelSchema,
        response: { 200: PickupOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return pickupService.cancelPickup({
        actorUserId: user.id,
        pickupId: req.params.id,
        reason: req.body.reason,
        request: req,
      });
    },
  );
}
