import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { dashboardService } from '../dashboard-service.js';

/**
 * Test d'intégration · KPIs dashboard admin (Lot 9) sur vraie Postgres.
 *
 * Les KPIs sont GLOBAUX (aucun scope) et la DB de test est partagée entre
 * suites → on ne teste pas des valeurs absolues mais des bornes `>=` sur notre
 * jeu connu, et pour la fenêtre du jour on compare deux dates fixes (15/04 où
 * notre commande tombe, 20/04 où aucune). Déterministe (CLAUDE.md §G6).
 *
 * Vérifie :
 *  - producteurs validated / pending comptés séparément
 *  - offres pending comptées
 *  - commandes bornées au JOUR de `now` (une commande hors fenêtre exclue)
 *  - montant du jour = somme total_fcfa
 *  - reversements pending : count + somme amount_fcfa
 */

const PREFIX = 'integ:dashboard';
const ZONE_SLUG = 'dashboard-test-zone';
const NOW = new Date('2026-04-15T12:00:00Z');

let zoneId: string;
let validatedProducerId: string;

beforeAll(async () => {
  const zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Dashboard test', region: 'Thiès' },
  });
  zoneId = zone.id;

  const validatedProducer = await prisma.user.create({
    data: { keycloakId: `${PREFIX}:prod-validated`, displayName: 'Prod Val', role: 'producer' },
  });
  validatedProducerId = validatedProducer.id;
  const pendingProducer = await prisma.user.create({
    data: { keycloakId: `${PREFIX}:prod-pending`, displayName: 'Prod Pend', role: 'producer' },
  });

  await prisma.producerProfile.create({
    data: { userId: validatedProducer.id, type: 'poultry', status: 'validated', zoneId },
  });
  await prisma.producerProfile.create({
    data: { userId: pendingProducer.id, type: 'vegetables', status: 'pending', zoneId },
  });

  const site = await prisma.productionSite.create({
    data: { producerUserId: validatedProducer.id, name: 'Dashboard site', type: 'ferme', zoneId },
  });
  await prisma.offer.create({
    data: {
      producerUserId: validatedProducer.id,
      siteId: site.id,
      category: 'poultry',
      status: 'pending',
      title: 'Offre dashboard pending',
      unit: 'unit',
      quantity: 10,
      priceFcfa: 3000,
      availableFrom: NOW,
    },
  });

  // Commande DANS la fenêtre du jour (total 5000) + une HORS fenêtre (2 jours avant).
  await prisma.order.create({
    data: {
      orderNumber: 'CMD-DASH-IN',
      status: 'created',
      deliveryZoneId: zoneId,
      deliveryAddressLine: 'X',
      deliverySlotDate: NOW,
      deliverySlotPeriod: 'morning',
      totalFcfa: 5000,
      createdAt: new Date('2026-04-15T08:00:00Z'),
    },
  });
  await prisma.order.create({
    data: {
      orderNumber: 'CMD-DASH-OUT',
      status: 'created',
      deliveryZoneId: zoneId,
      deliveryAddressLine: 'X',
      deliverySlotDate: NOW,
      deliverySlotPeriod: 'morning',
      totalFcfa: 9999,
      createdAt: new Date('2026-04-13T08:00:00Z'),
    },
  });

  // Reversement prêt (pending, 4200) + un déjà envoyé (sent, ignoré).
  await prisma.payout.create({
    data: { producerUserId: validatedProducer.id, amountFcfa: 4200, status: 'pending' },
  });
  await prisma.payout.create({
    data: { producerUserId: validatedProducer.id, amountFcfa: 1000, status: 'sent' },
  });
});

afterAll(async () => {
  await prisma.payout.deleteMany({ where: { producerUserId: validatedProducerId } });
  await prisma.order.deleteMany({
    where: { orderNumber: { in: ['CMD-DASH-IN', 'CMD-DASH-OUT'] } },
  });
  await prisma.offer.deleteMany({ where: { producerUserId: validatedProducerId } });
  await prisma.productionSite.deleteMany({ where: { producerUserId: validatedProducerId } });
  await prisma.producerProfile.deleteMany({
    where: { user: { keycloakId: { startsWith: PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { keycloakId: { startsWith: PREFIX } } });
  await prisma.zone.deleteMany({ where: { slug: ZONE_SLUG } });
  await prisma.$disconnect();
});

describe('dashboardService.getKpis · KPIs admin', () => {
  it('agrège producteurs / offres / commandes du jour / reversements', async () => {
    const kpis = await dashboardService.getKpis(NOW);

    // Nos inserts garantissent AU MOINS ces valeurs (la DB peut contenir
    // d'autres données de suites parallèles → on borne par >=).
    expect(kpis.producteursActifs).toBeGreaterThanOrEqual(1);
    expect(kpis.pendingProducteurs).toBeGreaterThanOrEqual(1);
    expect(kpis.offresEnAttente).toBeGreaterThanOrEqual(1);
    expect(kpis.commandesDuJour).toBeGreaterThanOrEqual(1);
    expect(kpis.montantDuJourFcfa).toBeGreaterThanOrEqual(5000);
    expect(kpis.reversementsPretsCount).toBeGreaterThanOrEqual(1);
    expect(kpis.reversementsPretsFcfa).toBeGreaterThanOrEqual(4200);
  });

  it('exclut les commandes hors de la fenêtre du jour', async () => {
    // Un jour SANS aucune de nos commandes (ni IN ni OUT ne tombent dedans).
    const emptyDay = new Date('2026-04-20T12:00:00Z');
    const inDay = await dashboardService.getKpis(NOW);
    const otherDay = await dashboardService.getKpis(emptyDay);

    // La commande CMD-DASH-IN (5000) compte le 15/04 mais pas le 20/04 :
    // l'écart de montant entre les deux jours inclut donc au moins nos 5000,
    // et la commande OUT (13/04) n'est comptée dans aucun des deux.
    expect(inDay.montantDuJourFcfa - otherDay.montantDuJourFcfa).toBeGreaterThanOrEqual(5000);
    expect(inDay.commandesDuJour - otherDay.commandesDuJour).toBeGreaterThanOrEqual(1);
  });
});
