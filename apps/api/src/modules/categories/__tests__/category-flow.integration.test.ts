import { DomainError } from '@mata/shared/errors';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { offerService } from '../../offers/index.js';
import { categoryService } from '../category-service.js';

/**
 * Test d'intégration · taxonomie produit data-driven (table product_categories)
 * sur vraie Postgres. Vérifie :
 *  - listActive exclut les catégories désactivées
 *  - create : nouvelle catégorie visible + audit écrit ; doublon → CONFLICT
 *  - update : rename + désactivation (sort de listActive, reste dans listAll)
 *  - offerService.create accepte un slug actif, refuse inconnu / désactivé
 *
 * Slugs préfixés `integ-` pour ne pas heurter les 6 catégories seedées.
 */

const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const SLUG = 'integ-caprin';
const SLUG2 = 'integ-canard';

beforeAll(async () => {
  // Acteur d'audit (FK actor_user_id → users).
  await prisma.user.upsert({
    where: { id: ACTOR },
    update: {},
    create: { id: ACTOR, keycloakId: 'integ:cat:actor', displayName: 'Cat Tester', role: 'admin' },
  });
  await prisma.category.deleteMany({ where: { slug: { in: [SLUG, SLUG2] } } });
});

afterAll(async () => {
  await prisma.offer.deleteMany({ where: { categorySlug: { in: [SLUG, SLUG2] } } });
  await prisma.category.deleteMany({ where: { slug: { in: [SLUG, SLUG2] } } });
});

describe('categoryService', () => {
  it('listActive contient les catégories seedées et exclut les désactivées', async () => {
    const active = await categoryService.listActive();
    expect(active.some((c) => c.slug === 'poultry')).toBe(true);
    expect(active.every((c) => c.isActive)).toBe(true);
  });

  it('create : nouvelle catégorie visible + audit ; doublon → CONFLICT', async () => {
    const created = await categoryService.create({
      actorUserId: ACTOR,
      input: { slug: SLUG, labelFr: 'Caprin', emoji: '🐐', sortOrder: 10 },
    });
    expect(created.slug).toBe(SLUG);
    expect(created.isActive).toBe(true);

    const active = await categoryService.listActive();
    expect(active.some((c) => c.slug === SLUG)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'category.create', targetId: SLUG },
    });
    expect(audit).not.toBeNull();

    await expect(
      categoryService.create({
        actorUserId: ACTOR,
        input: { slug: SLUG, labelFr: 'Caprin bis', emoji: '🐐' },
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('update : désactivation → sort de listActive, reste dans listAll', async () => {
    await categoryService.create({
      actorUserId: ACTOR,
      input: { slug: SLUG2, labelFr: 'Canard', emoji: '🦆' },
    });
    await categoryService.update({
      actorUserId: ACTOR,
      slug: SLUG2,
      input: { labelFr: 'Canard fermier', isActive: false },
    });

    const active = await categoryService.listActive();
    const all = await categoryService.listAll();
    expect(active.some((c) => c.slug === SLUG2)).toBe(false);
    const inAll = all.find((c) => c.slug === SLUG2);
    expect(inAll?.isActive).toBe(false);
    expect(inAll?.labelFr).toBe('Canard fermier');
  });
});

describe('offerService.create · validation catégorie dynamique', () => {
  let producerUserId: string;
  let siteId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { keycloakId: 'integ:cat:prod', displayName: 'Cat Prod', role: 'producer' },
    });
    producerUserId = user.id;
    const zone = await prisma.zone.upsert({
      where: { slug: 'integ-cat-zone' },
      update: {},
      create: { slug: 'integ-cat-zone', name: 'Cat Zone', region: 'Thiès' },
    });
    await prisma.producerProfile.create({
      data: { userId: producerUserId, zoneId: zone.id, status: 'validated', type: 'poultry' },
    });
    const site = await prisma.productionSite.create({
      data: {
        producerUserId,
        name: 'Cat Site',
        type: 'poulailler',
        zoneId: zone.id,
        addressLine: 'x',
        geoLat: 14,
        geoLng: -17,
        vehicleAccess: 'moto',
        contactName: 'x',
        contactPhone: '+221770000099',
        pickupHours: 'am',
      },
    });
    siteId = site.id;
  });

  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { producerUserId } });
    await prisma.productionSite.deleteMany({ where: { producerUserId } });
    await prisma.producerProfile.deleteMany({ where: { userId: producerUserId } });
    await prisma.user.deleteMany({ where: { id: producerUserId } });
  });

  const baseInput = {
    title: 'Chèvre sur pied',
    unit: 'head' as const,
    quantity: 3,
    priceFcfa: 60000,
    availableFrom: '2026-06-20',
  };

  it('accepte un slug de catégorie actif', async () => {
    const offer = await offerService.create(
      producerUserId,
      { ...baseInput, siteId, category: SLUG },
      { actorUserId: producerUserId },
    );
    expect(offer.category).toBe(SLUG);
  });

  it('refuse un slug inconnu (VALIDATION)', async () => {
    await expect(
      offerService.create(
        producerUserId,
        { ...baseInput, siteId, category: 'integ-inexistant' },
        { actorUserId: producerUserId },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('refuse un slug désactivé (CONFLICT)', async () => {
    await expect(
      offerService.create(
        producerUserId,
        { ...baseInput, siteId, category: SLUG2 },
        { actorUserId: producerUserId },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
