import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mapBictorysStatus, verifyWebhookSignature } from './bictorys.js';

/**
 * Tests unitaires bictorys.ts · signature HMAC + mapping statuts.
 *
 * Référence : CLAUDE.md §G5 (HMAC SHA-256 timing-safe sur RAW BODY),
 *             CLAUDE.md §G6 (« tests endpoint webhook : signature invalide → 401 »).
 */

const SECRET = 'test-webhook-secret-32chars-min!';

function signHex(body: string | Buffer): string {
  return createHmac('sha256', SECRET)
    .update(typeof body === 'string' ? Buffer.from(body, 'utf8') : body)
    .digest('hex');
}

describe('verifyWebhookSignature', () => {
  const body = '{"id":"intent_123","status":"paid"}';

  it('accepte une signature hex valide', () => {
    const sig = signHex(body);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig, secret: SECRET })).toBe(
      true,
    );
  });

  it("accepte le préfixe 'sha256='", () => {
    const sig = `sha256=${signHex(body)}`;
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig, secret: SECRET })).toBe(
      true,
    );
  });

  it('accepte un Buffer comme rawBody (cas fastify-raw-body encoding: false)', () => {
    const buf = Buffer.from(body, 'utf8');
    const sig = signHex(buf);
    expect(verifyWebhookSignature({ rawBody: buf, signatureHeader: sig, secret: SECRET })).toBe(
      true,
    );
  });

  it('refuse une signature falsifiée (même longueur, mauvais contenu)', () => {
    const fake = 'a'.repeat(64); // SHA-256 hex = 64 chars
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: fake, secret: SECRET })).toBe(
      false,
    );
  });

  it('refuse une signature de longueur différente sans crash', () => {
    expect(
      verifyWebhookSignature({ rawBody: body, signatureHeader: 'short', secret: SECRET }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: 'x'.repeat(128),
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('refuse une signature absente / vide / null', () => {
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: null, secret: SECRET })).toBe(
      false,
    );
    expect(
      verifyWebhookSignature({ rawBody: body, signatureHeader: undefined, secret: SECRET }),
    ).toBe(false);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: '', secret: SECRET })).toBe(
      false,
    );
  });

  it('refuse si secret manquant (config non chargée)', () => {
    const sig = signHex(body);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig, secret: '' })).toBe(false);
  });

  it("est case-insensitive et trim sur l'header (provider parfois uppercase)", () => {
    const sig = signHex(body).toUpperCase();
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: `  ${sig}  `,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("détecte la modification d'un octet dans le body (intégrité)", () => {
    const sig = signHex(body);
    const tampered = body.replace('paid', 'pwid');
    expect(
      verifyWebhookSignature({ rawBody: tampered, signatureHeader: sig, secret: SECRET }),
    ).toBe(false);
  });
});

describe('mapBictorysStatus', () => {
  it('mappe paid/succeeded/success/completed → paid', () => {
    expect(mapBictorysStatus('paid')).toBe('paid');
    expect(mapBictorysStatus('succeeded')).toBe('paid');
    expect(mapBictorysStatus('SUCCESS')).toBe('paid'); // case-insensitive
    expect(mapBictorysStatus(' completed ')).toBe('paid'); // trim
  });

  it('mappe opened/pending/processing/created/expired → pending', () => {
    expect(mapBictorysStatus('opened')).toBe('pending');
    expect(mapBictorysStatus('pending')).toBe('pending');
    expect(mapBictorysStatus('processing')).toBe('pending');
    expect(mapBictorysStatus('expired')).toBe('pending');
  });

  it('mappe refunded/reversed → refunded', () => {
    expect(mapBictorysStatus('refunded')).toBe('refunded');
    expect(mapBictorysStatus('reversed')).toBe('refunded');
  });

  it('mappe disputed/chargeback/fraud → disputed', () => {
    expect(mapBictorysStatus('disputed')).toBe('disputed');
    expect(mapBictorysStatus('chargeback')).toBe('disputed');
    expect(mapBictorysStatus('fraud')).toBe('disputed');
  });

  it("retourne null pour les statuts inconnus (évite l'injection)", () => {
    expect(mapBictorysStatus('totally_made_up')).toBeNull();
    expect(mapBictorysStatus("'; DROP TABLE payments;--")).toBeNull();
    expect(mapBictorysStatus('')).toBeNull();
  });
});
