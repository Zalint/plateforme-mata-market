import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { dashboardService } from '../dashboard-service.js';

/**
 * Test d'intégration · KPIs dashboard PRODUCTEUR + CLIENT (Lot 9) sur vraie
 * Postgres. Contrairement aux KPIs admin (globaux), ceux-ci sont SCOPÉS à un
 * utilisateur → on peut tester des valeurs EXACTES (le producteur et le client
 * créés ici sont uniques à cette suite).
 *
 * Vérifie (CLAUDE.md §G6) :
 *  Producteur — offres `validated` comptées (pas les `pending`), « à recevoir »
 *  = part producteur des items livrés+payés non reversés, commandes du mois,
 *  note moyenne + nombre d'avis.
 *  Client — commandes en cours / livrées, total dépensé (payées), prochaine
 *  livraison (min slot des commandes actives).
 */

const PREFIX = 'integ:dash-roles';
const ZONE_SLUG = 'dash-roles-zone';

let zoneId: string;
let producerId: string;
let clientId: string;

beforeAll(async () => {
  const zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Dash roles', region: 'Thiès' },
  });
  zoneId = zone.id;

  const producer = await prisma.user.create({
    data: { keycloakId: `${PREFIX}:prod`, displayName: 'Prod Roles', role: 'producer' },
  });
  producerId = producer.id;
  const client = await prisma.user.create({
    data: { keycloakId: `${PREFIX}:client`, displayName: 'Client Roles', role: 'client_pro' },
  });
  clientId = client.id;

  await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId },
  });
  const site = await prisma.productionSite.create({
    data: { producerUserId: producer.id, name: 'Site roles', type: 'ferme', zoneId },
  });

  // 1 offre validated (compte) + 1 pending (ne compte pas) → offresActives = 1.
  const validatedOffer = await prisma.offer.create({
    data: {
      producerUserId: producer.id,
      siteId: site.id,
      category: 'poultry',
      status: 'validated',
      title: 'Offre roles validated',
      unit: 'unit',
      quantity: 50,
      priceFcfa: 3000,
      availableFrom: new Date(),
    },
  });
  await prisma.offer.create({
    data: {
      producerUserId: producer.id,
      siteId: site.id,
      category: 'poultry',
      status: 'pending',
      title: 'Offre roles pending',
      unit: 'unit',
      quantity: 10,
      priceFcfa: 3000,
      availableFrom: new Date(),
    },
  });

  // Snapshot : producerShare 2500 × qty 2 = 5000 « à recevoir ».
  const snapshot = await prisma.pricingSnapshot.create({
    data: {
      modelUsed: 'commission_pct',
      producerPriceFcfa: 2500,
      commissionFcfa: 250,
      collectionFcfa: 120,
      deliveryFcfa: 200,
      storageFcfa: 50,
      safetyMarginFcfa: 75,
      discountFcfa: 0,
      finalPriceFcfa: 3000,
      producerShareFcfa: 2500,
      platformShareFcfa: 500,
      quantity: 2,
    },
  });

  // Commande LIVRÉE + PAYÉE (total 6000) avec un item du producteur, ce mois-ci.
  const delivered = await prisma.order.create({
    data: {
      orderNumber: `CMD-DASHROLES-DELIVERED-${Date.now()}`,
      clientUserId: client.id,
      status: 'delivered',
      paymentStatus: 'paid',
      deliveryZoneId: zoneId,
      deliveryAddressLine: 'Almadies',
      deliverySlotDate: new Date('2026-06-10'),
      deliverySlotPeriod: 'morning',
      totalFcfa: 6000,
    },
  });
  await prisma.orderItem.create({
    data: {
      orderId: delivered.id,
      offerId: validatedOffer.id,
      producerUserId: producer.id,
      quantity: 2,
      unitPriceAtOrder: 2500,
      pricingSnapshotId: snapshot.id,
    },
  });

  // Commande EN COURS (confirmed, non payée, slot plus tard) → en cours + prochaine livraison.
  await prisma.order.create({
    data: {
      orderNumber: `CMD-DASHROLES-ENCOURS-${Date.now()}`,
      clientUserId: client.id,
      status: 'confirmed',
      paymentStatus: 'pending',
      deliveryZoneId: zoneId,
      deliveryAddressLine: 'Mermoz',
      deliverySlotDate: new Date('2026-06-20'),
      deliverySlotPeriod: 'morning',
      totalFcfa: 3000,
    },
  });

  // Avis post-livraison (4★) sur la commande livrée.
  await prisma.producerRating.create({
    data: { producerUserId: producer.id, orderId: delivered.id, clientUserId: client.id, stars: 4 },
  });
});

afterAll(async () => {
  await prisma.producerRating.deleteMany({ where: { producerUserId: producerId } });
  await prisma.orderItem.deleteMany({ where: { producerUserId: producerId } });
  await prisma.order.deleteMany({ where: { clientUserId: clientId } });
  await prisma.pricingSnapshot.deleteMany({ where: { producerShareFcfa: 2500, platformShareFcfa: 500 } });
  await prisma.offer.deleteMany({ where: { producerUserId: producerId } });
  await prisma.productionSite.deleteMany({ where: { producerUserId: producerId } });
  await prisma.producerProfile.deleteMany({ where: { userId: producerId } });
  await prisma.user.deleteMany({ where: { keycloakId: { startsWith: PREFIX } } });
  await prisma.zone.deleteMany({ where: { slug: ZONE_SLUG } });
  await prisma.$disconnect();
});

describe('dashboardService.getProducerKpis · KPIs producteur', () => {
  it('agrège offres actives, à recevoir, commandes du mois, note', async () => {
    const kpis = await dashboardService.getProducerKpis(producerId);
    expect(kpis.offresActives).toBe(1); // seule l'offre validated compte
    expect(kpis.aRecevoirFcfa).toBe(5000); // 2500 × 2, livré+payé non reversé
    expect(kpis.commandesDuMois).toBe(1); // la commande livrée (créée ce mois)
    expect(kpis.ratingCount).toBe(1);
    expect(kpis.ratingAvg).toBe(4);
  });
});

describe('dashboardService.getClientKpis · KPIs client', () => {
  it('compte commandes en cours / livrées, total dépensé, prochaine livraison', async () => {
    const kpis = await dashboardService.getClientKpis(clientId);
    expect(kpis.commandesLivrees).toBe(1);
    expect(kpis.commandesEnCours).toBe(1); // la commande confirmed
    expect(kpis.totalDepenseFcfa).toBe(6000); // seule la commande payée
    expect(kpis.prochaineLivraison).toBe('2026-06-20'); // min slot des actives
  });
});
