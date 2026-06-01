import { createHmac, randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { DomainError } from '@mata/shared/errors';
import type { Offer, ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../env.js';
import { prisma } from '../../../lib/prisma.js';
import authPlugin from '../../auth/auth-plugin.js';
import type { KeycloakVerifier } from '../../auth/keycloak-verifier.js';
import { paymentService } from '../../payments/index.js';
import { pricingService } from '../../pricing/index.js';
import { guestPlugin } from '../guest-plugin.js';

/**
 * Test d'intégration · mode invité (Lot 8) sur vraie Postgres (testcontainers).
 *
 * On monte une app Fastify MINIMALE (rate-limit global + auth-plugin avec un
 * verifier stub + guest-plugin + error handler) et on tape les routes via
 * `app.inject` — c'est le seul moyen de vérifier les aspects HTTP du plugin
 * invité : accès public sans JWT, rate-limit strict, preHandler hCaptcha.
 * Les flux purement métier (webhook → confirmation) appellent les services.
 *
 * Vérifie :
 *  1. GET /v1/guest/zones + /v1/guest/catalog/offers accessibles sans JWT
 *  2. Catalogue invité MASQUE l'identité producteur (pas de `producer`/`site`)
 *  3. POST /v1/guest/orders `cash_on_delivery` → 201, commande invité, audit guest (Lot 9)
 *  4. POST /v1/guest/orders `online` → intent Bictorys → webhook paid → confirmé
 *  5. Idempotence : même X-Idempotency-Key → 200 + même commande
 *  6. Ownership intent invité : mauvais téléphone → 403, commande cash → 409
 *  7. Rate-limit strict en écriture : au-delà de 10/min → 429
 *  8. hCaptcha configuré + token invalide → 403 (rejet), aucune commande créée
 *
 * Référence : CLAUDE.md §G3 (mode invité séparé, rate-limit strict), §G5
 * (Bictorys, raw body + HMAC), §G6 (testcontainers), §G8 (Zod, public prefixes).
 */

const ZONE_SLUG = 'guest-test-pout';
const WEBHOOK_SECRET = 'test-webhook-secret-32chars-min!'; // doit matcher integration-setup.ts
const GUEST_PHONE = '+221771234500';

// Verifier Keycloak stub : jamais appelé (les routes /v1/guest sont publiques —
// auth-plugin skip le préfixe). Présent uniquement pour monter le plugin.
const stubVerifier: KeycloakVerifier = {
  verify: () => Promise.reject(new Error('stub verifier should never be called for guest routes')),
};

let zone: Zone;
let producer: User;
let profile: ProducerProfile;
let site: ProductionSite;
let offer: Offer;

function signWebhook(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Rate-limit global permissif : les limites strictes sont posées par route
  // via `config.rateLimit` dans guest-plugin (READ 60/min, WRITE 10/min).
  await app.register(rateLimit, { max: 10_000, timeWindow: '1 minute' });
  await app.register(authPlugin, { verifier: stubVerifier });
  await app.register(guestPlugin);

  // Reproduit le mapping DomainError → statusCode de server.ts.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    const statusCode = err.statusCode ?? 500;
    return reply.code(statusCode).send({ error: err.name, message: err.message });
  });

  await app.ready();
  return app;
}

function guestOrderBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [{ offerId: offer.id, quantity: 2 }],
    delivery: {
      zoneId: zone.id,
      addressLine: 'Almadies, Villa invité',
      slotDate: '2026-07-15',
      slotPeriod: 'morning',
    },
    guestFullName: 'Awa Ba',
    guestPhoneNumber: GUEST_PHONE,
    paymentMethod: 'cash_on_delivery',
    consent: true,
    ...overrides,
  };
}

// Mock fetch pour la création d'intent Bictorys (POST /charges).
function mockBictorysFetch(intentId = 'intent_guest_123'): void {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes('/charges')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: intentId,
            paymentUrl: `https://pay.bictorys.com/${intentId}`,
            status: 'opened',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (guest test)', region: 'Thiès' },
  });

  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:guest:producer',
      displayName: 'Mor Diop (guest)',
      role: 'producer',
      phone: '+221770000040',
    },
  });
  profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout guest-test',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });

  await pricingService.createRule(producer.id, {
    scope: 'category',
    category: 'poultry',
    model: 'commission_pct',
    commissionPct: 10,
    commissionBase: 'producer_price',
    commissionFlatFcfa: 0,
    safetyMarginPct: 0,
    safetyMarginBase: 'producer_price',
    collectionFcfa: 0,
    deliveryFcfa: 0,
    storageFcfa: 0,
    discountFcfa: 0,
  });
});

