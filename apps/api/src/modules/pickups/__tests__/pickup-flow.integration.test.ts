import type { Offer, ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { notificationService } from '../../notifications/index.js';
import { orderService } from '../../orders/index.js';
import { pricingService } from '../../pricing/index.js';
import { generatePickupNumber } from '../pickup-numbering.js';
import { pickupService } from '../pickup-service.js';

/**
 * Test d'intégration · flow pickups (tournées de collecte) sur vraie Postgres.
 *
 * Vérifie (CLAUDE.md §G3 + §G4 + §G6) :
 *  1. Création atomique : pickup + pickup_items + outbox `pickup.scheduled`,
 *     audit `pickup.create`, numérotation PKP-YYYY-NNNN.
 *  2. Items éligibles : commande `confirmed` ET pas déjà rattachés (CONFLICT).
 *  3. State machine : scheduled → to_confirm → confirmed → collecting →
 *     collected ; `collecting` émet l'outbox `pickup.confirmed` + audit.
 *  4. Cochage item pendant `collecting` (+ audit), refusé hors `collecting`.
 *  5. Cancel : libère les items (re-affectables), pickup conservé `cancelled`,
 *     audit `pickup.cancel`.
 *  6. `cancelled` interdit via transitionStatus générique (route dédiée).
 *  7. Lecture producteur : exclut les annulées, filtre sur ses items.
 */

const ZONE_SLUG = 'pickups-test-pout';

let admin: User;
let producer: User;
let client: User;
let zone: Zone;
let profile: ProducerProfile;
let site: ProductionSite;

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (pickups test)', region: 'Thiès' },
  });

  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:pickups:admin',
      displayName: 'Admin Pickups',
      role: 'admin',
      phone: '+221770000040',
    },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:pickups:producer',
      displayName: 'Mor Diop (pickups)',
      role: 'producer',
      phone: '+221770000041',
    },
  });
  client = await prisma.user.create({
    data: {
      keycloakId: 'integ:pickups:client',
      displayName: 'Resto Pickups',
      role: 'client_pro',
      phone: '+221770000042',
    },
  });

  profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout pickups-test',
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
    safetyMarginPct: 3,
    safetyMarginBase: 'producer_price',
    collectionFcfa: 120,
    deliveryFcfa: 200,
    storageFcfa: 50,
    discountFcfa: 0,
  });
});

afterEach(async () => {
  await prisma.pickupItem.deleteMany({});
  await prisma.pickup.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({ where: { clientUserId: client.id } });
  await prisma.pricingSnapshot.deleteMany({ where: { pricingRule: { categorySlug: 'poultry' } } });
  await prisma.outboxEvent.deleteMany({ where: { eventType: { startsWith: 'pickup.' } } });
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [admin.id, client.id, producer.id] } },
  });
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
});

afterAll(async () => {
  await prisma.pricingRule.deleteMany({});
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, producer.id, client.id] } } });
  await prisma.zone.delete({ where: { id: zone.id } });
  await prisma.$disconnect();
});

async function createOffer(args: { qty: number; price: number }): Promise<Offer> {
  return prisma.offer.create({
    data: {
      producerUserId: profile.userId,
      siteId: site.id,
      categorySlug: 'poultry',
      status: 'validated',
      title: `Poulet pickups ${Date.now()}-${Math.random()}`,
      unit: 'unit',
      quantity: args.qty,
      priceFcfa: args.price,
      availableFrom: new Date('2026-05-30'),
    },
  });
}

/**
 * Crée une commande, la passe en `confirmed` (items collectables) et retourne
 * l'id du premier order_item — l'unité de base d'une tournée de collecte.
 */
async function makeConfirmedOrderItem(): Promise<string> {
  const offer = await createOffer({ qty: 100, price: 3000 });
  const order = await orderService.create({
    clientUserId: client.id,
    input: {
      items: [{ offerId: offer.id, quantity: 3 }],
      delivery: {
        zoneId: zone.id,
        addressLine: 'Almadies',
        slotDate: '2026-06-15',
        slotPeriod: 'morning',
      },
    },
  });
  await orderService.transitionStatus({
    actorUserId: admin.id,
    orderId: order.id,
    to: 'confirmed',
  });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  return orderItem.id;
}

