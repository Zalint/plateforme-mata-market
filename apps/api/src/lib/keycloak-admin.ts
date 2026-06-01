import { randomInt } from 'node:crypto';
import { DomainError } from '@mata/shared/errors';
import { env } from '../env.js';
import { httpFetch } from './bictorys.js';
import { logger } from './logger.js';

/**
 * Alphabet du mot de passe temporaire : sans caractères ambigus (0/O, 1/l/I)
 * pour qu'un membre du staff puisse le dicter sans confusion.
 */
const TEMP_PWD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const TEMP_PWD_LENGTH = 8;

/**
 * Génère un mot de passe temporaire simple (8 chars, entropie ≈ 47 bits).
 * Forcé à être changé au 1er login (credential Keycloak `temporary: true`).
 * Jamais persisté, jamais loggé (renvoyé une seule fois à l'appelant).
 */
export function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < TEMP_PWD_LENGTH; i++) {
    out += TEMP_PWD_ALPHABET[randomInt(0, TEMP_PWD_ALPHABET.length)];
  }
  return out;
}

/**
 * Client Keycloak Admin API · provisioning de comptes utilisateurs.
 *
 * Utilisé pour l'onboarding producteur par le téléconseiller (un membre du
 * staff crée le compte d'un producteur qui ne s'inscrit pas lui-même). Auth =
 * Keycloak only (CLAUDE.md §C/§G8) : on ne crée jamais d'utilisateur "maison",
 * c'est bien un user Keycloak qui est provisionné via l'Admin REST API.
 *
 * Authentification machine : service account (client confidentiel dédié,
 * `client_credentials`, scope `manage-users`). Le secret vit uniquement en
 * variable d'env Render (jamais côté client, jamais loggé — §G8).
 *
 * Tous les appels sortants passent par `httpFetch` (timeout 10s + retry
 * exponentiel, §G5) — jamais `fetch` nu.
 */

type KeycloakAdminConfig = {
  baseUrl: string; // ex: https://keycloak.mata.sn
  realm: string; // ex: mata
  clientId: string; // service account client id
  clientSecret: string;
};

/**
 * Réunit la config Keycloak Admin. Réutilise KEYCLOAK_URL/KEYCLOAK_REALM
 * (déjà requis au boot via server.ts) + les creds du service account.
 *
 * Garde lazy à la Bictorys : appelé par le producer-service uniquement, pas
 * au boot global — ainsi les tests qui ne touchent pas l'onboarding n'ont pas
 * besoin de ces vars. En prod, l'absence des creds fait échouer l'onboarding
 * avec un message explicite (§G7).
 */
export function requireKeycloakAdminConfig(): KeycloakAdminConfig {
  if (
    !env.KEYCLOAK_URL ||
    !env.KEYCLOAK_REALM ||
    !env.KEYCLOAK_ADMIN_CLIENT_ID ||
    !env.KEYCLOAK_ADMIN_CLIENT_SECRET
  ) {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      'Keycloak Admin non configuré (KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET requis)',
    );
  }
  return {
    baseUrl: env.KEYCLOAK_URL.replace(/\/$/, ''),
    realm: env.KEYCLOAK_REALM,
    clientId: env.KEYCLOAK_ADMIN_CLIENT_ID,
    clientSecret: env.KEYCLOAK_ADMIN_CLIENT_SECRET,
  };
}

/** Récupère un access token machine (grant client_credentials). */
async function getAdminToken(cfg: KeycloakAdminConfig): Promise<string> {
  const res = await httpFetch({
    method: 'POST',
    url: `${cfg.baseUrl}/realms/${cfg.realm}/protocol/openid-connect/token`,
    form: {
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    },
  });
  if (res.status !== 200 || typeof res.body !== 'object' || res.body === null) {
    throw new DomainError('EXTERNAL_FAILURE', `Keycloak token échec (HTTP ${res.status})`);
  }
  const token = (res.body as { access_token?: unknown }).access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new DomainError('EXTERNAL_FAILURE', 'Keycloak token absent de la réponse');
  }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Cherche l'id Keycloak d'un user par username exact (post-création). */