beforeEach(async () => {
  offer = await prisma.offer.create({
    data: {
      producerUserId: producer.id,
      siteId: site.id,
      categorySlug: 'poultry',
      status: 'validated',
      title: 'Poulet fermier (guest)',
      unit: 'unit',
      quantity: 50,
      quantityReserved: 0,
      priceFcfa: 3_000,
      availableFrom: new Date('2026-05-01'),
    },
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  // Réactive le scaffold hCaptcha désactivé entre chaque test.
  env.HCAPTCHA_SECRET = undefined;

  await prisma.outboxEvent.deleteMany({});
  // Inclut les audits invité (actorUserId null, tracés par guestPhoneNumber, Lot 9).
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: producer.id }, { guestPhoneNumber: GUEST_PHONE }] },
  });
  await prisma.payment.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.pricingSnapshot.deleteMany({});
  await prisma.idempotencyRecord.deleteMany({});
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
});

afterAll(async () => {
  await prisma.pricingRule.deleteMany({});
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({ where: { id: producer.id } });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe('Guest · lectures publiques (sans JWT)', () => {
  it('GET /v1/guest/zones renvoie les zones actives sans token', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/guest/zones' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { zones: Array<{ slug: string }> };
      expect(body.zones.some((z) => z.slug === ZONE_SLUG)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('GET /v1/guest/categories renvoie les catégories actives sans token', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/guest/categories' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { categories: Array<{ slug: string; isActive: boolean }> };
      expect(body.categories.some((c) => c.slug === 'poultry')).toBe(true);
      expect(body.categories.every((c) => c.isActive)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('GET /v1/guest/catalog/offers masque producteur + site, sans token', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/guest/catalog/offers' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { offers: Array<Record<string, unknown>>; meta: unknown };
      const mine = body.offers.find((o) => o.id === offer.id);
      expect(mine).toBeDefined();
      // Identité producteur masquée : aucune clé producer/site exposée.
      expect(mine && 'producer' in mine).toBe(false);
      expect(mine && 'site' in mine).toBe(false);
      // Seule la zone (livraison) est exposée.
      expect(mine?.zoneId).toBe(zone.id);
    } finally {
      await app.close();
    }
  });
});

describe('Guest · création de commande', () => {
  it('POST /v1/guest/orders cash_on_delivery → 201, commande invité, audit guest (Lot 9)', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: guestOrderBody(),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; paymentMethod: string; clientUserId: string | null };
      expect(body.paymentMethod).toBe('cash_on_delivery');
      expect(body.clientUserId).toBeNull();

      const row = await prisma.order.findUnique({ where: { id: body.id } });
      expect(row?.clientUserId).toBeNull();
      expect(row?.guestPhoneNumber).toBe(GUEST_PHONE);
      expect(row?.guestFullName).toBe('Awa Ba');
      expect(row?.paymentMethod).toBe('cash_on_delivery');

      // Lot 9 : l'audit `order.create` est désormais écrit même sans row `users`.
      // `actorUserId` null + `guestPhoneNumber` rempli (traçabilité invité).
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'order.create', targetId: body.id },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorUserId).toBeNull();
      expect(audit?.guestPhoneNumber).toBe(GUEST_PHONE);

      // Stock réservé.
      const after = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(after?.quantityReserved).toBe(2);
    } finally {
      await app.close();
    }
  });

  it('idempotence : même X-Idempotency-Key → 200 + même commande', async () => {
    const app = await buildApp();
    try {
      const key = randomUUID();
      const payload = guestOrderBody();
      const first = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': key },
        payload,
      });
      expect(first.statusCode).toBe(201);
      const firstId = (first.json() as { id: string }).id;

      const second = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': key },
        payload,
      });
      expect(second.statusCode).toBe(200); // replay
      expect((second.json() as { id: string }).id).toBe(firstId);

      // Stock réservé une seule fois (pas de double réservation).
      const after = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(after?.quantityReserved).toBe(2);
    } finally {
      await app.close();
    }
  });

  it('refuse 422 sans X-Idempotency-Key (DomainError VALIDATION)', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        payload: guestOrderBody(),
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });
});

