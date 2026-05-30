import { z } from 'zod';
import { TELECONSULT_CLOSE_REASONS } from '../constants/enums.js';
import { IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Schemas Téléconseil · code temporaire + session déléguée (Lot 6).
 *
 * Référence : ARCHITECTURE.md §9 « Téléconseil », CLAUDE.md §G8.
 *
 * INVARIANTS DE SÉCURITÉ EXPRIMÉS DANS LES SCHEMAS :
 *  - Le code 6 chiffres est rendu une seule fois (au générateur). Aucune
 *    route GET ne le retourne, aucun schema ne le ré-expose.
 *  - Le message d'erreur "code invalide ou expiré" est UNIFORME (pas de
 *    distinction côté schema — c'est côté service que la garantie tient).
 */

export const TeleconsultCloseReasonSchema = z.enum(TELECONSULT_CLOSE_REASONS);

// Code 6 chiffres EXACT (regex `^\d{6}$`). Le service refusera le reste.
export const TeleconsultCodeSchema = z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu');

// Username Keycloak (preferred_username). Minuscules + chiffres + . _ -.
// Mockup §2888 montre `mor.diop` saisi par l'admin pour identifier le producteur.
export const UsernameSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9._-]+$/, 'Format username Keycloak attendu (minuscules, chiffres, . _ -)');

// ─────────────────────────────────────────────────────────────────
// Génération de code (producteur)

/**
 * Sortie POST /v1/teleconsult/codes — le code en CLAIR est retourné UNE
 * SEULE FOIS. Aucune autre route ne peut le ressortir.
 */
export const TeleconsultCodeGenerateOutputSchema = z.object({
  code: TeleconsultCodeSchema, // affiché au producteur, jamais re-fetched
  expiresAt: IsoDateTimeSchema,
});
export type TeleconsultCodeGenerateOutput = z.infer<typeof TeleconsultCodeGenerateOutputSchema>;

// ─────────────────────────────────────────────────────────────────
// Démarrage de session (téléconseiller / admin)

/**
 * Body POST /v1/teleconsult/sessions — l'admin saisit username + code.
 */
export const TeleconsultSessionStartInputSchema = z.object({
  producerUsername: UsernameSchema,
  code: TeleconsultCodeSchema,
});
export type TeleconsultSessionStartInput = z.infer<typeof TeleconsultSessionStartInputSchema>;

/**
 * Snapshot du producteur retourné au téléconseiller au démarrage de session.
 * Permet d'afficher la card "Producteur assisté" sans round-trip supplémentaire.
 * AUCUN champ sensible (pas de bank_details, pas de password_hash).
 */
export const TeleconsultProducerSnapshotSchema = z.object({
  userId: UuidSchema,
  username: z.string(),
  displayName: z.string(),
  phone: z.string().nullable(),
});
export type TeleconsultProducerSnapshot = z.infer<typeof TeleconsultProducerSnapshotSchema>;

export const TeleconsultSessionOutputSchema = z.object({
  id: UuidSchema,
  sessionNumber: z.string(), // ex: SES-2026-0001
  teleconsultantUserId: UuidSchema,
  teleconsultantDisplayName: z.string(),
  producer: TeleconsultProducerSnapshotSchema,
  startedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.nullable(),
  closeReason: TeleconsultCloseReasonSchema.nullable(),
});
export type TeleconsultSessionOutput = z.infer<typeof TeleconsultSessionOutputSchema>;

// Réponse "pas de session active" pour /v1/teleconsult/sessions/active.
export const TeleconsultSessionOptionalSchema = TeleconsultSessionOutputSchema.nullable();

// ─────────────────────────────────────────────────────────────────
// Fermeture de session

export const TeleconsultSessionCloseInputSchema = z.object({
  // Optionnel — si non fourni, le service infère depuis le rôle de l'acteur
  // (teleconsultant → closed_by_teleconsultant, producer → revoked_by_producer,
  //  admin → revoked_by_admin).
  reason: TeleconsultCloseReasonSchema.optional(),
});
export type TeleconsultSessionCloseInput = z.infer<typeof TeleconsultSessionCloseInputSchema>;
