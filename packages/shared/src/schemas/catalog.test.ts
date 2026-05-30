import { describe, expect, it } from 'vitest';
import { CatalogOfferListQuerySchema } from './catalog.js';

const ZONE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('CatalogOfferListQuerySchema', () => {
  it('applique les défauts page=1 limit=20 sans filtre', () => {
    expect(CatalogOfferListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('accepte les filtres optionnels category + zoneId + recherche', () => {
    const out = CatalogOfferListQuerySchema.parse({
      page: '2',
      limit: '12',
      category: 'eggs',
      zoneId: ZONE_ID,
      q: 'poulet',
    });
    expect(out).toEqual({
      page: 2,
      limit: 12,
      category: 'eggs',
      zoneId: ZONE_ID,
      q: 'poulet',
    });
  });

  it('rejette une catégorie inconnue', () => {
    expect(CatalogOfferListQuerySchema.safeParse({ category: 'beverages' }).success).toBe(false);
  });

  it('rejette une recherche trop courte (<2 chars)', () => {
    expect(CatalogOfferListQuerySchema.safeParse({ q: 'p' }).success).toBe(false);
  });

  it('rejette un zoneId non-UUID', () => {
    expect(CatalogOfferListQuerySchema.safeParse({ zoneId: 'pout' }).success).toBe(false);
  });
});