describe('Guest · paiement en ligne (intent + webhook)', () => {
  it('online → intent Bictorys → webhook paid → commande confirmée', async () => {
    const app = await buildApp();
    try {
      // 1. Création commande online.
      const orderRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: guestOrderBody({ paymentMethod: 'online' }),
      });
      expect(orderRes.statusCode).toBe(201);
      const orderId = (orderRes.json() as { id: string }).id;

      // 2. Création de l'intent (fetch Bictorys mocké).
      mockBictorysFetch('intent_guest_123');
      const intentRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/payments/intents',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: { orderId, guestPhoneNumber: GUEST_PHONE },
      });
      expect(intentRes.statusCode).toBe(201);
      const intent = intentRes.json() as { providerIntentId: string; paymentUrl: string };
      expect(intent.providerIntentId).toBe('intent_guest_123');
      expect(intent.paymentUrl).toMatch(/^https:\/\//);

      // Lot 9 : audit `payment.intent_created` écrit pour l'invité (actor null +
      // guestPhoneNumber), plus de skip silencieux.
      const intentAudit = await prisma.auditLog.findFirst({
        where: { action: 'payment.intent_created', guestPhoneNumber: GUEST_PHONE },
      });
      expect(intentAudit).not.toBeNull();
      expect(intentAudit?.actorUserId).toBeNull();

      // 3. Webhook Bictorys paid → confirmation.
      const webhookBody = JSON.stringify({ id: 'intent_guest_123', status: 'paid' });
      const outcome = await paymentService.processWebhook({
        rawBody: webhookBody,
        signatureHeader: signWebhook(webhookBody),
      });
      expect(outcome.kind).toBe('updated');

      const confirmed = await prisma.order.findUnique({ where: { id: orderId } });
      expect(confirmed?.status).toBe('confirmed');
      expect(confirmed?.paymentStatus).toBe('paid');
    } finally {
      await app.close();
    }
  });

  it('refuse 403 si le téléphone ne correspond pas à la commande invité', async () => {
    const app = await buildApp();
    try {
      const orderRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: guestOrderBody({ paymentMethod: 'online' }),
      });
      const orderId = (orderRes.json() as { id: string }).id;

      mockBictorysFetch();
      const intentRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/payments/intents',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: { orderId, guestPhoneNumber: '+221770000999' },
      });
      expect(intentRes.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('refuse 409 si la commande est cash_on_delivery (pas de paiement en ligne)', async () => {
    const app = await buildApp();
    try {
      const orderRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: guestOrderBody({ paymentMethod: 'cash_on_delivery' }),
      });
      const orderId = (orderRes.json() as { id: string }).id;

      mockBictorysFetch();
      const intentRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/payments/intents',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: { orderId, guestPhoneNumber: GUEST_PHONE },
      });
      expect(intentRes.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});

describe('Guest · rate-limit strict (écriture)', () => {
  it('au-delà de 10 POST /v1/guest/orders par minute → 429', async () => {
    const app = await buildApp();
    try {
      const codes: number[] = [];
      // 11 requêtes : le rate-limit (onRequest) incrémente avant la validation,
      // donc même des corps invalides comptent. Les 10 premières passent, la 11e
      // est bloquée (429) AVANT d'atteindre le handler.
      for (let i = 0; i < 11; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/guest/orders',
          headers: { 'x-idempotency-key': randomUUID() },
          payload: {}, // invalide → 400, mais compté par le rate-limit
        });
        codes.push(res.statusCode);
      }
      expect(codes[10]).toBe(429);
      expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe('Guest · hCaptcha (anti-bot, activé si secret configuré)', () => {
  it('token invalide rejeté (403) quand HCAPTCHA_SECRET est configuré', async () => {
    // Active le scaffold hCaptcha + simule une réponse siteverify négative.
    env.HCAPTCHA_SECRET = 'test-hcaptcha-secret';
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('hcaptcha.com/siteverify')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: guestOrderBody({ hcaptchaToken: 'bad-token' }),
      });
      expect(res.statusCode).toBe(403);

      // Aucune commande créée (rejet en preHandler avant le service).
      const count = await prisma.order.count({ where: { guestPhoneNumber: GUEST_PHONE } });
      expect(count).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("la création d'intent N'EXIGE PAS de captcha (token à usage unique consommé à l'order)", async () => {
    // Secret configuré → le captcha garde POST /orders, mais PAS /intents : le
    // token hCaptcha est à usage unique (consommé à la création). Le flux online
    // enchaîne create → intent avec un seul challenge résolu côté navigateur.
    env.HCAPTCHA_SECRET = 'test-hcaptcha-secret';
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('hcaptcha.com/siteverify')) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      if (url.includes('/charges')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'intent_guest_nocap',
              paymentUrl: 'https://pay.bictorys.com/intent_guest_nocap',
              status: 'opened',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = await buildApp();
    try {
      // 1. Order online AVEC un token valide (siteverify success).
      const orderRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/orders',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: guestOrderBody({ paymentMethod: 'online', hcaptchaToken: 'good-token' }),
      });
      expect(orderRes.statusCode).toBe(201);
      const orderId = (orderRes.json() as { id: string }).id;

      // 2. Intent SANS aucun token → accepté (route exemptée de captcha).
      const intentRes = await app.inject({
        method: 'POST',
        url: '/v1/guest/payments/intents',
        headers: { 'x-idempotency-key': randomUUID() },
        payload: { orderId, guestPhoneNumber: GUEST_PHONE },
      });
      expect(intentRes.statusCode).toBe(201);
      expect((intentRes.json() as { providerIntentId: string }).providerIntentId).toBe(
        'intent_guest_nocap',
      );
    } finally {
      await app.close();
    }
  });
});
