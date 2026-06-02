import type { Offer, Order, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '../../../lib/crypto.js';
import { prisma } from '../../../lib/prisma.js';
import { orderService } from '../../orders/order-service.js';
import { pricingService } from '../../pricing/index.js';
import { payoutService } from '../payout-service.js';

/**
 * Test d'intégration · payouts Lot 5 sur vraie Postgres + fetch mocké.
 *
 * Vérifie :
 *  1. computePending sans items éligibles → empty
 *  2. computePending avec items déjà couverts → exclus
 *  3. computePending agrégation multi-producer
 *  4. triggerPayout flow complet : row + payout_items + audit
 *  5. triggerPayout sans bank_details → CONFLICT
 *  6. triggerPayout re-call après premier succès → CONFLICT (rien à reverser)
 *  7. computePending exclut bien les items couverts (vérifie UNIQUE order_item_id)
 *
 * Référence : CLAUDE.md §G4 (bank_details), §G6, ARCHITECTURE.md §7.
 */

const ZONE_SLUG = 'payouts-test-pout';

let admin: User;
let producerA: User;
let producerB: User;
let client: User;
let zone: Zone;
let siteA: ProductionSite;
let siteB: ProductionSite;
let offerA: Offer;
let offerB: Offer;

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (payouts test)', region: 'Thiès' },
  });

  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:payouts:admin',
      displayName: 'Admin Payouts',
      role: 'admin',
      phone: '+221770000040',
    },
  });
  producerA = await prisma.user.create({
    data: {
      keycloakId: 'integ:payouts:producerA',
      displayName: 'Mor (payouts A)',
      role: 'producer',
      phone: '+221770000041',
    },
  });
  producerB = await prisma.user.create({
    data: {
      keycloakId: 'integ:payouts:producerB',
      displayName: 'Fatou (payouts B)',
      role: 'producer',
      phone: '+221770000042',
    },
  });
  client = await prisma.user.create({
    data: {
      keycloakId: 'integ:payouts:client',
      displayName: 'Resto Payouts',
      role: 'client_pro',
      phone: '+221770000043',
    },
  });

  await prisma.producerProfile.create({
    data: {
      userId: producerA.id,
      type: 'poultry',
      status: 'validated',
      zoneId: zone.id,
      bankDetails: encrypt(
        JSON.stringify({
          holder: 'MOR DIOP',
          iban: 'SN08SN0100152000048500000056',
          bic: 'CBAOSNDA',
          bankName: 'CBAO',
        }),
      ),
    },
  });
  // ProducerB intentionnellement sans bank_details → triggerPayout doit CONFLICT.
  await prisma.producerProfile.create({
    data: {
      userId: producerB.id,
      type: 'poultry',
      status: 'validated',
      zoneId: zone.id,
    },
  });

  siteA = await prisma.productionSite.create({
    data: {
      producerUserId: producerA.id,
      name: 'Site A',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });
  siteB = await prisma.productionSite.create({
    data: {
      producerUserId: producerB.id,
      name: 'Site B',
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
  offerA = await prisma.offer.create({
    data: {
      producerUserId: producerA.id,
      siteId: siteA.id,
      categorySlug: 'poultry',
      status: 'validated',
      title: 'Poulet A',
      unit: 'unit',
      quantity: 10,
      quantityReserved: 0,
      priceFcfa: 3_000,
      availableFrom: new Date(),
    },
  });
  offerB = await prisma.offer.create({
    data: {
      producerUserId: producerB.id,
      siteId: siteB.id,
      categorySlug: 'poultry',
      status: 'validated',
      title: 'Poulet B',
      unit: 'unit',
      quantity: 10,
      quantityReserved: 0,
      priceFcfa: 5_000,
      availableFrom: new Date(),
    },
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.payoutItem.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.outboxEvent.deleteMany({});
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [admin.id, client.id, producerA.id, producerB.id] } },
  });
  await prisma.payment.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.pricingSnapshot.deleteMany({});
  await prisma.offer.deleteMany({ where: { siteId: { in: [siteA.id, siteB.id] } } });
});

afterAll(async () => {
  await prisma.pricingRule.deleteMany({});
  await prisma.productionSite.deleteMany({ where: { id: { in: [siteA.id, siteB.id] } } });
  await prisma.producerProfile.deleteMany({
    where: { userId: { in: [producerA.id, producerB.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, client.id, producerA.id, producerB.id] } },
  });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
});

/**
 * Crée un order livré et payé, prêt à être reversé.
 * `producerOffers` : tableaux d'offres × quantité pour mixer plusieurs producteurs.
 */
async function createDeliveredPaidOrder(
  items: { offerId: string; quantity: number }[],
): Promise<Order> {
  const result = await orderService.create({
    clientUserId: client.id,
    input: {
      items,
      delivery: {
        zoneId: zone.id,
        addressLine: 'Almadies',
        slotDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        slotPeriod: 'morning',
      },
    },
  });
  const orderId = result.id;
  // Transition jusqu'à delivered (cycle 4 états).
  await orderService.transitionStatus({ actorUserId: admin.id, orderId, to: 'confirmed' });
  await orderService.transitionStatus({ actorUserId: admin.id, orderId, to: 'delivering' });
  await orderService.transitionStatus({ actorUserId: admin.id, orderId, to: 'delivered' });
  // Fixe payment_status à 'paid' (sans payment row : le compute filtre sur l'enum).
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'paid' },
  });
  const row = await prisma.order.findUnique({ where: { id: orderId } });
  if (!row) throw new Error('order disappeared');
  return row;
}

