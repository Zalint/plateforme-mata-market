import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signN8nPayload } from '../../../lib/n8n.js';
import { prisma } from '../../../lib/prisma.js';
import { outboxService } from '../outbox-service.js';

/**
 * Test d'intégration · dispatch outbox → n8n (Lot 7) sur vraie Postgres.
 *
 * `integration-setup.ts` pose des valeurs jetables N8N_BASE_URL /
 * N8N_WEBHOOK_SECRET pour que `isN8nConfigured()` soit vrai. Le réseau est
 * stubbé via `vi.stubGlobal('fetch')` — aucun trafic réel.
 *
 * Vérifie (CLAUDE.md §G3 + §G5 + §G6) :
 *  1. Succès : event dispatché (`dispatched_at` posé, `last_error` nul),
 *     payload signé HMAC SHA-256 dans l'en-tête X-Mata-Signature.
 *  2. Échec : `retry_count + 1`, `last_error` rempli, jamais dispatché.
 *  3. Abandon : au passage de MAX_RETRIES, l'event sort du scan (plus retenté).
 *  4. Idempotence : un event déjà dispatché n'est jamais re-dispatché.
 */

const SECRET = 'test-n8n-secret-32chars-minimum!!';

function okResponse(): Response {
  return new Response('{"received":true}', { status: 200 });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.outboxEvent.deleteMany({});
});

beforeEach(async () => {
  await prisma.outboxEvent.deleteMany({});
});

describe('outboxService.dispatchPending · succès', () => {
  it('dispatche un event en attente, pose dispatched_at + signe le payload', async () => {
    const event = await prisma.outboxEvent.create({
      data: { eventType: 'pickup.scheduled', payload: { pickupId: 'pk-1' } },
    });

    const calls: Array<{ url: string; headers: Headers; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        calls.push({
          url,
          headers: new Headers(init.headers),
          body: String(init.body),
        });
        return Promise.resolve(okResponse());
      }),
    );

    const result = await outboxService.dispatchPending();
    expect(result.dispatched).toBe(1);
    expect(result.retried).toBe(0);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.dispatchedAt).not.toBeNull();
    expect(row.lastError).toBeNull();

    // Signature HMAC du raw body envoyé, posée dans X-Mata-Signature.
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('expected one fetch call');
    expect(call.url).toContain('pickup.scheduled');
    const expectedSig = signN8nPayload(call.body, SECRET);
    expect(call.headers.get('x-mata-signature')).toBe(expectedSig);
  });

  it('ne re-dispatche jamais un event déjà dispatché (idempotence)', async () => {
    await prisma.outboxEvent.create({
      data: {
        eventType: 'order.created',
        payload: { orderId: 'o-1' },
        dispatchedAt: new Date(),
      },
    });

    const fetchMock = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await outboxService.dispatchPending();
    expect(result.scanned).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('outboxService.dispatchPending · échec + abandon', () => {
  it('incrémente retry_count et remplit last_error quand n8n est injoignable', async () => {
    const event = await prisma.outboxEvent.create({
      data: { eventType: 'payout.sent', payload: { payoutId: 'p-1' } },
    });

    // fetch throw → httpFetch épuise ses 3 tentatives → DomainError → ok:false.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await outboxService.dispatchPending();
    expect(result.dispatched).toBe(0);
    expect(result.retried).toBe(1);
    expect(result.abandoned).toBe(0);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.dispatchedAt).toBeNull();
    expect(row.retryCount).toBe(1);
    expect(row.lastError).not.toBeNull();
  });

  it('abandonne au passage de MAX_RETRIES (event exclu des scans suivants)', async () => {
    // Pré-positionne à 99 : un échec de plus = 100 = abandon.
    const event = await prisma.outboxEvent.create({
      data: {
        eventType: 'order.delivered',
        payload: { orderId: 'o-2' },
        retryCount: 99,
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const first = await outboxService.dispatchPending();
    expect(first.abandoned).toBe(1);
    expect(first.retried).toBe(0);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.retryCount).toBe(100);
    expect(row.dispatchedAt).toBeNull();

    // Run suivant : l'event abandonné n'est plus scanné (retry_count >= MAX).
    const fetchMock = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const second = await outboxService.dispatchPending();
    expect(second.scanned).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
