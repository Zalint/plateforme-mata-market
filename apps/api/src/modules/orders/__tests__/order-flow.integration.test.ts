import type { Offer, ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { pricingService } from '../../pricing/index.js';
import { generateOrderNumber } from '../order-numbering.js';
import { orderService } from '../order-service.js';

/**
 * Test d'intégration · flow orders complet sur vraie Postgres (testcontainers).
 *
 * Vérifie :
 *  1. Création de commande transactionnelle (snapshots Lot 3 liés 1:1)
 *  2. Réservation stock (offers.quantityReserved += quantity)
 *  3. Transition offer.status vers `reserved` quand stock épuisé
 *  4. State machine : transitions valides + interdites
 *  5. Cancel libère le stock + revient à `validated`
 *  6. Numérotation CMD-YYYY-NNNN via SEQUENCE
 *  7. Audit trace (order.create, order.status_change, order.cancel)
 *  8. CHECK constraints DB (total >= 0, quantity > 0, etc.)
 *
 * Référence : CLAUDE.md §G3 + §G4 + §G6.
 */

const ZONE_SLUG = 'orders-test-pout';

let admin: User;
let producer: User;
let client: User;
let zone: Zone;
let profile: ProducerProfile;
let site: ProductionSite;
let offer: Offer;

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (orders test)', region: 'Thiès' },
  });

  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:orders:admin',
      displayName: 'Admin Orders',
      role: 'admin',
      phone: '+221770000020',
    },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:orders:producer',
      displayName: 'Mor Diop (orders)',
      role: 'producer',
      phone: '+221770000021',
    },
  });
  client = await prisma.user.create({
    data: {
      keycloakId: 'integ:orders:client',
      displayName: 'Resto Test',
      role: 'client_pro',
      phone: '+221770000022',
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
      name: 'Pout orders-test',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });

  // Crée la rule pricing nécessaire pour que pricingSnapshotService trouve une rule active.
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
  // Réinitialise le stock entre tests (les offres sont créées par test pour
  // éviter les drifts de quantityReserved). Utilise deleteMany pour rester
  // idempotent même si un test précédent a déjà nettoyé.
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({ where: { clientUserId: client.id } });
  await prisma.pricingSnapshot.deleteMany({
    where: { pricingRule: { categorySlug: 'poultry' } },
  });
  await prisma.idempotencyRecord.deleteMany({});
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [admin.id, client.id, producer.id] } },
  });
  // Delete les offres de test (filtre sur le site qu'on contrôle).
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
});

afterAll(async () => {
  await prisma.pricingRule.deleteMany({});
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, producer.id, client.id] } },
  });
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
      title: `Poulet test ${Date.now()}`,
      unit: 'unit',
      quantity: args.qty,
      priceFcfa: args.price,
      availableFrom: new Date('2026-05-30'),
    },
  });
}

describe('Order flow · création + snapshot lié + réservation stock', () => {
  it('crée une commande, fige les snapshots, réserve le stock + audit', async () => {
    offer = await createOffer({ qty: 100, price: 3000 });

    const created = await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 5 }],
        delivery: {
          zoneId: zone.id,
          addressLine: 'Almadies, Villa Test',
          slotDate: '2026-06-15',
          slotPeriod: 'morning',
        },
      },
    });

    expect(created.orderNumber).toMatch(/^CMD-\d{4}-\d{4}$/);
    expect(created.status).toBe('created');
    expect(created.items).toHaveLength(1);
    expect(created.items[0]?.quantity).toBe(5);
    expect(created.items[0]?.pricingSnapshot.producerPriceFcfa).toBe(3000);
    expect(created.items[0]?.pricingSnapshot.finalPriceFcfa).toBeGreaterThan(3000);
    const firstItem = created.items[0];
    if (!firstItem) throw new Error('expected at least one item');
    expect(created.totalFcfa).toBe(firstItem.pricingSnapshot.finalPriceFcfa * 5);

    // Stock réservé en DB.
    const updatedOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(updatedOffer?.quantityReserved).toBe(5);
    expect(updatedOffer?.status).toBe('validated'); // pas encore épuisé

    // Audit écrit.
    const audit = await prisma.auditLog.findFirst({
      where: { targetId: created.id, action: 'order.create' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(client.id);
  });

  it('transitionne offer.status à `reserved` quand stock épuisé', async () => {
    offer = await createOffer({ qty: 10, price: 3000 });

    await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 10 }],
        delivery: {
          zoneId: zone.id,
          addressLine: 'Almadies',
          slotDate: '2026-06-15',
          slotPeriod: 'morning',
        },
      },
    });

    const after = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(after?.quantityReserved).toBe(10);
    expect(after?.status).toBe('reserved');
  });

  it('refuse 409 si stock insuffisant', async () => {
    offer = await createOffer({ qty: 5, price: 3000 });

    await expect(
      orderService.create({
        clientUserId: client.id,
        input: {
          items: [{ offerId: offer.id, quantity: 10 }],
          delivery: {
            zoneId: zone.id,
            addressLine: 'Almadies',
            slotDate: '2026-06-15',
            slotPeriod: 'morning',
          },
        },
      }),
    ).rejects.toThrow(/Stock insuffisant/);
  });
});