function mockBictorysDisbursement(
  override: { id?: string; status?: string; fail?: boolean } = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/payouts')) {
      if (override.fail) return new Response('boom', { status: 500 });
      return new Response(
        JSON.stringify({
          id: override.id ?? `disb_${Date.now()}`,
          status: override.status ?? 'sent',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('payoutService.computePending', () => {
  it('retourne empty quand aucun item delivered+paid', async () => {
    const result = await payoutService.computePending();
    expect(result.summaries).toEqual([]);
    expect(result.totalAmountFcfa).toBe(0);
    expect(result.producerCount).toBe(0);
  });

  it('agrège par producteur (multi-producer dans une commande)', async () => {
    await createDeliveredPaidOrder([
      { offerId: offerA.id, quantity: 2 }, // producerA : 2 × 3000 = 6000 (producer_share)
      { offerId: offerB.id, quantity: 1 }, // producerB : 1 × 5000 = 5000
    ]);

    const result = await payoutService.computePending();
    expect(result.producerCount).toBe(2);

    const sumA = result.summaries.find((s) => s.producerUserId === producerA.id);
    const sumB = result.summaries.find((s) => s.producerUserId === producerB.id);
    expect(sumA?.amountFcfa).toBe(6_000);
    expect(sumA?.orderItemIds.length).toBe(1);
    expect(sumB?.amountFcfa).toBe(5_000);
  });

  it('exclut les items déjà couverts par un payout existant', async () => {
    await createDeliveredPaidOrder([{ offerId: offerA.id, quantity: 1 }]);
    mockBictorysDisbursement({});

    // Premier trigger couvre l'item.
    await payoutService.triggerPayout({
      actorUserId: admin.id,
      producerUserId: producerA.id,
    });

    // computePending ne doit plus retourner cet item pour producerA.
    const result = await payoutService.computePending();
    const sumA = result.summaries.find((s) => s.producerUserId === producerA.id);
    expect(sumA).toBeUndefined();
  });
});

describe('payoutService.triggerPayout', () => {
  it('flow complet : disbursement + row payout + payout_items + audit', async () => {
    await createDeliveredPaidOrder([{ offerId: offerA.id, quantity: 2 }]); // 6000 F
    const fetchMock = mockBictorysDisbursement({ id: 'disb_test_42', status: 'sent' });

    const payout = await payoutService.triggerPayout({
      actorUserId: admin.id,
      producerUserId: producerA.id,
    });

    expect(payout.amountFcfa).toBe(6_000);
    expect(payout.status).toBe('sent');
    expect(payout.providerDisbursementId).toBe('disb_test_42');
    expect(payout.coveredOrderItemIds.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();

    // payout_items créé pour cet item, unique sur order_item_id.
    const items = await prisma.payoutItem.findMany({ where: { payoutId: payout.id } });
    expect(items.length).toBe(1);

    // Audit log écrit.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payout.trigger', targetId: payout.id },
    });
    expect(audit).not.toBeNull();
    // bank_details ne doivent JAMAIS apparaître dans audit.newValue (CLAUDE.md §G4).
    expect(JSON.stringify(audit?.newValue)).not.toContain('SN08SN');
    expect(JSON.stringify(audit?.newValue)).not.toContain('MOR DIOP');
  });

  it('CONFLICT si bank_details manquant', async () => {
    await createDeliveredPaidOrder([{ offerId: offerB.id, quantity: 1 }]); // producerB sans bank
    mockBictorysDisbursement({});

    await expect(
      payoutService.triggerPayout({
        actorUserId: admin.id,
        producerUserId: producerB.id,
      }),
    ).rejects.toThrow(/Coordonn[ée]es bancaires manquantes/i);
  });

  it('CONFLICT si rien à reverser (re-call après succès)', async () => {
    await createDeliveredPaidOrder([{ offerId: offerA.id, quantity: 1 }]);
    mockBictorysDisbursement({});

    await payoutService.triggerPayout({
      actorUserId: admin.id,
      producerUserId: producerA.id,
    });

    // 2e appel : plus d'items éligibles → CONFLICT
    await expect(
      payoutService.triggerPayout({
        actorUserId: admin.id,
        producerUserId: producerA.id,
      }),
    ).rejects.toThrow(/Aucun montant à reverser/i);
  });

  it('échec Bictorys → row payout status=failed + audit', async () => {
    await createDeliveredPaidOrder([{ offerId: offerA.id, quantity: 1 }]);
    mockBictorysDisbursement({ fail: true });

    await expect(
      payoutService.triggerPayout({
        actorUserId: admin.id,
        producerUserId: producerA.id,
      }),
    ).rejects.toThrow(/Disbursement Bictorys échoué/);

    // Une row payout status='failed' est persistée pour traçabilité.
    const failedRow = await prisma.payout.findFirst({
      where: { producerUserId: producerA.id, status: 'failed' },
    });
    expect(failedRow).not.toBeNull();
    expect(failedRow?.failureReason).toBeTruthy();
  });

  it('triggerAllPending : itère sur tous les producteurs avec pending', async () => {
    await createDeliveredPaidOrder([
      { offerId: offerA.id, quantity: 1 }, // producerA OK (a bank)
      { offerId: offerB.id, quantity: 1 }, // producerB sans bank → 1 fail
    ]);
    mockBictorysDisbursement({});

    const result = await payoutService.triggerAllPending({ actorUserId: admin.id });
    expect(result.triggered).toBe(1);
    expect(result.failed).toBe(1);
  });
});