describe('Pickup flow · création + outbox + audit', () => {
  it('crée une tournée, rattache les items, émet outbox + audit', async () => {
    const orderItemId = await makeConfirmedOrderItem();

    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    expect(pickup.pickupNumber).toMatch(/^PKP-\d{4}-\d{4}$/);
    expect(pickup.status).toBe('scheduled');
    expect(pickup.zoneName).toBe('Pout (pickups test)');
    expect(pickup.items).toHaveLength(1);
    expect(pickup.items[0]?.orderItemId).toBe(orderItemId);
    expect(pickup.items[0]?.collected).toBe(false);

    const outbox = await prisma.outboxEvent.findFirst({ where: { eventType: 'pickup.scheduled' } });
    expect(outbox).not.toBeNull();
    const payload = outbox?.payload as { pickupId: string; orderItemIds: string[] };
    expect(payload.pickupId).toBe(pickup.id);
    expect(payload.orderItemIds).toEqual([orderItemId]);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'pickup.create', targetId: pickup.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(admin.id);
  });

  it('refuse 404 si la zone est inconnue', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    await expect(
      pickupService.createPickup({
        actorUserId: admin.id,
        input: {
          zoneId: '00000000-0000-0000-0000-000000000000',
          scheduledFor: '2026-06-10T08:00:00.000Z',
          scheduledPeriod: 'morning',
          orderItemIds: [orderItemId],
        },
      }),
    ).rejects.toThrow(/Zone de collecte introuvable/);
  });

  it("refuse 409 un item dont la commande n'est pas confirmed", async () => {
    const offer = await createOffer({ qty: 100, price: 3000 });
    const order = await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 2 }],
        delivery: {
          zoneId: zone.id,
          addressLine: 'Almadies',
          slotDate: '2026-06-15',
          slotPeriod: 'morning',
        },
      },
    });
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    await expect(
      pickupService.createPickup({
        actorUserId: admin.id,
        input: {
          zoneId: zone.id,
          scheduledFor: '2026-06-10T08:00:00.000Z',
          scheduledPeriod: 'morning',
          orderItemIds: [orderItem.id],
        },
      }),
    ).rejects.toThrow(/non collectable/);
  });

  it('refuse 409 un item déjà rattaché à une tournée', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    await expect(
      pickupService.createPickup({
        actorUserId: admin.id,
        input: {
          zoneId: zone.id,
          scheduledFor: '2026-06-11T08:00:00.000Z',
          scheduledPeriod: 'afternoon',
          orderItemIds: [orderItemId],
        },
      }),
    ).rejects.toThrow(/déjà rattaché/);
  });
});

describe('Pickup flow · state machine', () => {
  it('scheduled → to_confirm → confirmed → collecting (outbox) → collected', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    const t1 = await pickupService.transitionStatus({
      actorUserId: admin.id,
      pickupId: pickup.id,
      to: 'to_confirm',
    });
    expect(t1.status).toBe('to_confirm');

    const t2 = await pickupService.transitionStatus({
      actorUserId: admin.id,
      pickupId: pickup.id,
      to: 'confirmed',
    });
    expect(t2.status).toBe('confirmed');

    const t3 = await pickupService.transitionStatus({
      actorUserId: admin.id,
      pickupId: pickup.id,
      to: 'collecting',
    });
    expect(t3.status).toBe('collecting');

    // Outbox pickup.confirmed émis au passage en collecting.
    const confirmed = await prisma.outboxEvent.findFirst({
      where: { eventType: 'pickup.confirmed' },
    });
    expect(confirmed).not.toBeNull();
    expect((confirmed?.payload as { pickupId: string }).pickupId).toBe(pickup.id);

    const t4 = await pickupService.transitionStatus({
      actorUserId: admin.id,
      pickupId: pickup.id,
      to: 'collected',
    });
    expect(t4.status).toBe('collected');
    expect(t4.completedAt).not.toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { targetId: pickup.id, action: 'pickup.status_change' },
    });
    expect(audits).toHaveLength(4);
  });

  it('refuse 409 une transition invalide (scheduled → collected)', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });
    await expect(
      pickupService.transitionStatus({
        actorUserId: admin.id,
        pickupId: pickup.id,
        to: 'collected',
      }),
    ).rejects.toThrow(/Transition impossible/);
  });

  it("refuse 'cancelled' via transitionStatus générique (route dédiée)", async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });
    await expect(
      pickupService.transitionStatus({
        actorUserId: admin.id,
        pickupId: pickup.id,
        to: 'cancelled',
      }),
    ).rejects.toThrow(/POST \/v1\/pickups\/:id\/cancel/);
  });
});

describe('Pickup flow · cochage item', () => {
  it('coche un item pendant collecting + audit, refusé hors collecting', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });
    const itemId = pickup.items[0]?.id;
    if (!itemId) throw new Error('expected one pickup item');

    // Hors collecting → refusé.
    await expect(
      pickupService.checkItem({
        actorUserId: admin.id,
        pickupId: pickup.id,
        itemId,
        collected: true,
      }),
    ).rejects.toThrow(/collecting/);

    // Avance jusqu'à collecting.
    for (const to of ['to_confirm', 'confirmed', 'collecting'] as const) {
      await pickupService.transitionStatus({ actorUserId: admin.id, pickupId: pickup.id, to });
    }

    const checked = await pickupService.checkItem({
      actorUserId: admin.id,
      pickupId: pickup.id,
      itemId,
      collected: true,
      notes: 'OK',
    });
    expect(checked.items[0]?.collected).toBe(true);
    expect(checked.items[0]?.notes).toBe('OK');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'pickup.item_check', targetId: itemId },
    });
    expect(audit).not.toBeNull();
  });
});