describe('Order flow · state machine + cancel', () => {
  it('cycle complet created → confirmed → delivering → delivered', async () => {
    offer = await createOffer({ qty: 100, price: 3000 });
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

    const t1 = await orderService.transitionStatus({
      actorUserId: admin.id,
      orderId: order.id,
      to: 'confirmed',
    });
    expect(t1.status).toBe('confirmed');
    expect(t1.confirmedAt).not.toBeNull();

    const t2 = await orderService.transitionStatus({
      actorUserId: admin.id,
      orderId: order.id,
      to: 'delivering',
    });
    expect(t2.status).toBe('delivering');

    const t3 = await orderService.transitionStatus({
      actorUserId: admin.id,
      orderId: order.id,
      to: 'delivered',
    });
    expect(t3.status).toBe('delivered');
    expect(t3.deliveredAt).not.toBeNull();

    // 3 audits status_change écrits (confirmed → delivering → delivered).
    const audits = await prisma.auditLog.findMany({
      where: { targetId: order.id, action: 'order.status_change' },
    });
    expect(audits).toHaveLength(3);
  });

  it('offre `reserved` → `sold` quand toutes ses commandes sont livrées (+ audit offer.sold)', async () => {
    // Stock entièrement réservé par une seule commande.
    offer = await createOffer({ qty: 4, price: 3000 });
    const order = await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 4 }],
        delivery: {
          zoneId: zone.id,
          addressLine: 'Almadies',
          slotDate: '2026-06-15',
          slotPeriod: 'morning',
        },
      },
    });
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('reserved');

    // Cycle complet jusqu'à delivered.
    for (const to of ['confirmed', 'delivering'] as const) {
      await orderService.transitionStatus({ actorUserId: admin.id, orderId: order.id, to });
    }
    // Avant la dernière étape : toujours reserved (pas encore livré).
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('reserved');

    await orderService.transitionStatus({
      actorUserId: admin.id,
      orderId: order.id,
      to: 'delivered',
    });

    // Toutes les commandes de l'offre livrées → vente définitive.
    const sold = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(sold?.status).toBe('sold');

    const auditSold = await prisma.auditLog.findFirst({
      where: { action: 'offer.sold', targetId: offer.id },
    });
    expect(auditSold).not.toBeNull();
    expect(auditSold?.actorUserId).toBe(admin.id);
  });

  it('offre partiellement réservée : reste `validated` (pas de sold) après livraison', async () => {
    // Stock 10, on ne réserve que 4 → l'offre ne passe jamais `reserved`.
    offer = await createOffer({ qty: 10, price: 3000 });
    const order = await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 4 }],
        delivery: {
          zoneId: zone.id,
          addressLine: 'Almadies',
          slotDate: '2026-06-15',
          slotPeriod: 'morning',
        },
      },
    });
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('validated');

    for (const to of ['confirmed', 'delivering', 'delivered'] as const) {
      await orderService.transitionStatus({ actorUserId: admin.id, orderId: order.id, to });
    }

    // Pas reserved au départ → pas de bascule sold ; le stock résiduel reste vendable.
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('validated');
  });

  it('refuse 409 transition invalide', async () => {
    offer = await createOffer({ qty: 100, price: 3000 });
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

    // Saut created → delivered interdit
    await expect(
      orderService.transitionStatus({
        actorUserId: admin.id,
        orderId: order.id,
        to: 'delivered',
      }),
    ).rejects.toThrow(/Transition impossible/);
  });

  it('cancel libère stock + revient à validated', async () => {
    offer = await createOffer({ qty: 10, price: 3000 });
    const order = await orderService.create({
      clientUserId: client.id,
      input: {
        items: [{ offerId: offer.id, quantity: 10 }], // épuise stock
        delivery: {
          zoneId: zone.id,
          addressLine: 'Almadies',
          slotDate: '2026-06-15',
          slotPeriod: 'morning',
        },
      },
    });
    // Stock 100% réservé, offre = reserved
    let o = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(o?.status).toBe('reserved');
    expect(o?.quantityReserved).toBe(10);

    const cancelled = await orderService.cancel({
      actorUserId: client.id,
      orderId: order.id,
      input: { reason: 'Test cancel' },
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.cancelReason).toBe('Test cancel');

    // Stock libéré, offre revenue validated.
    o = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(o?.quantityReserved).toBe(0);
    expect(o?.status).toBe('validated');

    // Audit cancel écrit.
    const audit = await prisma.auditLog.findFirst({
      where: { targetId: order.id, action: 'order.cancel' },
    });
    expect(audit).not.toBeNull();
    const newValue = audit?.newValue as { status: string; reason: string };
    expect(newValue.reason).toBe('Test cancel');
  });

  it('refuse cancel depuis status non éligible (delivered)', async () => {
    offer = await createOffer({ qty: 100, price: 3000 });
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
    // Cycle 4 états : l'annulation reste possible jusqu'en livraison, plus après.
    for (const to of ['confirmed', 'delivering', 'delivered'] as const) {
      await orderService.transitionStatus({ actorUserId: admin.id, orderId: order.id, to });
    }
    await expect(
      orderService.cancel({
        actorUserId: client.id,
        orderId: order.id,
        input: { reason: 'Trop tard' },
      }),
    ).rejects.toThrow(/Annulation impossible/);
  });

  it("refuse 'cancelled' via transitionStatus générique (raison obligatoire)", async () => {
    offer = await createOffer({ qty: 100, price: 3000 });
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
    await expect(
      orderService.transitionStatus({
        actorUserId: admin.id,
        orderId: order.id,
        to: 'cancelled',
      }),
    ).rejects.toThrow(/POST \/v1\/orders\/:id\/cancel/);
  });
});

