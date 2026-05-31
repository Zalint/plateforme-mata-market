import { z } from 'zod';
import { PhoneSnSchema, UuidSchema } from './common.js';
import { ProducerTypeSchema } from './producer.js';

/**
 * Schemas Admin · création d'un utilisateur par un admin (Lot 9).
 *
 * Même mécanique que l'onboarding producteur : un compte Keycloak est
 * provisionné (username = téléphone, mot de passe temporaire renvoyé une seule
 * fois). L'admin peut créer n'importe quel rôle exploitable (super_admin exclu :
 * non créable depuis l'app). Pour un `producer`, `type` + `zoneId` sont requis
 * (le profil producteur `pending` est créé en plus du compte) — la règle est
 * vérifiée côté service (DomainError VALIDATION), pas en ZodEffects, pour garder
 * un body d'objet simple compatible avec le type provider Fastify.
 */
export const ADMIN_CREATABLE_ROLES = [
  'producer',
  'client_pro',
  'client_particulier',
  'teleconsultant',
  'admin',
] as const;

export type AdminCreatableRole = (typeof ADMIN_CREATABLE_ROLES)[number];

export const AdminCreateUserInputSchema = z.object({
  displayName: z.string().min(2).max(120),
  phone: PhoneSnSchema,
  role: z.enum(ADMIN_CREATABLE_ROLES),
  // Requis uniquement si role === 'producer' (vérifié côté service).
  type: ProducerTypeSchema.optional(),
  zoneId: UuidSchema.optional(),
});

export type AdminCreateUserInput = z.infer<typeof AdminCreateUserInputSchema>;

/**
 * Réponse : rôle + nom + mot de passe temporaire, renvoyé UNE SEULE FOIS
 * (jamais re-consultable, jamais loggé — pino redact `*.tempPassword`).
 */
export const AdminCreateUserResponseSchema = z.object({
  role: z.enum(ADMIN_CREATABLE_ROLES),
  displayName: z.string(),
  tempPassword: z.string().min(1),
});

export type AdminCreateUserResponse = z.infer<typeof AdminCreateUserResponseSchema>;
