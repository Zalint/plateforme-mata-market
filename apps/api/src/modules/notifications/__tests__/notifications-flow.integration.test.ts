import type { User } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { notificationService } from '../notification-service.js';

/**
 * Test d'intégration · notifications push web (Lot 7) sur vraie Postgres.
 *
 * Vérifie (CLAUDE.md §G1 + §G6) :
 *  1. subscribe : upsert par endpoint + audit `notification.subscribe` ;
 *     ré-abonnement du même endpoint met à jour les clés (pas de doublon).
 *  2. unsubscribe : borné au user, idempotent, audit `notification.unsubscribe`.
 *  3. Préférences : défaut (push/email ON, catégories vides) + merge partiel
 *     + audit `notification.preferences_update`.
 *  4. sendToUser : skip propre quand Web Push non configuré (cas des tests :
 *     pas de clés VAPID) — push jamais dans le chemin critique, ne throw pas.
 *
 * Le pipeline d'envoi réel (chiffrement RFC 8291 + 410-cleanup) exige un
 * service push joignable : couvert par l'E2E Puppeteer (docs/N8N_FLOWS.md).
 */

let userA: User;
let userB: User;

const SUB_A = {
  endpoint: 'https://push.example.com/sub-a',
  keys: { p256dh: 'p256dh-key-a', auth: 'auth-key-a' },
};

beforeAll(async () => {
  userA = await prisma.user.create({
    data: {
      keycloakId: 'integ:notif:a',
      displayName: 'Notif User A',
      role: 'producer',
      phone: '+221770000050',
    },
  });
  userB = await prisma.user.create({
    data: {
      keycloakId: 'integ:notif:b',
      displayName: 'Notif User B',
      role: 'producer',
      phone: '+221770000051',
    },
  });
});

afterEach(async () => {
  await prisma.pushSubscription.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [userA.id, userB.id] } },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.$disconnect();
});

describe('notificationService.subscribe', () => {
  it('crée la souscription + audit notification.subscribe', async () => {
    await notificationService.subscribe({ userId: userA.id, subscription: SUB_A });

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint: SUB_A.endpoint } });
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(userA.id);
    expect(row?.p256dh).toBe('p256dh-key-a');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'notification.subscribe', actorUserId: userA.id },
    });
    expect(audit).not.toBeNull();
  });

  it('ré-abonnement du même endpoint met à jour les clés sans doublon', async () => {
    await notificationService.subscribe({ userId: userA.id, subscription: SUB_A });
    await notificationService.subscribe({
      userId: userA.id,
      subscription: { endpoint: SUB_A.endpoint, keys: { p256dh: 'rotated', auth: 'rotated-auth' } },
    });

    const rows = await prisma.pushSubscription.findMany({ where: { endpoint: SUB_A.endpoint } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.p256dh).toBe('rotated');
  });
});

describe('notificationService.unsubscribe', () => {
  it('supprime la souscription du user + audit, idempotent', async () => {
    await notificationService.subscribe({ userId: userA.id, subscription: SUB_A });

    await notificationService.unsubscribe({ userId: userA.id, endpoint: SUB_A.endpoint });
    const after = await prisma.pushSubscription.findUnique({ where: { endpoint: SUB_A.endpoint } });
    expect(after).toBeNull();

    // 2e appel : ne throw pas (deleteMany idempotent).
    await expect(
      notificationService.unsubscribe({ userId: userA.id, endpoint: SUB_A.endpoint }),
    ).resolves.toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'notification.unsubscribe', actorUserId: userA.id },
    });
    expect(audit).not.toBeNull();
  });

  it("ne supprime pas la souscription d'un autre user (borné au user)", async () => {
    await notificationService.subscribe({ userId: userA.id, subscription: SUB_A });

    // userB tente de désabonner l'endpoint de userA → no-op.
    await notificationService.unsubscribe({ userId: userB.id, endpoint: SUB_A.endpoint });

    const still = await prisma.pushSubscription.findUnique({ where: { endpoint: SUB_A.endpoint } });
    expect(still).not.toBeNull();
    expect(still?.userId).toBe(userA.id);
  });
});

describe('notificationService préférences', () => {
  it('retourne les défauts quand aucune préférence enregistrée', async () => {
    const prefs = await notificationService.getPreferences(userA.id);
    expect(prefs).toEqual({ pushEnabled: true, emailEnabled: true, categories: {} });
  });

  it('merge partiel des catégories + audit preferences_update', async () => {
    await notificationService.updatePreferences({
      userId: userA.id,
      input: { categories: { pickup: false } },
    });
    await notificationService.updatePreferences({
      userId: userA.id,
      input: { pushEnabled: false, categories: { payout: false } },
    });

    const prefs = await notificationService.getPreferences(userA.id);
    expect(prefs.pushEnabled).toBe(false);
    expect(prefs.categories).toEqual({ pickup: false, payout: false });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'notification.preferences_update', actorUserId: userA.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe('notificationService.sendToUser (Web Push non configuré en test)', () => {
  it('ne throw pas et retourne sent:0 quand VAPID absent', async () => {
    await notificationService.subscribe({ userId: userA.id, subscription: SUB_A });

    const result = await notificationService.sendToUser(userA.id, {
      title: 'Tournée planifiée',
      body: 'Une collecte est prévue chez vous',
      category: 'pickup',
    });
    expect(result).toEqual({ sent: 0, removed: 0 });

    // La souscription n'est pas supprimée (skip propre, pas un 410).
    const still = await prisma.pushSubscription.findUnique({ where: { endpoint: SUB_A.endpoint } });
    expect(still).not.toBeNull();
  });
});
