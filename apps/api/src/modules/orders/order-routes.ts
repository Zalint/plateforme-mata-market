import { DomainError } from '@mata/shared/errors';
import {
  OrderAdminListQuerySchema,
  OrderCancelInputSchema,
  OrderCreateSchema,
  OrderListResponseSchema,
  OrderOutputSchema,
  OrderStatusTransitionInputSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole, requireUser } from '../auth/index.js';
import { withIdempotency } from './idempotency.js';
import { orderService } from './order-service.js';

/**
 * Routes /v1/orders/* · cycle commande Lot 4.
 *
 * Convention CLAUDE.md §G2 : routes minces (parse → service → return),
 * la logique métier reste dans `order-service.ts`. Les permissions sont
 * vérifiées EXPLICITEMENT par route (CLAUDE.md §G8).
 */

const OrderIdParamSchema = z.object({ id: UuidSchema });

// Pivot : le client (pro/particulier) ne voit pas l'identité producteur. Staff
// (admin/téléconseiller) et producteur la voient.
function showProducerFor(role: string | undefined): boolean {
  return role !== 'client_pro' && role !== 'client_particulier';
}

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // POST /v1/orders · création (client_pro + client_particulier + admin)
  //
  // Exige header `X-Idempotency-Key` (UUID v4). Replay → 200 même body.

  typed.post(
    '/v1/orders',
    {
      schema: {
        body: OrderCreateSchema,
        response: { 201: OrderOutputSchema, 200: OrderOutputSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'client_pro', 'client_particulier', 'admin');
      const user = requireUser(req);

      const outcome = await withIdempotency({
        request: req,
        scopeOwner: `user:${user.id}`,
        actorUserId: user.id,
        handler: () =>
          orderService.create({ clientUserId: user.id, input: req.body, request: req }),
      });

      // Replay → 200 (sans recréer). Première création → 201.
      return reply.code(outcome.replay ? 200 : outcome.statusCode).send(outcome.body);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/orders/me · commandes du client connecté

  typed.get(
    '/v1/orders/me',
    {
      schema: { response: { 200: OrderListResponseSchema } },
    },
    async (req) => {
      requireRole(req, 'client_pro', 'client_particulier');
      const user = requireUser(req);
      const orders = await orderService.listMine(user.id);
      return { orders };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/orders/received · commandes reçues par le producteur connecté

  typed.get(
    '/v1/orders/received',
    {
      schema: { response: { 200: OrderListResponseSchema } },
    },
    async (req) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      const orders = await orderService.listReceived(user.id);
      return { orders };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/orders · queue admin

  typed.get(
    '/v1/orders',
    {
      schema: {
        querystring: OrderAdminListQuerySchema,
        response: { 200: OrderListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin', 'teleconsultant');
      const orders = await orderService.listAdmin(req.query);
      return { orders };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/orders/:id · détail d'une commande
  //
  // Autorisé pour : owner (clientUserId), producer concerné (order_items),
  // admin. Vérifie au cas par cas (ownership compound).

  typed.get(
    '/v1/orders/:id',
    {
      schema: {
        params: OrderIdParamSchema,
        response: { 200: OrderOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const order = await orderService.getById(req.params.id, showProducerFor(user.role));

      // Permission compound : admin/staff, owner client, ou producteur d'un item.
      if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'teleconsultant') {
        return order;
      }
      if (order.clientUserId === user.id) return order;
      if (user.role === 'producer' && order.items.some((i) => i.producerUserId === user.id)) {
        return order;
      }
      throw new DomainError('FORBIDDEN', 'Accès commande refusé');
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/orders/:id/status · transitions cycle de vie (admin)
  //
  // Le cycle complet (confirmed → collecting → ... → delivered) est
  // piloté par l'admin au Lot 4 (le producer reçoit les notifs, mais ne
  // déclenche pas lui-même les transitions). Lot 7 introduira la
  // transition `collected` automatique au scan QR par le MLC.

  typed.post(
    '/v1/orders/:id/status',
    {
      schema: {
        params: OrderIdParamSchema,
        body: OrderStatusTransitionInputSchema,
        response: { 200: OrderOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin', 'teleconsultant');
      const user = requireUser(req);
      return orderService.transitionStatus({
        actorUserId: user.id,
        orderId: req.params.id,
        to: req.body.to,
        request: req,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/orders/:id/cancel · annulation (owner client OU admin)
  //
  // Raison obligatoire pour traçabilité (audit log).

  typed.post(
    '/v1/orders/:id/cancel',
    {
      schema: {
        params: OrderIdParamSchema,
        body: OrderCancelInputSchema,
        response: { 200: OrderOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);

      // Vérifie l'ownership avant d'appeler le service (qui ne le check pas
      // car il sert plusieurs contextes).
      const owner = await prisma.order.findUnique({
        where: { id: req.params.id },
        select: { clientUserId: true },
      });
      if (!owner) throw new DomainError('NOT_FOUND', 'Commande introuvable');
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isOwner = owner.clientUserId === user.id;
      if (!isAdmin && !isOwner) {
        throw new DomainError('FORBIDDEN', "Seul le client propriétaire ou l'admin peut annuler");
      }

      return orderService.cancel({
        actorUserId: user.id,
        orderId: req.params.id,
        input: req.body,
        showProducer: showProducerFor(user.role),
        request: req,
      });
    },
  );
}
