import type { ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { offerService } from '../offer-service.js';

/**
 * Test d'intégration · validation du public_id Cloudinary à l'attache (Lot 9, F).
 *
 * Dette BACKLOG [lot-2→lot-6] : `attachPhotos` insérait les `publicIds` reçus
 * du client sans vérifier qu'ils appartiennent au folder figé serveur de
 * l'offre (`mata/offers/<owner>/<offerId>`). Un producteur pouvait donc forger
 * un public_id pointant ailleurs (autre offre, autre compte).
 *
 * Vérifie :
 *  1. un public_id DANS le folder de l'offre → attaché (OK)
 *  2. un public_id HORS folder → rejet VALIDATION, aucune photo écrite
 *
 * Référence : CLAUDE.md §G5 « validation serveur du public_id retourné ».
 */

let zone: Zone;
let producer: User;
let profile: ProducerProfile;
let site: ProductionSite;

function offerInput(): Parameters<typeof offerService.create>[1] {
  return {
    siteId: site.id,
    category: 'poultry',
    title: 'Poulet fermier (attach photos)',
    unit: 'unit',
    quantity: 40,
    priceFcfa: 3_000,
    availableFrom: '2026-06-01',
  } as Parameters<typeof offerService.create>[1];
}

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: 'offer-attach-pout' },
    update: {},
    create: { slug: 'offer-attach-pout', name: 'Pout (attach)', region: 'Thiès' },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:offerattach:producer',
      displayName: 'Mor Diop (attach)',
      role: 'producer',
      phone: '+221770000082',
    },
  });
  profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout offer-attach',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });
});

afterAll(async () => {
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({ where: { id: producer.id } });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe('offerService.attachPhotos · validation public_id', () => {
  it('accepte un public_id dans le folder de l’offre', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    const validId = `mata/offers/${producer.id}/${created.id}/abc123`;

    await offerService.attachPhotos(
      { actorUserId: producer.id, onBehalfOfUserId: null },
      created.id,
      { publicIds: [validId] },
    );

    const photos = await prisma.offerPhoto.findMany({ where: { offerId: created.id } });
    expect(photos).toHaveLength(1);
    expect(photos[0]?.cloudinaryPublicId).toBe(validId);
  });

  it('rejette un public_id hors du folder de l’offre (VALIDATION) sans rien écrire', async () => {
    const created = await offerService.create(producer.id, offerInput(), {
      actorUserId: producer.id,
      onBehalfOfUserId: null,
    });
    // Folder d'une AUTRE offre / autre producteur — forgé.
    const forged = `mata/offers/00000000-0000-4000-8000-000000000000/${created.id}/x`;

    await expect(
      offerService.attachPhotos({ actorUserId: producer.id, onBehalfOfUserId: null }, created.id, {
        publicIds: [forged],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const photos = await prisma.offerPhoto.findMany({ where: { offerId: created.id } });
    expect(photos).toHaveLength(0);
  });
});