async function findUserIdByUsername(
  cfg: KeycloakAdminConfig,
  token: string,
  username: string,
): Promise<string | null> {
  const res = await httpFetch({
    method: 'GET',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/users?exact=true&username=${encodeURIComponent(username)}`,
    headers: authHeaders(token),
  });
  if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) return null;
  const first = res.body[0] as { id?: unknown };
  return typeof first.id === 'string' ? first.id : null;
}

/** Récupère la représentation d'un rôle realm (id + name) pour le mapping. */
async function getRealmRole(
  cfg: KeycloakAdminConfig,
  token: string,
  roleName: string,
): Promise<{ id: string; name: string }> {
  const res = await httpFetch({
    method: 'GET',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/roles/${encodeURIComponent(roleName)}`,
    headers: authHeaders(token),
  });
  if (res.status !== 200 || typeof res.body !== 'object' || res.body === null) {
    throw new DomainError('EXTERNAL_FAILURE', `Rôle realm "${roleName}" introuvable dans Keycloak`);
  }
  const role = res.body as { id?: unknown; name?: unknown };
  if (typeof role.id !== 'string' || typeof role.name !== 'string') {
    throw new DomainError('EXTERNAL_FAILURE', `Rôle realm "${roleName}" malformé`);
  }
  return { id: role.id, name: role.name };
}

type CreateUserInput = {
  /** username Keycloak = téléphone E.164 (cf. décision V1). */
  phone: string;
  displayName: string;
  /** mot de passe temporaire — changement forcé au 1er login. Jamais loggé. */
  tempPassword: string;
  /** rôle realm à assigner (producer, client_pro, admin, ...). */
  realmRole: string;
};

/** Réinitialise le mot de passe (temporaire, changement forcé). Jamais loggé. */
async function resetPassword(
  cfg: KeycloakAdminConfig,
  token: string,
  keycloakId: string,
  tempPassword: string,
): Promise<void> {
  const res = await httpFetch({
    method: 'PUT',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/users/${keycloakId}/reset-password`,
    headers: authHeaders(token),
    body: { type: 'password', value: tempPassword, temporary: true },
  });
  if (res.status !== 204 && res.status !== 200) {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      `Reset mot de passe Keycloak échoué (HTTP ${res.status})`,
    );
  }
}

/** Met à jour nom + réactive le compte (utilisé lors de l'adoption d'un orphelin). */
async function updateUserBasics(
  cfg: KeycloakAdminConfig,
  token: string,
  keycloakId: string,
  displayName: string,
): Promise<void> {
  const res = await httpFetch({
    method: 'PUT',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/users/${keycloakId}`,
    headers: authHeaders(token),
    body: { firstName: displayName, enabled: true },
  });
  if (res.status !== 204 && res.status !== 200) {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      `Mise à jour user Keycloak échouée (HTTP ${res.status})`,
    );
  }
}

/**
 * Provisionne un compte utilisateur dans Keycloak :
 *  1. crée le user (username = téléphone, mdp temporaire forcé à changer) ;
 *     SI un compte existe déjà pour ce téléphone (HTTP 409), on l'ADOPTE
 *     (reset mdp + réactivation) au lieu d'échouer — cf. note ci-dessous.
 *  2. assigne le rôle realm demandé (idempotent).
 *
 * Adoption des orphelins : un reseed/wipe de la base applicative supprime la
 * ligne `users` mais PAS le compte Keycloak (bases séparées) → des « orphelins »
 * KC sans ligne DB s'accumulent et bloquaient toute recréation par téléphone.
 * Les deux appelants (user-service, producer-service) vérifient la DB EN AMONT
 * et n'arrivent ici que si AUCUNE ligne `users` n'existe pour ce téléphone ;
 * un 409 Keycloak est donc forcément un orphelin → on le réutilise. Idempotent
 * et sûr (un orphelin sans ligne DB n'a aucune autorisation MATA).
 *
 * Retourne le `keycloakId` (= sub du futur JWT). Le mot de passe n'est jamais loggé.
 */
