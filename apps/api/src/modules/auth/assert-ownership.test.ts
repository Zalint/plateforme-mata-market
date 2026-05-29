import { DomainError } from '@mata/shared/errors';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { assertOwnership } from './assert-ownership.js';
import type { AuthenticatedUser } from './auth-plugin.js';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    keycloakId: 'kc-1',
    role: 'producer',
    status: 'active',
    displayName: 'Mor Diop',
    ...overrides,
  };
}

function makeReq(
  user: AuthenticatedUser | undefined,
  actingOnBehalfOf?: AuthenticatedUser,
): FastifyRequest {
  return { user, actingOnBehalfOf } as unknown as FastifyRequest;
}

describe('assertOwnership', () => {
  it('autorise le propriétaire à accéder à sa ressource', () => {
    const user = makeUser({ id: 'user-1' });
    expect(() => assertOwnership(makeReq(user), 'user-1')).not.toThrow();
  });

  it('refuse un autre utilisateur', () => {
    const user = makeUser({ id: 'user-1', role: 'producer' });
    expect(() => assertOwnership(makeReq(user), 'user-2')).toThrow(DomainError);
  });

  it('autorise un admin sur n’importe quelle ressource', () => {
    const admin = makeUser({ id: 'admin-1', role: 'admin' });
    expect(() => assertOwnership(makeReq(admin), 'user-99')).not.toThrow();
  });

  it('autorise un super_admin sur n’importe quelle ressource', () => {
    const superAdmin = makeUser({ id: 'sa-1', role: 'super_admin' });
    expect(() => assertOwnership(makeReq(superAdmin), 'user-99')).not.toThrow();
  });

  it('autorise un téléconseiller qui agit pour le compte du propriétaire', () => {
    const teleconsultant = makeUser({ id: 'tc-1', role: 'teleconsultant' });
    const onBehalfOf = makeUser({ id: 'producer-7', role: 'producer' });
    expect(() => assertOwnership(makeReq(teleconsultant, onBehalfOf), 'producer-7')).not.toThrow();
  });

  it('refuse un téléconseiller qui agit pour quelqu’un d’autre', () => {
    const teleconsultant = makeUser({ id: 'tc-1', role: 'teleconsultant' });
    const onBehalfOf = makeUser({ id: 'producer-7', role: 'producer' });
    expect(() => assertOwnership(makeReq(teleconsultant, onBehalfOf), 'producer-99')).toThrow(
      DomainError,
    );
  });

  it('refuse si pas de user (UNAUTHORIZED)', () => {
    expect(() => assertOwnership(makeReq(undefined), 'user-1')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('mappe le refus vers le code FORBIDDEN', () => {
    const user = makeUser({ id: 'user-1', role: 'producer' });
    try {
      assertOwnership(makeReq(user), 'user-2');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('FORBIDDEN');
      expect((err as DomainError).statusCode).toBe(403);
    }
  });
});
