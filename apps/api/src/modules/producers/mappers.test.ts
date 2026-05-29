import type { ProducerProfile as PrismaProducerProfile, User } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toProducerAdmin, toProducerPublic } from './mappers.js';

type ProfileWithUser = PrismaProducerProfile & {
  user: Pick<User, 'displayName' | 'phone' | 'email'>;
};

function makePrismaProfile(overrides: Partial<ProfileWithUser> = {}): ProfileWithUser {
  return {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'poultry',
    status: 'validated',
    zoneId: '550e8400-e29b-41d4-a716-446655440001',
    whatsappPhone: '+221771234567',
    photoPublicId: 'mata/producers/avatar',
    bio: 'Aviculteur',
    documents: [],
    bankDetails: null,
    validatedAt: new Date('2026-02-15T10:00:00Z'),
    validatedBy: '550e8400-e29b-41d4-a716-446655440002',
    createdAt: new Date('2026-02-10T08:00:00Z'),
    updatedAt: new Date('2026-02-15T10:00:00Z'),
    user: {
      displayName: 'Mor Diop',
      phone: '+221771234567',
      email: null,
    },
    ...overrides,
  };
}

describe('toProducerPublic', () => {
  it('expose displayName joint depuis user', () => {
    const out = toProducerPublic(makePrismaProfile());
    expect(out.displayName).toBe('Mor Diop');
  });

  it('convertit les Date en ISO string', () => {
    const out = toProducerPublic(makePrismaProfile());
    expect(out.createdAt).toBe('2026-02-10T08:00:00.000Z');
    expect(out.validatedAt).toBe('2026-02-15T10:00:00.000Z');
  });

  it('preserve null sur validatedAt si non validé', () => {
    const out = toProducerPublic(makePrismaProfile({ validatedAt: null, status: 'pending' }));
    expect(out.validatedAt).toBeNull();
    expect(out.status).toBe('pending');
  });
});

describe('toProducerAdmin', () => {
  it('expose documents (parsé) + hasBankDetails=false si null + phone PII admin-only', () => {
    const out = toProducerAdmin(
      makePrismaProfile({
        documents: [
          { type: 'cni', publicId: 'mata/cni/abc', uploadedAt: '2026-02-10T08:00:00.000Z' },
        ],
        bankDetails: null,
      }),
    );
    expect(out.documents).toHaveLength(1);
    expect(out.documents[0]?.type).toBe('cni');
    expect(out.hasBankDetails).toBe(false);
    expect(out.phone).toBe('+221771234567');
  });

  it("hasBankDetails=true dès lors que le champ est non null (n'expose JAMAIS le contenu)", () => {
    const out = toProducerAdmin(
      makePrismaProfile({
        bankDetails: { ciphertext: 'x', iv: 'i', tag: 't', alg: 'aes-256-gcm', v: 1 },
      }),
    );
    expect(out.hasBankDetails).toBe(true);
    // Pas de fuite : l'output ne contient aucun champ ressemblant à des BD
    expect(out).not.toHaveProperty('bankDetails');
    expect(JSON.stringify(out)).not.toContain('ciphertext');
  });

  it('rejette un documents jsonb mal formé (fail fast)', () => {
    expect(() =>
      toProducerAdmin(makePrismaProfile({ documents: [{ type: 'invalid_type' }] })),
    ).toThrow();
  });
});
