import { BankDetailsEncryptedSchema } from '@mata/shared/schemas';
import type { User } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { decrypt } from '../../../lib/crypto.js';
import { prisma } from '../../../lib/prisma.js';
import { bankDetailsService } from '../bank-details-service.js';
import { producerService } from '../producer-service.js';

/**
 * Test d'intégration · flow producer + bank_details.
 *
 * Vérifie sur une vraie Postgres (testcontainers) :
 *  1. Création de profil par un producteur → status=pending → audit ajouté
 *  2. Validation par un admin → status=validated → audit ajouté
 *  3. Rejet d'une 2e validation (CONFLICT car déjà validated)
 *  4. Update bank_details → contenu effectivement chiffré en DB (raw row)
 *  5. Reveal admin → contenu en clair restauré + audit reveal ajouté
 *
 * Référence : CLAUDE.md §G6 « testcontainers + vraie Postgres ».
 */

const POUT_ZONE_SLUG = 'pout-test';

let producerUser: User;
let adminUser: User;
let zoneId: string;

beforeAll(async () => {
  // Petite zone de test pour ne pas dépendre du seed dev
  const zone = await prisma.zone.upsert({
    where: { slug: POUT_ZONE_SLUG },
    update: {},
    create: { slug: POUT_ZONE_SLUG, name: 'Pout (test)', region: 'Thiès' },
  });
  zoneId = zone.id;

  producerUser = await prisma.user.create({
    data: {
      keycloakId: 'integ:producer:fatou-sarr',
      displayName: 'Fatou Sarr',
      role: 'producer',
      phone: '+221770000001',
    },
  });
  adminUser = await prisma.user.create({
    data: {
      keycloakId: 'integ:admin:ndeye-faye',
      displayName: 'Ndèye Faye',
      role: 'admin',
      phone: '+221770000002',
    },
  });
});

afterEach(async () => {
  // Cleanup entre tests : on supprime le profil + audit du producteur.
  await prisma.auditLog.deleteMany({ where: { targetId: producerUser.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producerUser.id } });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [producerUser.id, adminUser.id] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [producerUser.id, adminUser.id] } } });
  await prisma.zone.delete({ where: { id: zoneId } });
  await prisma.$disconnect();
});

describe('Producer flow · création → validation', () => {
  it('crée un profil en status=pending + écrit audit producer.create', async () => {
    const created = await producerService.createMyProfile(producerUser.id, {
      type: 'poultry',
      zoneId,
      whatsappPhone: '+221770000001',
    });
    expect(created.status).toBe('pending');
    expect(created.type).toBe('poultry');

    const auditEntry = await prisma.auditLog.findFirst({
      where: { targetId: producerUser.id, action: 'producer.create' },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.actorUserId).toBe(producerUser.id);
  });

  it('passe pending → validated quand admin appelle validate + écrit audit + pose validatedAt/By', async () => {
    await producerService.createMyProfile(producerUser.id, {
      type: 'poultry',
      zoneId,
    });

    const validated = await producerService.validate({
      actorUserId: adminUser.id,
      targetUserId: producerUser.id,
    });
    expect(validated.status).toBe('validated');
    expect(validated.validatedAt).not.toBeNull();

    const validateAudit = await prisma.auditLog.findFirst({
      where: { targetId: producerUser.id, action: 'producer.validate' },
    });
    expect(validateAudit).not.toBeNull();
    expect(validateAudit?.actorUserId).toBe(adminUser.id);
    expect(validateAudit?.oldValue).toEqual({ status: 'pending' });
    expect(validateAudit?.newValue).toEqual({ status: 'validated' });

    const row = await prisma.producerProfile.findUnique({ where: { userId: producerUser.id } });
    expect(row?.validatedBy).toBe(adminUser.id);
  });

  it('refuse 409 CONFLICT une 2ᵉ validation (déjà validated)', async () => {
    await producerService.createMyProfile(producerUser.id, { type: 'poultry', zoneId });
    await producerService.validate({ actorUserId: adminUser.id, targetUserId: producerUser.id });
    await expect(
      producerService.validate({ actorUserId: adminUser.id, targetUserId: producerUser.id }),
    ).rejects.toThrow(/Transition impossible depuis status=validated/);
  });
});

describe('Bank details · roundtrip chiffré + audit', () => {
  const sampleBank = {
    holder: 'Fatou Sarr',
    iban: 'SN08SN0100100777777777777777',
    bic: 'BSENSNDAXXX',
    bankName: 'BOA Sénégal',
  };

  it('persiste en DB sous forme chiffrée (jamais le clair) + audit producer.bank_details.update', async () => {
    await producerService.createMyProfile(producerUser.id, { type: 'poultry', zoneId });

    await bankDetailsService.update(
      { actorUserId: producerUser.id, targetUserId: producerUser.id },
      sampleBank,
    );

    // Inspection raw du jsonb : doit matcher BankDetailsEncryptedSchema, et
    // ne JAMAIS contenir l'IBAN en clair.
    const row = await prisma.producerProfile.findUnique({
      where: { userId: producerUser.id },
      select: { bankDetails: true },
    });
    const parsed = BankDetailsEncryptedSchema.parse(row?.bankDetails);
    expect(parsed.alg).toBe('aes-256-gcm');
    expect(parsed.v).toBe(1);

    const serialized = JSON.stringify(row?.bankDetails);
    expect(serialized).not.toContain(sampleBank.iban);
    expect(serialized).not.toContain(sampleBank.holder);

    // Décryptage manuel pour vérifier l'invariant
    const clear = JSON.parse(decrypt(parsed));
    expect(clear).toEqual(sampleBank);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { targetId: producerUser.id, action: 'producer.bank_details.update' },
    });
    expect(auditEntry).not.toBeNull();
    // INVARIANT : l'audit ne contient JAMAIS le contenu en clair
    const auditSerialized = JSON.stringify(auditEntry);
    expect(auditSerialized).not.toContain(sampleBank.iban);
    expect(auditSerialized).not.toContain(sampleBank.holder);
  });

  it('reveal admin restitue le clair + écrit audit producer.bank_details.reveal', async () => {
    await producerService.createMyProfile(producerUser.id, { type: 'poultry', zoneId });
    await bankDetailsService.update(
      { actorUserId: producerUser.id, targetUserId: producerUser.id },
      sampleBank,
    );

    const revealed = await bankDetailsService.reveal({
      actorUserId: adminUser.id,
      targetUserId: producerUser.id,
    });
    expect(revealed).toEqual(sampleBank);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { targetId: producerUser.id, action: 'producer.bank_details.reveal' },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.actorUserId).toBe(adminUser.id);
  });
});