describe('Pickup flow · cancel libère les items', () => {
  it('annule, supprime les pickup_items, item re-affectable + audit', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    const cancelled = await pickupService.cancelPickup({
      actorUserId: admin.id,
      pickupId: pickup.id,
      reason: 'Camion indisponible',
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('Camion indisponible');
    expect(cancelled.items).toHaveLength(0);

    // pickup_items réellement supprimés en base.
    const remaining = await prisma.pickupItem.count({ where: { pickupId: pickup.id } });
    expect(remaining).toBe(0);

    // L'item est re-affectable à une nouvelle tournée.
    const repicked = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-12T08:00:00.000Z',
        scheduledPeriod: 'afternoon',
        orderItemIds: [orderItemId],
      },
    });
    expect(repicked.items[0]?.orderItemId).toBe(orderItemId);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'pickup.cancel', targetId: pickup.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe('Pickup flow · push web producteur (hors chemin critique)', () => {
  it('notifie chaque producteur concerné à la création (pickup.scheduled)', async () => {
    const spy = vi.spyOn(notificationService, 'sendToUser');
    const orderItemId = await makeConfirmedOrderItem();

    await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      producer.id,
      expect.objectContaining({ category: 'pickup', url: '/producer/pickups' }),
    );
    spy.mockRestore();
  });

  it('notifie le producteur au démarrage de la collecte (collecting)', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    const spy = vi.spyOn(notificationService, 'sendToUser');
    for (const to of ['to_confirm', 'confirmed'] as const) {
      await pickupService.transitionStatus({ actorUserId: admin.id, pickupId: pickup.id, to });
    }
    // Ni to_confirm ni confirmed ne notifient.
    expect(spy).not.toHaveBeenCalled();

    await pickupService.transitionStatus({
      actorUserId: admin.id,
      pickupId: pickup.id,
      to: 'collecting',
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(producer.id, expect.objectContaining({ category: 'pickup' }));
    spy.mockRestore();
  });
});

describe('Pickup flow · lecture producteur + numérotation', () => {
  it('listForProducer filtre sur ses items et exclut les annulées', async () => {
    const oi1 = await makeConfirmedOrderItem();
    const oi2 = await makeConfirmedOrderItem();

    const active = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [oi1],
      },
    });
    const toCancel = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-11T08:00:00.000Z',
        scheduledPeriod: 'afternoon',
        orderItemIds: [oi2],
      },
    });
    await pickupService.cancelPickup({
      actorUserId: admin.id,
      pickupId: toCancel.id,
      reason: 'Test',
    });

    const list = await pickupService.listForProducer(producer.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(active.id);
  });

  it('génère des numéros séquentiels uniques PKP-YYYY-NNNN', async () => {
    const a = await generatePickupNumber(prisma);
    const b = await generatePickupNumber(prisma);
    expect(a).toMatch(/^PKP-\d{4}-\d{4}$/);
    expect(b).toMatch(/^PKP-\d{4}-\d{4}$/);
    expect(a).not.toBe(b);
  });
});

describe('Pickup flow · couplage commande ↔ tournée', () => {
  async function orderIdOf(orderItemId: string): Promise<string> {
    const oi = await prisma.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      select: { orderId: true },
    });
    return oi.orderId;
  }

  it('créer une tournée fait passer la commande confirmed → collecting (+ audit)', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const orderId = await orderIdOf(orderItemId);

    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('collecting');

    // Cible l'audit de la cascade (plusieurs order.status_change existent pour
    // cette commande : created→confirmed puis confirmed→collecting).
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'order.status_change',
        targetId: orderId,
        newValue: { path: ['status'], equals: 'collecting' },
      },
    });
    expect(audit).not.toBeNull();
    expect((audit?.newValue as { via: string }).via).toBe('pickup.create');
    expect((audit?.newValue as { pickupId: string }).pickupId).toBe(pickup.id);
  });

  it('tournée collected fait passer la commande collecting → collected', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const orderId = await orderIdOf(orderItemId);

    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });
    for (const to of ['to_confirm', 'confirmed', 'collecting', 'collected'] as const) {
      await pickupService.transitionStatus({ actorUserId: admin.id, pickupId: pickup.id, to });
    }

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('collected');
    expect(order.collectedAt).not.toBeNull();
  });

  it('annuler la tournée fait revenir la commande collecting → confirmed', async () => {
    const orderItemId = await makeConfirmedOrderItem();
    const orderId = await orderIdOf(orderItemId);

    const pickup = await pickupService.createPickup({
      actorUserId: admin.id,
      input: {
        zoneId: zone.id,
        scheduledFor: '2026-06-10T08:00:00.000Z',
        scheduledPeriod: 'morning',
        orderItemIds: [orderItemId],
      },
    });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'collecting',
    );

    await pickupService.cancelPickup({
      actorUserId: admin.id,
      pickupId: pickup.id,
      reason: 'Test',
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('confirmed');
  });
});
