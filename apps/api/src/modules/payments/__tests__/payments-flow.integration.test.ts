import { createHmac } from 'node:crypto';
import type { Offer, Order, ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { orderService } from '../../orders/order-service.js';
import { pricingService } from '../../pricing/index.js';
import { paymentService } from '../payment-service.js';

/**
 * Test d'intégration · payments Lot 5 sur vraie Postgres + fetch mocké.
 *
 * Vérifie :
 *  1. createCheckoutSession : insère row + audit + paymentUrl renvoyé
 *  2. processWebhook signature invalide → kind='signature_invalid'
 *  3. processWebhook paid → order confirmed + payment paid + outbox event + audit
 *  4. processWebhook duplicate (replay) → kind='duplicate' no-op
 *  5. processWebhook unknown_intent → kind='unknown_intent'
 *  6. processWebhook paid AFTER cancel → kind='refunded_after_cancel', payment refunded
 *
 * Référence : CLAUDE.md §G5 + §G6 + ARCHITECTURE.md §7.
 */

const ZONE_SLUG = 'payments-test-pout';
const WEBHOOK_SECRET = 'test-webhook-secret-32chars-min!'; // doit matcher integration-setup.ts

let admin: User;
let producer: User;
let client: User;
let zone: Zone;
let profile: ProducerProfile;
let site: ProductionSite;
let offer: Offer;

function signWebhook(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (payments test)', region: 'Thiès' },
  });

  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:payments:admin',
      displayName: 'Admin Payments',
      role: 'admin',
      phone: '+221770000030',
    },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:payments:producer',
      displayName: 'Mor Diop (payments)',
      role: 'producer',
      phone: '+221770000031',
    },
  });
  client = await prisma.user.create({
    data: {
      keycloakId: 'integ:payments:client',
      displayName: 'Resto Payments',
      role: 'client_pro',
      phone: '+221770000032',
    },
  });

  profile = await prisma.producerProfile.create({
    data: {
      userId: producer.id,
      type: 'poultry',
      status: 'validated',
      zoneId: zone.id,
    },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout payments-test',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });

  await pricingService.createRule(admin.id, {
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
  // Recrée une offre fraîche par test pour avoir un stock prévisible.
  offer = await prisma.offer.create({
    data: {
      producerUserId: producer.id,
      siteId: site.id,
      category: 'poultry',
      status: 'validated',
      title: 'Poulet test paiement',
      unit: 'unit',
      quantity: 10,
      quantityReserved: 0,
      priceFcfa: 3_000,
      availableFrom: new Date(),
    },
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  // Ordre wipe (FK) : payout_items → payouts → outbox → audit → payments → order_items → orders → snapshots → offer
  await prisma.payoutItem.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.outboxEvent.deleteMany({});
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [admin.id, client.id, producer.id] } },
  });
  await prisma.payment.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.pricingSnapshot.deleteMany({});
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
});

afterAll(async () => {
  await prisma.pricingRule.deleteMany({});
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, client.id, producer.id] } },
  });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
});

async function createOrder(): Promise<Order> {
  const result = await orderService.create({
    clientUserId: client.id,
    input: {
      items: [{ offerId: offer.id, quantity: 1 }],
      delivery: {
        zoneId: zone.id,
        addressLine: 'Almadies test',
        slotDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        slotPeriod: 'morning',
      },
    },
  });
  // Re-fetch en Order (Prisma row, pas l'output schema).
  const row = await prisma.order.findUnique({ where: { id: result.id } });
  if (!row) throw new Error('order disappeared');
  return row;
}

// Mock fetch pour les appels sortants Bictorys.
function mockBictorysFetch(opts: {
  createIntent?: { id?: string; paymentUrl?: string; status?: string };
  failCreate?: boolean;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/charges') && !url.match(/\/charges\/[^/]+$/)) {
      if (opts.failCreate) {
        return new Response('boom', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          id: opts.createIntent?.id ?? 'intent_test_123',
          paymentUrl: opts.createIntent?.paymentUrl ?? 'https://pay.bictorys.com/intent_test_123',
          status: opts.createIntent?.status ?? 'opened',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('paymentService.createCheckoutSession', () => {
  it('crée un payment intent + audit + retourne paymentUrl', async () => {
    const order = await createOrder();
    const fetchMock = mockBictorysFetch({});

    const result = await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });

    expect(result.paymentUrl).toMatch(/^https:\/\//);
    expect(result.providerIntentId).toBe('intent_test_123');
    expect(fetchMock).toHaveBeenCalledOnce();

    const row = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(row?.status).toBe('pending');
    expect(row?.providerIntentId).toBe('intent_test_123');
    expect(row?.amountFcfa).toBe(order.totalFcfa);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.intent_created', targetId: row?.id },
    });
    expect(audit).not.toBeNull();
  });

  it('refuse si order.status !== created', async () => {
    const order = await createOrder();
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'test' },
    });
    mockBictorysFetch({});

    await expect(
      paymentService.createCheckoutSession({ actorUserId: client.id, orderId: order.id }),
    ).rejects.toThrow(/statut cancelled/);
  });

  it('idempotent : retourne le même paymentUrl si row payment pending existe déjà', async () => {
    const order = await createOrder();
    mockBictorysFetch({});
    const first = await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });
    // 2e appel : pas de nouveau fetch attendu (lookup payment existant suffit).
    vi.clearAllMocks();
    const second = await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });
    expect(second.paymentId).toBe(first.paymentId);
    expect(second.providerIntentId).toBe(first.providerIntentId);
  });
});

