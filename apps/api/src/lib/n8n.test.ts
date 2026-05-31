import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signN8nPayload } from './n8n.js';

/**
 * Tests unitaires n8n.ts · signature HMAC du dispatch sortant (Lot 7).
 *
 * Référence : CLAUDE.md §G5 (« N8N_WEBHOOK_SECRET signe les payloads sortants
 * (HMAC SHA-256) »). Symétrique de la vérif webhook Bictorys côté entrant.
 *
 * `dispatchToN8n` / `isN8nConfigured` dépendent de `env` (figé au boot) et de
 * `httpFetch` (réseau) : ils sont couverts par le test d'intégration outbox.
 * Ici on couvre la primitive pure et déterministe : la signature.
 */

const SECRET = 'test-n8n-secret-32chars-minimum!!';

describe('signN8nPayload', () => {
  it('produit un HMAC SHA-256 hex (64 chars)', () => {
    const sig = signN8nPayload('{"eventType":"pickup.scheduled"}', SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('correspond au HMAC recalculé manuellement (interop n8n)', () => {
    const rawBody = JSON.stringify({ eventType: 'order.created', payload: { orderId: 'o1' } });
    const expected = createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex');
    expect(signN8nPayload(rawBody, SECRET)).toBe(expected);
  });

  it('est déterministe : même body + même secret → même signature', () => {
    const rawBody = '{"eventType":"payout.sent","payload":{"payoutId":"p1"}}';
    expect(signN8nPayload(rawBody, SECRET)).toBe(signN8nPayload(rawBody, SECRET));
  });

  it('change si un seul octet du body change (intégrité)', () => {
    const a = signN8nPayload('{"eventType":"pickup.confirmed"}', SECRET);
    const b = signN8nPayload('{"eventType":"pickup.cancelled"}', SECRET);
    expect(a).not.toBe(b);
  });

  it('change si le secret change (clé liée à la signature)', () => {
    const rawBody = '{"eventType":"order.delivered"}';
    const a = signN8nPayload(rawBody, SECRET);
    const b = signN8nPayload(rawBody, 'another-secret-32chars-minimum!!!');
    expect(a).not.toBe(b);
  });
});
