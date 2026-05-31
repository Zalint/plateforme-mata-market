import type { Offer, ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { pricingService } from '../pricing-service.js';
import { pricingSnapshotService } from '../pricing-snapshot-service.js';

/**
 * Test d'intégration · flow pricing complet sur vraie Postgres (testcontainers).
 *
 * Vérifie :
 *  1. Création de rule catégorie via API + audit pricing.rule.create écrit
 *  2. Update rule + audit pricing.rule.update avec oldValue/newValue
 *  3. findActiveRule : override offer > catégorie + filtre validité
 *  4. simulate : calcul correct + invariant comptable
 *  5. Snapshot : créé immuable, invariant DB CHECK enforced
 *  6. Tentative d'update snapshot → bypass de l'API directe → vérif DB CHECK
 *
 * Référence : CLAUDE.md §G6, ARCHITECTURE.md §6.
 */

const ZONE_SLUG = 'pricing-test-pout';

let admin: User;
let producer: User;
let zone: Zone;
let profile: ProducerProfile;
let site: ProductionSite;
let offer: Offer;

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: ZONE_SLUG },
    update: {},
    create: { slug: ZONE_SLUG, name: 'Pout (pricing test)', region: 'Thiès' },
  });

  admin = await prisma.user.create({
    data: {
      keycloakId: 'integ:pricing:admin',
      displayName: 'Admin Pricing',
      role: 'admin',
      phone: '+221770000010',
    },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:pricing:producer',
      displayName: 'Mor Diop (pricing)',
      role: 'producer',
      phone: '+221770000011',
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
      name: 'Poulailler Pout pricing-test',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });

  offer = await prisma.offer.create({
    data: {
      producerUserId: profile.userId,
      siteId: site.id,
      category: 'poultry',
      status: 'validated',
      title: 'Poulet entier (pricing test)',
      unit: 'unit',
      quantity: 100,
      priceFcfa: 3000,
      availableFrom: new Date('2026-05-29'),
    },
  });
});

