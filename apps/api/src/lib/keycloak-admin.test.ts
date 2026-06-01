import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpFetch } from './bictorys.js';
import { keycloakAdmin } from './keycloak-admin.js';

/**
 * Tests unitaires keycloak-admin · provisioning + ADOPTION d'orphelin.
 *
 * On mocke `httpFetch` (appels Admin REST) + `env` (config service account).
 * Vérifie le comportement clé du Lot : un 409 Keycloak (compte orphelin, sans
 * ligne DB côté appelant) est ADOPTÉ (reset mdp + réactivation) au lieu d'échouer
 * — pour qu'un reseed (qui vide la DB mais pas Keycloak) ne bloque plus la
 * recréation par téléphone. Cf. keycloak-admin.createUser.
 */

vi.mock('./env.js', () => ({
  env: {
    KEYCLOAK_URL: 'http://kc.test',
    KEYCLOAK_REALM: 'mata',
    KEYCLOAK_ADMIN_CLIENT_ID: 'svc',
    KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
  },
}));

vi.mock('./bictorys.js', () => ({ httpFetch: vi.fn() }));

const mockFetch = vi.mocked(httpFetch);

type Call = { method?: string; url?: string };

/** Routeur httpFetch ; `createStatus` pilote la réponse du POST /users. */
function router(createStatus: 201 | 409) {
  return (opts: unknown) => {
    const { method, url } = opts as Call;
    const u = url ?? '';
    if (u.endsWith('/openid-connect/token')) {
      return Promise.resolve({ status: 200, body: { access_token: 'tok' } });
    }
    if (method === 'POST' && u.endsWith('/users')) {
      return Promise.resolve({ status: createStatus, body: null });
    }
    if (method === 'GET' && u.includes('/users?')) {
      return Promise.resolve({ status: 200, body: [{ id: 'kc-user-id' }] });
    }
    if (method === 'PUT' && u.endsWith('/reset-password')) {
      return Promise.resolve({ status: 204, body: null });
    }
    if (method === 'PUT' && u.includes('/users/')) {
      return Promise.resolve({ status: 204, body: null });
    }
    if (method === 'GET' && u.includes('/roles/')) {
      return Promise.resolve({ status: 200, body: { id: 'role-id', name: 'teleconsultant' } });
    }
    if (method === 'POST' && u.endsWith('/role-mappings/realm')) {
      return Promise.resolve({ status: 204, body: null });
    }
    if (method === 'DELETE') {
      return Promise.resolve({ status: 204, body: null });
    }
    return Promise.resolve({ status: 500, body: null });
  };
}

function calledUrls(): string[] {
  return mockFetch.mock.calls.map((c) => (c[0] as Call).url ?? '');
}

const input = {
  phone: '+221770000099',
  displayName: 'Test User',
  tempPassword: 'pwd12345',
  realmRole: 'teleconsultant',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('keycloakAdmin.createUser', () => {
  it('création normale (201) : retourne l’id, sans reset de mot de passe', async () => {
    mockFetch.mockImplementation(router(201));

    const id = await keycloakAdmin.createUser(input);

    expect(id).toBe('kc-user-id');
    expect(calledUrls().some((u) => u.endsWith('/reset-password'))).toBe(false);
    expect(mockFetch.mock.calls.some((c) => (c[0] as Call).method === 'DELETE')).toBe(false);
  });

  it('compte orphelin (409) : ADOPTÉ — reset mdp + réactivation, pas de suppression', async () => {
    mockFetch.mockImplementation(router(409));

    const id = await keycloakAdmin.createUser(input);

    // Réutilise le compte existant (même id), sans le supprimer.
    expect(id).toBe('kc-user-id');
    expect(calledUrls().some((u) => u.endsWith('/reset-password'))).toBe(true);
    expect(mockFetch.mock.calls.some((c) => (c[0] as Call).method === 'DELETE')).toBe(false);
    // Le rôle est (ré)assigné dans tous les cas.
    expect(calledUrls().some((u) => u.endsWith('/role-mappings/realm'))).toBe(true);
  });
});
