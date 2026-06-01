import { DomainError } from '@mata/shared/errors';
import {
  CategoryListResponseSchema,
  CreateGuestOrderSchema,
  CreateGuestPaymentIntentSchema,
  GuestCatalogOfferDetailSchema,
  GuestCatalogOfferListQuerySchema,
  GuestCatalogOfferListResponseSchema,
  OrderOutputSchema,
  PaymentIntentResponseSchema,
  UuidSchema,
  ZoneListResponseSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isHcaptchaConfigured, verifyHcaptcha } from '../../lib/hcaptcha.js';
import { logger } from '../../lib/logger.js';
import { guestService } from './guest-service.js';

/**
 * Plugin guest · routes `/v1/guest/*` du mode invité (Lot 8).
 *
 * Référence : CLAUDE.md §G3 (« Mode invité SÉPARÉ : routes /v1/guest/*, plugin
 * Fastify dédié, rate-limit strict »), §G8 (Zod systématique, permissions
 * explicites), §G5 (hCaptcha anti-bot).
 *
 * Particularités :
 *  - Aucune route n'exige de JWT : `auth-plugin` skip déjà le préfixe
 *    `/v1/guest` (DEFAULT_PUBLIC_PREFIXES). On NE met donc PAS de requireRole.
 *  - Rate-limit par route via `config.rateLimit` (le plugin @fastify/rate-limit
 *    est enregistré globalement dans server.ts) : lectures permissives,
 *    écritures strictes (anti-abus création de commandes).
 *  - hCaptcha : `verifyGuestHcaptcha` (preHandler) sur les routes mutantes.
 *    Si `HCAPTCHA_SECRET` n'est pas configuré (dev), on log et on laisse passer.
 */

// Limites de débit (par IP, keyGenerator par défaut de @fastify/rate-limit).
const READ_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
const WRITE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

const GuestOfferIdParamSchema = z.object({ id: UuidSchema });

/**
 * preHandler hCaptcha : vérifie le token présent dans le body (validé Zod en
 * amont). Désactivé si le secret n'est pas configuré (dev) — log + passe.
 */
async function verifyGuestHcaptcha(req: FastifyRequest): Promise<void> {
  if (!isHcaptchaConfigured()) {
    logger.debug({ event: 'guest.hcaptcha.disabled' }, 'guest.hcaptcha.disabled');
    return;
  }
  const token = (req.body as { hcaptchaToken?: string } | undefined)?.hcaptchaToken;
  const result = await verifyHcaptcha(token, req.ip);
  if (!result.ok) {
    throw new DomainError('FORBIDDEN', 'Vérification anti-robot échouée', {
      details: { reason: result.reason },
    });
  }
}

export async function guestPlugin(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ───────────────────────────────────────────────────────────────
  // GET /v1/guest/zones · zones de livraison actives (lecture publique)

  typed.get(
    '/v1/guest/zones',
    {
      config: { rateLimit: READ_RATE_LIMIT },
      schema: { response: { 200: ZoneListResponseSchema } },
    },
    async () => {
      const zones = await guestService.listZones();
      return { zones };
    },
  );

  // ───────────────────────────────────────────────────────────────
  // GET /v1/guest/categories · catégories produit actives (lecture publique)

  typed.get(
    '/v1/guest/categories',
    {
      config: { rateLimit: READ_RATE_LIMIT },
      schema: { response: { 200: CategoryListResponseSchema } },
    },
    async () => {
      const categories = await guestService.listCategories();
      return { categories };
    },
  );

  // ───────────────────────────────────────────────────────────────
  // GET /v1/guest/catalog/offers · catalogue masqué (identité producteur cachée)

  typed.get(
    '/v1/guest/catalog/offers',
    {
      config: { rateLimit: READ_RATE_LIMIT },
      schema: {
        querystring: GuestCatalogOfferListQuerySchema,
        response: { 200: GuestCatalogOfferListResponseSchema },
      },
    },
    async (req) => {
      return guestService.listCatalog(req.query);
    },
  );

  typed.get(
    '/v1/guest/catalog/offers/:id',
    {
      config: { rateLimit: READ_RATE_LIMIT },
      schema: {
        params: GuestOfferIdParamSchema,
        response: { 200: GuestCatalogOfferDetailSchema },
      },
    },
    async (req) => {
      return guestService.getCatalogOffer(req.params.id);
    },
  );

  // ───────────────────────────────────────────────────────────────
  // POST /v1/guest/orders · création de commande invité (cash | online)
  //
  // Exige `X-Idempotency-Key` (UUID v4). hCaptcha vérifié si configuré.

  typed.post(
    '/v1/guest/orders',
    {
      config: { rateLimit: WRITE_RATE_LIMIT },
      preHandler: verifyGuestHcaptcha,
      schema: {
        body: CreateGuestOrderSchema,
        response: { 201: OrderOutputSchema, 200: OrderOutputSchema },
      },
    },
    async (req, reply) => {
      const outcome = await guestService.createOrder({ input: req.body, request: req });
      // Replay idempotent → 200, première création → 201.
      return reply.code(outcome.replay ? 200 : 201).send(outcome.order);
    },
  );

  // ───────────────────────────────────────────────────────────────
  // POST /v1/guest/payments/intents · payment intent Bictorys pour commande
  // invité `online` (ownership = orderId + guestPhoneNumber).
  //
  // PAS de preHandler hCaptcha ici : un token hCaptcha est à USAGE UNIQUE et a
  // déjà été consommé à la création de la commande (POST /v1/guest/orders). Le
  // flux `online` enchaîne create → intent avec un seul challenge résolu. Cette
  // route reste protégée par (a) le rate-limit strict et (b) la preuve
  // d'ownership : il faut connaître l'`orderId` généré serveur ET le
  // `guestPhoneNumber` figé à la création — donc une commande déjà passée par
  // le captcha. L'anti-bot est ainsi appliqué en amont, sans double challenge.

  typed.post(
    '/v1/guest/payments/intents',
    {
      config: { rateLimit: WRITE_RATE_LIMIT },
      schema: {
        body: CreateGuestPaymentIntentSchema,
        response: { 201: PaymentIntentResponseSchema },
      },
    },
    async (req, reply) => {
      const intent = await guestService.createPaymentIntent({
        orderId: req.body.orderId,
        guestPhoneNumber: req.body.guestPhoneNumber,
        request: req,
      });
      return reply.code(201).send(intent);
    },
  );
}