afterAll(async () => {
  await prisma.pricingSnapshot.deleteMany({});
  await prisma.pricingRule.deleteMany({});
  await prisma.offer.deleteMany({ where: { id: offer.id } });
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [admin.id, producer.id] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, producer.id] } } });
  await prisma.zone.delete({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe('Pricing flow · création rule → simulate → snapshot', () => {
  it('crée une rule catégorie + audit pricing.rule.create', async () => {
    const created = await pricingService.createRule(admin.id, {
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
    expect(created.scope).toBe('category');
    expect(created.category).toBe('poultry');
    expect(created.commissionPct).toBe(10);

    const createAudit = await prisma.auditLog.findFirst({
      where: { targetId: created.id, action: 'pricing.rule.create' },
    });
    expect(createAudit).not.toBeNull();
    expect(createAudit?.actorUserId).toBe(admin.id);
  });

  it('update rule + audit pricing.rule.update avec oldValue/newValue', async () => {
    const existing = await prisma.pricingRule.findFirst({
      where: { scope: 'category', category: 'poultry' },
    });
    if (!existing) throw new Error('rule pré-requise absente');

    const updated = await pricingService.updateRule(admin.id, existing.id, {
      commissionPct: 12,
    });
    expect(updated.commissionPct).toBe(12);
    expect(updated.updatedBy).toBe(admin.id);

    const updateAudit = await prisma.auditLog.findFirst({
      where: { targetId: existing.id, action: 'pricing.rule.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(updateAudit).not.toBeNull();
    const oldValue = updateAudit?.oldValue as { commissionPct: number };
    const newValue = updateAudit?.newValue as { commissionPct: number };
    expect(oldValue.commissionPct).toBe(10);
    expect(newValue.commissionPct).toBe(12);
  });

  it('findActiveRule : override offer prioritaire sur catégorie', async () => {
    // Crée un override sur l'offre
    await pricingService.createRule(admin.id, {
      scope: 'offer',
      offerId: offer.id,
      model: 'fixed_margin',
      commissionPct: 0,
      commissionBase: 'producer_price',
      commissionFlatFcfa: 800, // override : montant fixe
      safetyMarginPct: 0,
      safetyMarginBase: 'producer_price',
      collectionFcfa: 100,
      deliveryFcfa: 150,
      storageFcfa: 30,
      discountFcfa: 0,
    });

    const active = await pricingService.findActiveRule({
      offerId: offer.id,
      category: 'poultry',
    });
    expect(active?.scope).toBe('offer');
    expect(active?.offerId).toBe(offer.id);
    expect(active?.model).toBe('fixed_margin');
    expect(active?.commissionFlatFcfa).toBe(800);
  });

  it('simulate offerId : utilise rule override + invariant comptable', async () => {
    const sim = await pricingService.simulate({ offerId: offer.id, quantity: 5 });
    // override fixed_margin : producer 3000 + flat 800 + collecte 100 + livraison 150 + storage 30 = 4080
    expect(sim.perUnit.producerPriceFcfa).toBe(3000);
    expect(sim.perUnit.commissionFcfa).toBe(800);
    expect(sim.perUnit.collectionFcfa).toBe(100);
    expect(sim.perUnit.deliveryFcfa).toBe(150);
    expect(sim.perUnit.storageFcfa).toBe(30);
    expect(sim.perUnit.finalPriceFcfa).toBe(4080);
    // Invariant : producer_share + platform_share = final_price
    expect(sim.perUnit.producerShareFcfa + sim.perUnit.platformShareFcfa).toBe(
      sim.perUnit.finalPriceFcfa,
    );
    expect(sim.perUnit.producerShareFcfa).toBe(3000);
    expect(sim.perUnit.platformShareFcfa).toBe(1080);
    // Total ligne x 5
    expect(sim.lineTotal.finalPriceFcfa).toBe(4080 * 5);
    expect(sim.lineTotal.producerShareFcfa).toBe(3000 * 5);
  });

  it('createForOrderItem : snapshot persisté + DB CHECK invariant respecté', async () => {
    const snapshot = await pricingSnapshotService.createForOrderItem({
      offerId: offer.id,
      quantity: 3,
    });

    expect(snapshot.modelUsed).toBe('fixed_margin');
    expect(snapshot.producerPriceFcfa).toBe(3000);
    expect(snapshot.commissionFcfa).toBe(800);
    expect(snapshot.finalPriceFcfa).toBe(4080);
    expect(snapshot.producerShareFcfa + snapshot.platformShareFcfa).toBe(snapshot.finalPriceFcfa);
    expect(snapshot.quantity).toBe(3);

    // Reload depuis DB pour s'assurer que la row est bien là.
    const row = await prisma.pricingSnapshot.findUnique({ where: { id: snapshot.id } });
    expect(row).not.toBeNull();
    expect(row?.pricingRuleId).not.toBeNull();
  });

  it("snapshot : DB refuse une row violant l'invariant producer + platform = final", async () => {
    // Tente d'insérer une row qui viole le CHECK constraint.
    // L'erreur Postgres doit remonter (CHECK pricing_snapshots_share_invariant_check).
    await expect(
      prisma.pricingSnapshot.create({
        data: {
          modelUsed: 'fixed_margin',
          producerPriceFcfa: 3000,
          commissionFcfa: 800,
          collectionFcfa: 100,
          deliveryFcfa: 150,
          storageFcfa: 30,
          safetyMarginFcfa: 0,
          discountFcfa: 0,
          finalPriceFcfa: 4080,
          producerShareFcfa: 3000,
          platformShareFcfa: 999, // INCOHÉRENT : 3000 + 999 ≠ 4080
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it('snapshot : DB refuse quantity <= 0', async () => {
    await expect(
      prisma.pricingSnapshot.create({
        data: {
          modelUsed: 'fixed_margin',
          producerPriceFcfa: 3000,
          commissionFcfa: 0,
          collectionFcfa: 0,
          deliveryFcfa: 0,
          storageFcfa: 0,
          safetyMarginFcfa: 0,
          discountFcfa: 0,
          finalPriceFcfa: 3000,
          producerShareFcfa: 3000,
          platformShareFcfa: 0,
          quantity: 0, // INVALIDE
        },
      }),
    ).rejects.toThrow();
  });

  it('pricing_rules : DB refuse une rule scope=category sans category', async () => {
    await expect(
      prisma.pricingRule.create({
        data: {
          scope: 'category',
          // category omis -> CHECK constraint refuse
          model: 'fixed_margin',
          createdBy: admin.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('pricing_rules : DB refuse une rule scope=offer sans offerId', async () => {
    await expect(
      prisma.pricingRule.create({
        data: {
          scope: 'offer',
          // offerId omis -> CHECK constraint refuse
          model: 'fixed_margin',
          createdBy: admin.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('pricing_rules : DB refuse commissionPct > 100', async () => {
    await expect(
      prisma.pricingRule.create({
        data: {
          scope: 'category',
          category: 'eggs',
          model: 'commission_pct',
          commissionPct: 150, // INVALIDE (CHECK 0-100)
          createdBy: admin.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('simulate inline : utilise les valeurs fournies sans rule persistée', async () => {
    const sim = await pricingService.simulate({
      inline: {
        producerPriceFcfa: 5000,
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
        quantity: 2,
      },
    });
    expect(sim.ruleId).toBeNull();
    expect(sim.perUnit.producerPriceFcfa).toBe(5000);
    expect(sim.perUnit.commissionFcfa).toBe(500);
    expect(sim.perUnit.finalPriceFcfa).toBe(5500);
    expect(sim.lineTotal.finalPriceFcfa).toBe(5500 * 2);
  });
});
