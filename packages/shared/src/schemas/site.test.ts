import { describe, expect, it } from 'vitest';
import { SiteCreateSchema } from './site.js';

const ZONE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('SiteCreateSchema', () => {
  it('accepte un site minimal (name + type + zoneId)', () => {
    expect(
      SiteCreateSchema.safeParse({
        name: 'Poulailler Pout 1',
        type: 'poulailler',
        zoneId: ZONE_ID,
      }).success,
    ).toBe(true);
  });

  it('accepte des coordonnées GPS valides', () => {
    expect(
      SiteCreateSchema.safeParse({
        name: 'Ferme Dahra',
        type: 'ferme',
        zoneId: ZONE_ID,
        geoLat: 15.3478,
        geoLng: -15.4798,
      }).success,
    ).toBe(true);
  });

  it('rejette des coordonnées hors plage', () => {
    expect(
      SiteCreateSchema.safeParse({
        name: 'Site',
        type: 'depot',
        zoneId: ZONE_ID,
        geoLat: 91,
        geoLng: 0,
      }).success,
    ).toBe(false);
    expect(
      SiteCreateSchema.safeParse({
        name: 'Site',
        type: 'depot',
        zoneId: ZONE_ID,
        geoLat: 0,
        geoLng: 181,
      }).success,
    ).toBe(false);
  });

  it('rejette un type de site inconnu', () => {
    expect(
      SiteCreateSchema.safeParse({
        name: 'Site',
        type: 'usine',
        zoneId: ZONE_ID,
      }).success,
    ).toBe(false);
  });

  it('rejette un nom trop court', () => {
    expect(
      SiteCreateSchema.safeParse({
        name: 'X',
        type: 'ferme',
        zoneId: ZONE_ID,
      }).success,
    ).toBe(false);
  });
});
