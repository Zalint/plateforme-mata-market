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

describe('offerService.withdraw · pending → draft', () => {
  it('repasse une offre pending en draft (+ audit offer.withdraw), puis refuse hors pending', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    await offerService.submit({ actorUserId: producer.id, offerId: created.id });

    const withdrawn = await offerService.withdraw({
      actorUserId: producer.id,
      offerId: created.id,
    });
    expect(withdrawn.status).toBe('draft');

    const row = await prisma.offer.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('draft');
    expect(row?.submittedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'offer.withdraw', targetId: created.id },
    });
    expect(audit).not.toBeNull();

    // Hors pending (ici draft) → CONFLICT.
    await expect(
      offerService.withdraw({ actorUserId: producer.id, offerId: created.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('offerService.requestChanges · pending → changes_requested → re-submit', () => {
  it('renvoie pour correction (feedback + audit), reste éditable, puis re-soumission efface le feedback', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    await offerService.submit({ actorUserId: producer.id, offerId: created.id });

    // Admin renvoie pour correction avec un message.
    const requested = await offerService.requestChanges({
      actorUserId: teleconsultant.id,
      onBehalfOfUserId: producer.id,
      offerId: created.id,
      reason: 'Merci de préciser le calibre et de remettre une photo nette.',
    });
    expect(requested.status).toBe('changes_requested');
    expect(requested.rejectionReason).toContain('calibre');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'offer.request_changes', targetId: created.id },
    });
    expect(audit).not.toBeNull();

    // Éditable en changes_requested (comme draft).
    const edited = await offerService.update(
      { actorUserId: producer.id },
      created.id,
      { qualityNote: 'Calibre 1,5 kg · photo refaite' },
      undefined,
    );
    expect(edited.qualityNote).toBe('Calibre 1,5 kg · photo refaite');
    expect(edited.status).toBe('changes_requested');

    // Re-soumission → pending + feedback effacé.
    const resubmitted = await offerService.submit({
      actorUserId: producer.id,
      offerId: created.id,
    });
    expect(resubmitted.status).toBe('pending');
    expect(resubmitted.rejectionReason).toBeNull();
  });
});

describe('offerService.archive / unarchive', () => {
  it('archive un brouillon puis le restaure ; refuse d’archiver une offre pending', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });

    // draft → archived
    const archived = await offerService.archive({ actorUserId: producer.id, offerId: created.id });
    expect(archived.status).toBe('archived');
    const auditArchive = await prisma.auditLog.findFirst({
      where: { action: 'offer.archive', targetId: created.id },
    });
    expect(auditArchive).not.toBeNull();

    // archived → draft (restauration)
    const restored = await offerService.unarchive({
      actorUserId: producer.id,
      offerId: created.id,
    });
    expect(restored.status).toBe('draft');

    // Pending n'est pas archivable directement.
    await offerService.submit({ actorUserId: producer.id, offerId: created.id });
    await expect(
      offerService.archive({ actorUserId: producer.id, offerId: created.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('offerService.expireOverdue / relist', () => {
  it('expire une offre validée à date limite passée, puis la relance en draft (date effacée)', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    // Force : validée + date limite dans le passé.
    await prisma.offer.update({
      where: { id: created.id },
      data: { status: 'validated', availableUntil: new Date('2020-01-01T00:00:00Z') },
    });

    const res = await offerService.expireOverdue();
    expect(res.expired).toBeGreaterThanOrEqual(1);
    const row = await prisma.offer.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('expired');

    const relisted = await offerService.relist({ actorUserId: producer.id, offerId: created.id });
    expect(relisted.status).toBe('draft');
    expect(relisted.availableUntil).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'offer.relist', targetId: created.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe('offerService.retire / restore · retrait unilatéral MATA', () => {
  it('retire une offre validée (motif → rejectionReason + audit), puis MATA la restaure en draft', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    await prisma.offer.update({ where: { id: created.id }, data: { status: 'validated' } });

    // MATA (téléconseiller) retire avec un motif.
    const retired = await offerService.retire({
      actorUserId: teleconsultant.id,
      offerId: created.id,
      reason: 'Litige qualité en cours côté MATA.',
    });
    expect(retired.status).toBe('withdrawn');
    expect(retired.rejectionReason).toContain('Litige');

    const auditRetire = await prisma.auditLog.findFirst({
      where: { action: 'offer.retire', targetId: created.id },
    });
    expect(auditRetire).not.toBeNull();
    expect(auditRetire?.actorUserId).toBe(teleconsultant.id);

    // VERROU : on ne peut pas re-soumettre/withdraw depuis withdrawn (statut figé).
    await expect(
      offerService.submit({ actorUserId: producer.id, offerId: created.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // MATA restaure → draft, motif effacé.
    const restored = await offerService.restore({
      actorUserId: teleconsultant.id,
      offerId: created.id,
    });
    expect(restored.status).toBe('draft');
    expect(restored.rejectionReason).toBeNull();

    const auditRestore = await prisma.auditLog.findFirst({
      where: { action: 'offer.restore', targetId: created.id },
    });
    expect(auditRestore).not.toBeNull();
  });

  it('refuse de retirer une offre en brouillon (hors statuts autorisés)', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    await expect(
      offerService.retire({ actorUserId: teleconsultant.id, offerId: created.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
