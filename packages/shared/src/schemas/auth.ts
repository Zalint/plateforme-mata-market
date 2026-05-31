import { z } from 'zod';
import { UuidSchema } from './common.js';

/**
 * Schéma de `GET /v1/auth/me` — identité de l'utilisateur connecté.
 *
 * Source unique partagée API (réponse) ↔ web (parsing du payload, frontière
 * Zod §G2). Le rôle vient de la table `users` (résolu par `keycloakId`), pas
 * d'un claim JWT (cf. apps/api auth-plugin).
 */

export const USER_ROLES = [
  'producer',
  'client_pro',
  'client_particulier',
  'admin',
  'teleconsultant',
  'super_admin',
] as const;

export type UserRoleValue = (typeof USER_ROLES)[number];

/** Libellés FR affichables (header, écrans). */
export const USER_ROLE_LABEL_FR: Record<UserRoleValue, string> = {
  producer: 'Producteur',
  client_pro: 'Client pro',
  client_particulier: 'Client',
  admin: 'Admin',
  teleconsultant: 'Téléconseiller',
  super_admin: 'Super admin',
};

export const AuthMeResponseSchema = z.object({
  id: UuidSchema,
  keycloakId: z.string(),
  role: z.enum(USER_ROLES),
  status: z.enum(['active', 'suspended', 'blacklisted']),
  displayName: z.string(),
  actingOnBehalfOf: z
    .object({
      id: UuidSchema,
      displayName: z.string(),
    })
    .nullable(),
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