describe('paymentService.processWebhook', () => {
  it('signature invalide → kind=signature_invalid', async () => {
    const order = await createOrder();
    mockBictorysFetch({});
    await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });

    const body = JSON.stringify({ id: 'intent_test_123', status: 'paid' });
    const outcome = await paymentService.processWebhook({
      rawBody: body,
      signatureHeader: 'bogus-signature',
    });
    expect(outcome.kind).toBe('signature_invalid');

    // L'order ne doit PAS avoir été confirmé.
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row?.status).toBe('created');
  });

  it('paid valide → order confirmed + payment paid + outbox event + audit', async () => {
    const order = await createOrder();
    mockBictorysFetch({});
    await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });

    const body = JSON.stringify({
      id: 'intent_test_123',
      status: 'paid',
      paymentMethod: 'wave',
      customer: { name: 'Test Client', phone: '+221701234567' },
    });
    const outcome = await paymentService.processWebhook({
      rawBody: body,
      signatureHeader: signWebhook(body),
    });
    expect(outcome.kind).toBe('updated');
    if (outcome.kind === 'updated') expect(outcome.newStatus).toBe('paid');

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe('confirmed');
    expect(updatedOrder?.paymentStatus).toBe('paid');
    expect(updatedOrder?.confirmedAt).not.toBeNull();

    const updatedPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(updatedPayment?.status).toBe('paid');
    expect(updatedPayment?.paidAt).not.toBeNull();
    expect(updatedPayment?.paymentMethod).toBe('wave');

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'order.confirmed' },
    });
    expect(outbox).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.received', targetId: updatedPayment?.id },
    });
    expect(audit).not.toBeNull();
  });

  it('webhook duplicate (replay) → kind=duplicate, no-op', async () => {
    const order = await createOrder();
    mockBictorysFetch({});
    await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });
    const body = JSON.stringify({ id: 'intent_test_123', status: 'paid' });
    const sig = signWebhook(body);
    const first = await paymentService.processWebhook({ rawBody: body, signatureHeader: sig });
    expect(first.kind).toBe('updated');

    const second = await paymentService.processWebhook({ rawBody: body, signatureHeader: sig });
    expect(second.kind).toBe('duplicate');

    // L'audit ne doit pas avoir été dupliqué.
    const audits = await prisma.auditLog.findMany({
      where: { action: 'payment.received' },
    });
    expect(audits.length).toBe(1);
  });

  it('webhook unknown_intent → kind=unknown_intent (200 vers Bictorys pour éviter retry)', async () => {
    const body = JSON.stringify({ id: 'intent_ghost', status: 'paid' });
    const outcome = await paymentService.processWebhook({
      rawBody: body,
      signatureHeader: signWebhook(body),
    });
    expect(outcome.kind).toBe('unknown_intent');
  });

  it('webhook paid après cancel order → kind=refunded_after_cancel, payment refunded', async () => {
    const order = await createOrder();
    mockBictorysFetch({});
    await paymentService.createCheckoutSession({
      actorUserId: client.id,
      orderId: order.id,
    });
    // Cancel l'order côté MATA (avant que le webhook arrive).
    await orderService.cancel({
      actorUserId: client.id,
      orderId: order.id,
      input: { reason: 'test cancel' },
    });

    const body = JSON.stringify({ id: 'intent_test_123', status: 'paid' });
    const outcome = await paymentService.processWebhook({
      rawBody: body,
      signatureHeader: signWebhook(body),
    });
    expect(outcome.kind).toBe('refunded_after_cancel');

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe('cancelled');
    expect(updatedOrder?.paymentStatus).toBe('refunded');

    const updatedPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(updatedPayment?.status).toBe('refunded');
    expect(updatedPayment?.refundedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.refunded', targetId: updatedPayment?.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.newValue).toMatchObject({ reason: 'paid_after_cancel' });
  });
});
