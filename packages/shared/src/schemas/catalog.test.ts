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

  it('accepte un slug de catégorie au format valide (existence vérifiée côté service)', () => {
    // Taxonomie data-driven : le schéma valide le FORMAT du slug, pas l'existence
    // (assurée par la FK + assertCategoryActive côté API). Un slug inconnu mais
    // bien formé est donc accepté ici.
    expect(CatalogOfferListQuerySchema.safeParse({ category: 'beverages' }).success).toBe(true);
  });

  it('rejette une catégorie au format invalide (majuscules / espaces)', () => {
    expect(CatalogOfferListQuerySchema.safeParse({ category: 'Beverages!' }).success).toBe(false);
  });

  it('rejette une recherche trop courte (<2 chars)', () => {
    expect(CatalogOfferListQuerySchema.safeParse({ q: 'p' }).success).toBe(false);
  });

  it('rejette un zoneId non-UUID', () => {
    expect(CatalogOfferListQuerySchema.safeParse({ zoneId: 'pout' }).success).toBe(false);
  });
});
