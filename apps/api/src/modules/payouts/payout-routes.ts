import {
  PayoutAdminListQuerySchema,
  PayoutListResponseSchema,
  PayoutOutputSchema,
  PayoutPendingResponseSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { payoutService } from './payout-service.js';

/**
 * Routes /v1/payouts/* · reversements producteurs Lot 5.
 *
 * Toutes les routes admin-only (les producteurs ne déclenchent pas
 * eux-mêmes leur reversement — admin manuel + cron automatique).
 */

const PayoutIdParamSchema = z.object({ id: UuidSchema });
const ProducerUserIdParamSchema = z.object({ producerUserId: UuidSchema });

const BlockPayoutBodySchema = z.object({ reason: z.string().min(3).max(300) });

export async function payoutRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // GET /v1/payouts/pending · KPI à reverser (admin)
  //
  // Alimente le KPI « À reverser · 9 producteurs · 832 500 F » du mockup
  // §2774 et le bouton « Reverser (9) ».

  typed.get(
    '/v1/payouts/pending',
    {
      schema: { response: { 200: PayoutPendingResponseSchema } },
    },
    async (req) => {
      requireRole(req, 'admin');
      return payoutService.computePending();
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/payouts · queue admin (filtres status / producerUserId)

  typed.get(
    '/v1/payouts',
    {
      schema: {
        querystring: PayoutAdminListQuerySchema,
        response: { 200: PayoutListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const payouts = await payoutService.listAdmin(req.query);
      return { payouts };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/payouts/:producerUserId/trigger · déclencher reversement (admin)

  typed.post(
    '/v1/payouts/:producerUserId/trigger',
    {
      schema: {
        params: ProducerUserIdParamSchema,
        response: { 201: PayoutOutputSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      const payout = await payoutService.triggerPayout({
        actorUserId: user.id,
        producerUserId: req.params.producerUserId,
        request: req,
      });
      return reply.code(201).send(payout);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/payouts/:id/block · bloquer manuellement un payout pending

  typed.post(
    '/v1/payouts/:id/block',
    {
      schema: {
        params: PayoutIdParamSchema,
        body: BlockPayoutBodySchema,
        response: { 200: z.object({ blocked: z.boolean() }) },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      await payoutService.blockPayout({
        actorUserId: user.id,
        payoutId: req.params.id,
        reason: req.body.reason,
        request: req,
      });
      return { blocked: true };
    },
  );
}
