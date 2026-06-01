import type { Offer, ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { orderService } from '../../orders/index.js';
import { pricingService } from '../../pricing/index.js';
import { producerService } from '../producer-service.js';

/**
 * Test d'intégration · notation producteur (Lot 9) sur vraie Postgres.
 *
 * Vérifie (CLAUDE.md §G6) :
 *  1. Un client note un producteur sur une commande LIVRÉE → moyenne agrégée
 *     correctement (getByIdAdmin.ratingAvg / ratingCount).
 *  2. Refus CONFLICT si la commande n'est pas livrée.
 *  3. Refus FORBIDDEN si l'acteur n'est pas le propriétaire de la commande.
 *  4. Refus VALIDATION si le producteur n'est pas dans la commande.
 *  5. Refus CONFLICT sur doublon (unique (orderId, producerUserId)).
 *  Audit `producer.rating.create` écrit.
 *  6. listRatings : avis joints (n° commande + nom client), liste vide sinon.
 */

const ZONE_SLUG = 'ratings-test-pout';

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
    create: { slug: ZONE_SLUG, name: 'Pout (ratings test)', region: 'Thiès' },
  });
  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:ratings:admin',
      displayName: 'Admin R',
      role: 'admin',
      phone: '+221770000050',
    },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:ratings:producer',
      displayName: 'Mor R',
      role: 'producer',
      phone: '+221770000051',
    },
  });
  client = await prisma.user.create({
    data: {
      keycloakId: 'integ:ratings:client',
      displayName: 'Resto R',
      role: 'client_pro',
      phone: '+221770000052',
    },
  });
  profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout ratings',
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
  await prisma.producerRating.deleteMany({ where: { producerUserId: producer.id } });
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({ where: { clientUserId: client.id } });
  await prisma.pricingSnapshot.deleteMany({ where: { pricingRule: { categorySlug: 'poultry' } } });
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

async function createOffer(): Promise<Offer> {
  return prisma.offer.create({
    data: {
      producerUserId: profile.userId,
      siteId: site.id,
      categorySlug: 'poultry',
      status: 'validated',
      title: `Poulet ratings ${Date.now()}-${Math.random()}`,
      unit: 'unit',
      quantity: 100,
      priceFcfa: 3000,
      availableFrom: new Date('2026-05-30'),
    },
  });
}

/** Crée une commande du `client` et la fait passer jusqu'à `delivered`. */
async function deliveredOrderId(): Promise<string> {
  const offer = await createOffer();
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
  for (const to of [
    'confirmed',
    'collecting',
    'collected',
    'stored',
    'delivering',
    'delivered',
  ] as const) {
    await orderService.transitionStatus({ actorUserId: admin.id, orderId: order.id, to });
  }
  return order.id;
}

describe('producerService.createRating · notation post-livraison', () => {
  it('note un producteur sur une commande livrée et agrège la moyenne', async () => {
    const orderId = await deliveredOrderId();
    await producerService.createRating({
      actorUserId: client.id,
      producerUserId: producer.id,
      input: { orderId, stars: 4, comment: 'Très bon poulet' },
    });

    const detail = await producerService.getByIdAdmin(producer.id);
    expect(detail.ratingCount).toBe(1);
    expect(detail.ratingAvg).toBe(4);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'producer.rating.create', targetId: producer.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(client.id);

    // Une 2e commande livrée, note 2 → moyenne (4+2)/2 = 3, count 2.
    const orderId2 = await deliveredOrderId();
    await producerService.createRating({
      actorUserId: client.id,
      producerUserId: producer.id,
      input: { orderId: orderId2, stars: 2 },
    });
    const detail2 = await producerService.getByIdAdmin(producer.id);
    expect(detail2.ratingCount).toBe(2);
    expect(detail2.ratingAvg).toBe(3);
  });

  it('refuse (CONFLICT) si la commande n’est pas livrée', async () => {
    const offer = await createOffer();
    const order = await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 1 }],
        delivery: {
          zoneId: zone.id,
          addressLine: 'X',
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
    await expect(
      producerService.createRating({
        actorUserId: client.id,
        producerUserId: producer.id,
        input: { orderId: order.id, stars: 5 },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuse (FORBIDDEN) si l’acteur n’est pas le propriétaire', async () => {
    const orderId = await deliveredOrderId();
    await expect(
      producerService.createRating({
        actorUserId: admin.id, // pas le client propriétaire
        producerUserId: producer.id,
        input: { orderId, stars: 5 },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuse (VALIDATION) si le producteur n’est pas dans la commande', async () => {
    const orderId = await deliveredOrderId();
    await expect(
      producerService.createRating({
        actorUserId: client.id,
        producerUserId: admin.id, // pas un producteur de la commande
        input: { orderId, stars: 5 },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuse (CONFLICT) une 2e note du même producteur sur la même commande', async () => {
    const orderId = await deliveredOrderId();
    await producerService.createRating({
      actorUserId: client.id,
      producerUserId: producer.id,
      input: { orderId, stars: 5 },
    });
    await expect(
      producerService.createRating({
        actorUserId: client.id,
        producerUserId: producer.id,
        input: { orderId, stars: 3 },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('producerService.listRatings · détail admin', () => {
  it('liste les avis avec n° commande + nom client', async () => {
    const orderId1 = await deliveredOrderId();
    await producerService.createRating({
      actorUserId: client.id,
      producerUserId: producer.id,
      input: { orderId: orderId1, stars: 5, comment: 'Parfait' },
    });
    const orderId2 = await deliveredOrderId();
    await producerService.createRating({
      actorUserId: client.id,
      producerUserId: producer.id,
      input: { orderId: orderId2, stars: 3 },
    });

    const { ratings } = await producerService.listRatings(producer.id);
    expect(ratings).toHaveLength(2);
    // On retrouve les items par orderId (pas d'assertion d'ordre sur des inserts
    // quasi simultanés, pour éviter le flaky — cf. CLAUDE.md §G6).
    const r1 = ratings.find((r) => r.orderId === orderId1);
    const r2 = ratings.find((r) => r.orderId === orderId2);
    expect(r1?.stars).toBe(5);
    expect(r1?.comment).toBe('Parfait');
    expect(r1?.clientDisplayName).toBe('Resto R');
    expect(r1?.orderNumber).toMatch(/^CMD-/);
    expect(r2?.stars).toBe(3);
    expect(r2?.comment).toBeNull();
  });

  it('retourne une liste vide si aucun avis', async () => {
    const { ratings } = await producerService.listRatings(producer.id);
    expect(ratings).toEqual([]);
  });
});