async function createUserInternal(input: CreateUserInput): Promise<string> {
  const cfg = requireKeycloakAdminConfig();
  const token = await getAdminToken(cfg);

  const createRes = await httpFetch({
    method: 'POST',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/users`,
    headers: authHeaders(token),
    body: {
      username: input.phone,
      firstName: input.displayName,
      enabled: true,
      credentials: [{ type: 'password', value: input.tempPassword, temporary: true }],
    },
  });

  let keycloakId: string;
  let adopted = false;

  if (createRes.status === 201) {
    // Keycloak renvoie l'id dans le header Location ; httpFetch n'expose pas les
    // headers, on relit donc le user par username exact.
    const id = await findUserIdByUsername(cfg, token, input.phone);
    if (!id) {
      throw new DomainError('EXTERNAL_FAILURE', 'User Keycloak créé mais introuvable au relookup');
    }
    keycloakId = id;
  } else if (createRes.status === 409) {
    // Orphelin KC (aucune ligne DB en amont) → adoption : reset mdp + réactivation.
    const id = await findUserIdByUsername(cfg, token, input.phone);
    if (!id) {
      throw new DomainError(
        'EXTERNAL_FAILURE',
        'Conflit Keycloak mais compte introuvable au relookup',
      );
    }
    keycloakId = id;
    adopted = true;
    await updateUserBasics(cfg, token, keycloakId, input.displayName);
    await resetPassword(cfg, token, keycloakId, input.tempPassword);
    logger.info({ keycloakId }, 'keycloak.admin.orphan_adopted');
  } else {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      `Création user Keycloak échouée (HTTP ${createRes.status})`,
    );
  }

  // Assigne le rôle realm demandé (idempotent : réassigner un rôle déjà présent
  // est sans effet côté Keycloak).
  const role = await getRealmRole(cfg, token, input.realmRole);
  const roleRes = await httpFetch({
    method: 'POST',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/users/${keycloakId}/role-mappings/realm`,
    headers: authHeaders(token),
    body: [role],
  });
  if (roleRes.status !== 204 && roleRes.status !== 200) {
    // Rollback best-effort UNIQUEMENT si on vient de créer le compte (pas si on
    // a adopté un orphelin préexistant — on ne supprime pas un compte qu'on n'a
    // pas créé dans cette transaction).
    if (!adopted) {
      await deleteUserInternal(keycloakId).catch((err: unknown) => {
        logger.error(
          { keycloakId, err: err instanceof Error ? err.message : String(err) },
          'keycloak.admin.rollback_failed',
        );
      });
    }
    throw new DomainError(
      'EXTERNAL_FAILURE',
      `Assignation rôle ${input.realmRole} échouée (HTTP ${roleRes.status})`,
    );
  }

  logger.info(
    { keycloakId, realmRole: input.realmRole, adopted },
    'keycloak.admin.user_provisioned',
  );
  return keycloakId;
}

/** Supprime un user Keycloak (rollback si la création DB échoue après coup). */
async function deleteUserInternal(keycloakId: string): Promise<void> {
  const cfg = requireKeycloakAdminConfig();
  const token = await getAdminToken(cfg);
  const res = await httpFetch({
    method: 'DELETE',
    url: `${cfg.baseUrl}/admin/realms/${cfg.realm}/users/${keycloakId}`,
    headers: authHeaders(token),
  });
  if (res.status !== 204 && res.status !== 404) {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      `Suppression user Keycloak échouée (HTTP ${res.status})`,
    );
  }
}

export const keycloakAdmin = {
  createUser: createUserInternal,
  deleteUser: deleteUserInternal,
};
