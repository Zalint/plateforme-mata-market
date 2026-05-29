import { describe, expect, it } from 'vitest';
import {
  PricingRuleCreateSchema,
  PricingRuleOutputSchema,
  PricingRuleUpdateSchema,
  PricingSimulateInputSchema,
} from './pricing.js';

const validCategoryRule = {
  scope: 'category' as const,
  category: 'poultry' as const,
  model: 'commission_pct' as const,
  commissionPct: 10,
  commissionBase: 'final_price' as const,
  safetyMarginPct: 3,
  safetyMarginBase: 'final_price' as const,
  collectionFcfa: 120,
  deliveryFcfa: 200,
  storageFcfa: 50,
  discountFcfa: 0,
};

const validOfferOverride = {
  scope: 'offer' as const,
  offerId: '11111111-1111-1111-1111-111111111111',
  model: 'fixed_margin' as const,
  commissionFlatFcfa: 500,
};

describe('PricingRuleCreateSchema', () => {
  it('accepte une rule catégorie minimale (model + scope + category)', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        scope: 'category',
        category: 'poultry',
        model: 'commission_pct',
      }),
    ).not.toThrow();
  });

  it('accepte une rule offer override', () => {
    expect(() => PricingRuleCreateSchema.parse(validOfferOverride)).not.toThrow();
  });

  it('rejette scope=category sans category', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        scope: 'category',
        model: 'commission_pct',
      }),
    ).toThrow(/scope=category exige category seul/);
  });

  it('rejette scope=offer sans offerId', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        scope: 'offer',
        model: 'fixed_margin',
      }),
    ).toThrow(/scope=offer exige offerId seul/);
  });

  it('rejette scope=category avec category ET offerId', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        ...validCategoryRule,
        offerId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toThrow(/scope=category exige category seul/);
  });

  it('rejette commissionPct > 100', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        ...validCategoryRule,
        commissionPct: 150,
      }),
    ).toThrow();
  });

  it('rejette montant FCFA négatif', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        ...validCategoryRule,
        collectionFcfa: -10,
      }),
    ).toThrow();
  });

  it('rejette validUntil <= validFrom', () => {
    expect(() =>
      PricingRuleCreateSchema.parse({
        ...validCategoryRule,
        validFrom: '2026-06-01T00:00:00.000Z',
        validUntil: '2026-05-01T00:00:00.000Z',
      }),
    ).toThrow(/validUntil doit être > validFrom/);
  });

  it('applique les défauts à 0 / producer_price', () => {
    const parsed = PricingRuleCreateSchema.parse({
      scope: 'category',
      category: 'poultry',
      model: 'commission_pct',
    });
    expect(parsed.commissionPct).toBe(0);
    expect(parsed.commissionBase).toBe('producer_price');
    expect(parsed.safetyMarginBase).toBe('producer_price');
    expect(parsed.collectionFcfa).toBe(0);
    expect(parsed.discountFcfa).toBe(0);
  });
});

describe('PricingRuleUpdateSchema', () => {
  it('accepte un patch partiel', () => {
    expect(() =>
      PricingRuleUpdateSchema.parse({
        commissionPct: 12,
      }),
    ).not.toThrow();
  });

  it('accepte un objet vide (no-op autorisé côté service)', () => {
    expect(() => PricingRuleUpdateSchema.parse({})).not.toThrow();
  });

  it('rejette validUntil <= validFrom', () => {
    expect(() =>
      PricingRuleUpdateSchema.parse({
        validFrom: '2026-06-01T00:00:00.000Z',
        validUntil: '2026-05-01T00:00:00.000Z',
      }),
    ).toThrow(/validUntil doit être > validFrom/);
  });
});

describe('PricingRuleOutputSchema', () => {
  it('valide une rule complète sortie API', () => {
    const out = {
      id: '33333333-3333-3333-3333-333333333333',
      scope: 'category' as const,
      category: 'poultry' as const,
      offerId: null,
      model: 'commission_pct' as const,
      commissionPct: 10,
      commissionBase: 'producer_price' as const,
      commissionFlatFcfa: 0,
      safetyMarginPct: 3,
      safetyMarginBase: 'producer_price' as const,
      collectionFcfa: 120,
      deliveryFcfa: 200,
      storageFcfa: 50,
      discountFcfa: 0,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      createdBy: '44444444-4444-4444-4444-444444444444',
      updatedBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(() => PricingRuleOutputSchema.parse(out)).not.toThrow();
  });
});

describe('PricingSimulateInputSchema', () => {
  it('accepte la forme offerId', () => {
    expect(() =>
      PricingSimulateInputSchema.parse({
        offerId: '55555555-5555-5555-5555-555555555555',
      }),
    ).not.toThrow();
  });

  it('accepte la forme inline', () => {
    expect(() =>
      PricingSimulateInputSchema.parse({
        inline: {
          producerPriceFcfa: 3000,
          model: 'commission_pct',
          commissionPct: 10,
          commissionBase: 'producer_price',
          safetyMarginPct: 3,
          safetyMarginBase: 'producer_price',
          collectionFcfa: 120,
          deliveryFcfa: 200,
          storageFcfa: 50,
          discountFcfa: 0,
          quantity: 5,
        },
      }),
    ).not.toThrow();
  });

  it('quantity par défaut = 1', () => {
    const parsed = PricingSimulateInputSchema.parse({
      offerId: '55555555-5555-5555-5555-555555555555',
    });
    if (!('offerId' in parsed)) throw new Error('discriminé incorrect');
    expect(parsed.quantity).toBe(1);
  });
});
