import type { ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { offerService } from '../offer-service.js';

/**
 * Test d'intégration · audit de l'acteur des mutations d'offre (Lot 9, D2).
 *
 * Dette BACKLOG [lot-6→lot-9] : en session déléguée (téléconseiller agissant
 * pour un producteur), l'audit `offer.*` doit tracer l'acteur RÉEL (le
 * téléconseiller) en `actorUserId` et le producteur cible en `onBehalfOfUserId`.
 *
 * Avant le Lot 9, `offerService.create` écrivait `actorUserId = producteur`
 * (le « owner »), masquant qui avait réellement créé l'offre — c'est le bug
 * corrigé ici.
 *
 * Vérifie :
 *  1. create direct producer : actor = producer, onBehalfOf = null
 *  2. create délégué : actor = téléconseiller, onBehalfOf = producer (fix bug)
 *  3. transition submit déléguée : actor + onBehalfOf corrects
 *
 * Référence : CLAUDE.md §G3 (audit actor/on_behalf_of) + §G6 (test du flux
 * téléconseil), ARCHITECTURE.md §9.
 */

let zone: Zone;
let producer: User;
let teleconsultant: User;
let profile: ProducerProfile;
let site: ProductionSite;

function offerInput(
  overrides: Record<string, unknown> = {},
): Parameters<typeof offerService.create>[1] {
  return {
    siteId: site.id,
    category: 'poultry',
    title: 'Poulet fermier (audit délégation)',
    unit: 'unit',
    quantity: 40,
    priceFcfa: 3_000,
    availableFrom: '2026-06-01',
    ...overrides,
  } as Parameters<typeof offerService.create>[1];
}

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: 'offer-deleg-audit-pout' },
    update: {},
    create: { slug: 'offer-deleg-audit-pout', name: 'Pout (offer deleg)', region: 'Thiès' },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:offerdeleg:producer',
      displayName: 'Mor Diop (offer deleg)',
      role: 'producer',
      phone: '+221770000080',
    },
  });
  teleconsultant = await prisma.user.create({
    data: {
      keycloakId: 'integ:offerdeleg:tc',
      displayName: 'Ibrahima Ndiaye (offer deleg)',
      role: 'teleconsultant',
      phone: '+221770000081',
    },
  });
  profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout offer-deleg',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: producer.id }, { actorUserId: teleconsultant.id }] },
  });
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
});

afterAll(async () => {
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({ where: { id: { in: [producer.id, teleconsultant.id] } } });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe("offerService.create · acteur d'audit", () => {
  it('producteur direct : actorUserId = producteur, onBehalfOf null', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'offer.create', targetId: created.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(producer.id);
    expect(audit?.onBehalfOfUserId).toBeNull();
  });

  it('session déléguée : actorUserId = téléconseiller, onBehalfOf = producteur', async () => {
    // L'offre appartient au producteur (premier argument), mais l'acteur réel
    // est le téléconseiller. C'est le bug Lot 6 corrigé au Lot 9.
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: teleconsultant.id,
      onBehalfOfUserId: producer.id,
    });

    // L'offre reste rattachée au producteur.
    const offerRow = await prisma.offer.findUnique({ where: { id: created.id } });
    expect(offerRow?.producerUserId).toBe(producer.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'offer.create', targetId: created.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(teleconsultant.id);
    expect(audit?.onBehalfOfUserId).toBe(producer.id);
  });
});

describe("offerService.submit · acteur d'audit en délégation", () => {
  it('transition déléguée : actorUserId = téléconseiller, onBehalfOf = producteur', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: teleconsultant.id,
      onBehalfOfUserId: producer.id,
    });

    await offerService.submit({
      actorUserId: teleconsultant.id,
      onBehalfOfUserId: producer.id,
      offerId: created.id,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'offer.submit', targetId: created.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(teleconsultant.id);
    expect(audit?.onBehalfOfUserId).toBe(producer.id);
  });
});
