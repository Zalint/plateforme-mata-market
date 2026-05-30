import { DomainError } from '@mata/shared/errors';
import {
  PaymentAdminListQuerySchema,
  PaymentIntentCreateSchema,
  PaymentIntentResponseSchema,
  PaymentListResponseSchema,
  PaymentOutputSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole, requireUser } from '../auth/index.js';
import { paymentService } from './payment-service.js';

/**
 * Routes /v1/payments/* · checkout + webhook + lectures Lot 5.
 *
 * Convention CLAUDE.md §G2 : routes minces (parse → service → return),
 * permissions vérifiées EXPLICITEMENT.
 *
 * SÉCURITÉ /v1/payments/webhook :
 *  - Route publique (cf. DEFAULT_PUBLIC_PREFIXES dans auth-plugin)
 *  - Raw body capturé par fastify-raw-body SCOPE-LIMITED (config.rawBody=true)
 *  - HMAC vérifié AVANT toute logique (paymentService.processWebhook)
 */

// Fastify type augmentation : `rawBody` ajouté par fastify-raw-body sur les
// routes avec config.rawBody=true.
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer | string;
  }
}

const PaymentIdParamSchema = z.object({ id: UuidSchema });
const OrderIdParamSchema = z.object({ orderId: UuidSchema });

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // POST /v1/payments/intents · création du checkout
  //
  // Le client (ou un admin pour debug) demande un payment intent pour son
  // order. Le serveur appelle Bictorys, persiste le row, retourne paymentUrl.

  typed.post(
    '/v1/payments/intents',
    {
      schema: {
        body: PaymentIntentCreateSchema,
        response: { 201: PaymentIntentResponseSchema, 200: PaymentIntentResponseSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'client_pro', 'client_particulier', 'admin');
      const user = requireUser(req);

      // Vérifie ownership : seul le client de l'order (ou admin) peut créer
      // un intent. Pattern compound similaire à order-routes.ts.
      const order = await prisma.order.findUnique({
        where: { id: req.body.orderId },
        select: { clientUserId: true },
      });
      if (!order) throw new DomainError('NOT_FOUND', 'Commande introuvable');
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isOwner = order.clientUserId === user.id;
      if (!isAdmin && !isOwner) {
        throw new DomainError('FORBIDDEN', 'Seul le client propriétaire peut payer cette commande');
      }

      const result = await paymentService.createCheckoutSession({
        actorUserId: user.id,
        orderId: req.body.orderId,
        request: req,
      });
      return reply.code(201).send(result);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/payments/webhook · callback Bictorys (PUBLIC)
  //
  // - Route publique (DEFAULT_PUBLIC_PREFIXES)
  // - Raw body via fastify-raw-body (config.rawBody=true)
  // - HMAC vérifié dans paymentService.processWebhook
  // - Réponse 200 dans la quasi-totalité des cas pour éviter retry infini Bictorys
  // - Réponse 401 UNIQUEMENT si signature invalide (anti-replay côté provider)

  typed.post(
    '/v1/payments/webhook',
    {
      // `rawBody: true` est consommé par fastify-raw-body scope-limited (CLAUDE.md §G5).
      config: { rawBody: true },
      schema: {
        response: {
          200: z.object({ received: z.boolean() }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      // fastify-raw-body remplit req.rawBody. Si absent (plugin pas enregistré
      // ou config ratée), on refuse pour ne pas laisser passer un webhook non vérifié.
      if (!req.rawBody) {
        req.log.error({ event: 'webhook.no_raw_body' }, 'webhook.no_raw_body');
        return reply.code(500).send({ error: 'INTERNAL', message: 'Raw body missing' });
      }

      // Header signature — Bictorys utilise typiquement `X-Bictorys-Signature`
      // ou `X-Signature`. On lit les deux par sécurité.
      const signatureHeader =
        (req.headers['x-bictorys-signature'] as string | undefined) ??
        (req.headers['x-signature'] as string | undefined) ??
        null;

      const outcome = await paymentService.processWebhook({
        rawBody: req.rawBody,
        signatureHeader,
        request: req,
      });

      if (outcome.kind === 'signature_invalid') {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid signature' });
      }
      // Tous les autres outcomes (updated, duplicate, unknown_intent, refunded_after_cancel)
      // → 200 OK pour éviter retry infini Bictorys.
      return reply.code(200).send({ received: true });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/payments · queue admin (filtres status)

  typed.get(
    '/v1/payments',
    {
      schema: {
        querystring: PaymentAdminListQuerySchema,
        response: { 200: PaymentListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const payments = await paymentService.listAdmin(req.query);
      return { payments };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/payments/:id · détail (admin / owner / producer concerné)

  typed.get(
    '/v1/payments/:id',
    {
      schema: {
        params: PaymentIdParamSchema,
        response: { 200: PaymentOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const payment = await paymentService.getById(req.params.id);

      // Compound ownership : admin OR client owner OR producer concerné par un item.
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      if (isAdmin) return payment;

      // Charge l'order pour résoudre ownership.
      const order = await prisma.order.findUnique({
        where: { id: payment.orderId },
        select: {
          clientUserId: true,
          items: { select: { producerUserId: true } },
        },
      });
      if (!order) throw new DomainError('NOT_FOUND', 'Commande introuvable');
      if (order.clientUserId === user.id) return payment;
      if (user.role === 'producer' && order.items.some((i) => i.producerUserId === user.id)) {
        return payment;
      }
      throw new DomainError('FORBIDDEN', 'Accès paiement refusé');
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/orders/:orderId/payment · payment du order (raccourci pour UI client)

  typed.get(
    '/v1/orders/:orderId/payment',
    {
      schema: {
        params: OrderIdParamSchema,
        response: { 200: PaymentOutputSchema.nullable() },
      },
    },
    async (req) => {
      const user = requireUser(req);

      // Compound ownership (même règle que GET /v1/orders/:id).
      const order = await prisma.order.findUnique({
        where: { id: req.params.orderId },
        select: {
          clientUserId: true,
          items: { select: { producerUserId: true } },
        },
      });
      if (!order) throw new DomainError('NOT_FOUND', 'Commande introuvable');
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isOwner = order.clientUserId === user.id;
      const isProducer =
        user.role === 'producer' && order.items.some((i) => i.producerUserId === user.id);
      if (!isAdmin && !isOwner && !isProducer) {
        throw new DomainError('FORBIDDEN', 'Accès paiement refusé');
      }

      return paymentService.getByOrderId(req.params.orderId);
    },
  );
}
