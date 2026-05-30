import { describe, expect, it } from 'vitest';
import { OfferCreateSchema, OfferRejectInputSchema } from './offer.js';

const SITE_ID = '550e8400-e29b-41d4-a716-446655440000';

const validOffer = {
  siteId: SITE_ID,
  category: 'poultry' as const,
  title: 'Poulet entier',
  unit: 'unit' as const,
  quantity: 500,
  priceFcfa: 3000,
  availableFrom: '2026-05-25',
};

describe('OfferCreateSchema', () => {
  it('accepte une offre minimale valide', () => {
    expect(OfferCreateSchema.safeParse(validOffer).success).toBe(true);
  });

  it('rejette quantity ≤ 0 ou non entier', () => {
    expect(OfferCreateSchema.safeParse({ ...validOffer, quantity: 0 }).success).toBe(false);
    expect(OfferCreateSchema.safeParse({ ...validOffer, quantity: -5 }).success).toBe(false);
    expect(OfferCreateSchema.safeParse({ ...validOffer, quantity: 1.5 }).success).toBe(false);
  });

  it('rejette un title trop court', () => {
    expect(OfferCreateSchema.safeParse({ ...validOffer, title: 'OK' }).success).toBe(false);
  });

  it('refuse availableUntil antérieur à availableFrom', () => {
    const out = OfferCreateSchema.safeParse({
      ...validOffer,
      availableFrom: '2026-05-25',
      availableUntil: '2026-05-20',
    });
    expect(out.success).toBe(false);
  });

  it('accepte availableUntil = availableFrom (durée 1 jour autorisée)', () => {
    const out = OfferCreateSchema.safeParse({
      ...validOffer,
      availableFrom: '2026-05-25',
      availableUntil: '2026-05-25',
    });
    expect(out.success).toBe(true);
  });

  it('rejette un format de date non ISO', () => {
    expect(
      OfferCreateSchema.safeParse({ ...validOffer, availableFrom: '25/05/2026' }).success,
    ).toBe(false);
  });
});

describe('OfferRejectInputSchema', () => {
  it('exige une raison de 5 à 500 caractères', () => {
    expect(OfferRejectInputSchema.safeParse({ reason: 'Prix trop élevé' }).success).toBe(true);
    expect(OfferRejectInputSchema.safeParse({ reason: 'non' }).success).toBe(false);
    expect(OfferRejectInputSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });
});