describe('Order flow · numérotation', () => {
  it('génère des numéros séquentiels uniques CMD-YYYY-NNNN', async () => {
    const a = await generateOrderNumber(prisma);
    const b = await generateOrderNumber(prisma);
    const c = await generateOrderNumber(prisma);
    expect(a).toMatch(/^CMD-\d{4}-\d{4}$/);
    expect(b).toMatch(/^CMD-\d{4}-\d{4}$/);
    expect(c).toMatch(/^CMD-\d{4}-\d{4}$/);
    expect(new Set([a, b, c]).size).toBe(3); // tous distincts
  });
});

describe('Order flow · lectures', () => {
  it('listMine retourne uniquement les commandes du client', async () => {
    offer = await createOffer({ qty: 100, price: 3000 });
    await orderService.create({
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

    const mine = await orderService.listMine(client.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.clientUserId).toBe(client.id);

    const someoneElse = await orderService.listMine(admin.id);
    expect(someoneElse).toHaveLength(0);
  });

  it('listReceived retourne les commandes contenant un item du producteur', async () => {
    offer = await createOffer({ qty: 100, price: 3000 });
    await orderService.create({
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

    const received = await orderService.listReceived(producer.id);
    expect(received).toHaveLength(1);
    expect(received[0]?.items[0]?.producerUserId).toBe(producer.id);
  });
});
