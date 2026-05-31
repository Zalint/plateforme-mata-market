import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanupExpired } from '../idempotency.js';

/**
 * Test d'intégration · cron cleanup-idempotency (Lot 9) sur vraie Postgres.
 *
 * Vérifie le TTL 24h (BACKLOG [lot-4→lot-9]) :
 *  1. Un record `created_at < now()-24h` est supprimé.
 *  2. Un record récent (< 24h) est conservé.
 *  3. Re-run idempotent : un second passage sans row expiré est un no-op.
 *
 * `idempotency_records` n'a pas de FK → on peut insérer des rows nus avec un
 * `createdAt` forcé, sans bootstrap users/orders.
 */

const SCOPE = 'POST /v1/orders|integ:cleanup-idempotency';

afterEach(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { scope: SCOPE } });
});

beforeEach(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { scope: SCOPE } });
});

describe('cleanupExpired · idempotency_records TTL 24h', () => {
  it('supprime les records > 24h et garde les récents', async () => {
    const now = new Date('2026-05-30T12:00:00.000Z');
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h → expiré
    const recent = new Date(now.getTime() - 23 * 60 * 60 * 1000); // 23h → gardé

    await prisma.idempotencyRecord.create({
      data: {
        key: '11111111-1111-4111-8111-111111111111',
        scope: SCOPE,
        statusCode: 201,
        responseBody: { stale: true },
        createdAt: old,
      },
    });
    await prisma.idempotencyRecord.create({
      data: {
        key: '22222222-2222-4222-8222-222222222222',
        scope: SCOPE,
        statusCode: 201,
        responseBody: { stale: false },
        createdAt: recent,
      },
    });

    const result = await cleanupExpired(now);
    expect(result.purged).toBe(1);

    const remaining = await prisma.idempotencyRecord.findMany({ where: { scope: SCOPE } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.key).toBe('22222222-2222-4222-8222-222222222222');
  });

  it("est un no-op quand aucun record n'est expiré (re-run idempotent)", async () => {
    const now = new Date('2026-05-30T12:00:00.000Z');
    await prisma.idempotencyRecord.create({
      data: {
        key: '33333333-3333-4333-8333-333333333333',
        scope: SCOPE,
        statusCode: 201,
        responseBody: {},
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      },
    });

    const first = await cleanupExpired(now);
    expect(first.purged).toBe(0);
    const second = await cleanupExpired(now);
    expect(second.purged).toBe(0);

    const remaining = await prisma.idempotencyRecord.count({ where: { scope: SCOPE } });
    expect(remaining).toBe(1);
  });
});
