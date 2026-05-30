import { describe, expect, it } from 'vitest';
import { FcfaAmountSchema, PaginationQuerySchema, PhoneSnSchema } from './common.js';

describe('PhoneSnSchema', () => {
  it('accepte un numéro Sénégal au format E.164', () => {
    expect(PhoneSnSchema.safeParse('+221771234567').success).toBe(true);
  });

  it('rejette un numéro sans préfixe +221', () => {
    expect(PhoneSnSchema.safeParse('771234567').success).toBe(false);
    expect(PhoneSnSchema.safeParse('00221771234567').success).toBe(false);
  });

  it('rejette un numéro de longueur incorrecte', () => {
    expect(PhoneSnSchema.safeParse('+22177123456').success).toBe(false); // 8 chiffres
    expect(PhoneSnSchema.safeParse('+2217712345678').success).toBe(false); // 10 chiffres
  });
});

describe('FcfaAmountSchema', () => {
  it('accepte les entiers positifs', () => {
    expect(FcfaAmountSchema.safeParse(1).success).toBe(true);
    expect(FcfaAmountSchema.safeParse(95_000).success).toBe(true);
  });

  it('rejette zéro, négatif et décimaux', () => {
    expect(FcfaAmountSchema.safeParse(0).success).toBe(false);
    expect(FcfaAmountSchema.safeParse(-100).success).toBe(false);
    expect(FcfaAmountSchema.safeParse(99.5).success).toBe(false);
  });

  it('rejette les montants déraisonnables (> 200M FCFA)', () => {
    expect(FcfaAmountSchema.safeParse(200_000_001).success).toBe(false);
  });
});

describe('PaginationQuerySchema', () => {
  it('coerce les strings de query string en numbers et applique les défauts', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(PaginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({
      page: 3,
      limit: 50,
    });
  });

  it('borne le limit à 100', () => {
    expect(PaginationQuerySchema.safeParse({ limit: 200 }).success).toBe(false);
  });

  it('refuse page ou limit ≤ 0', () => {
    expect(PaginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ limit: -1 }).success).toBe(false);
  });
});
