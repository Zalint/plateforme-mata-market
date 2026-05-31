import { z } from 'zod';
import { PRODUCER_DOCUMENT_TYPES, PRODUCER_STATUSES, PRODUCER_TYPES } from '../constants/enums.js';
import {
  IsoDateTimeSchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
  PhoneSnSchema,
  UuidSchema,
} from './common.js';

/**
 * Schemas Producer · profil producteur + coordonnées bancaires + documents.
 *
 * bank_details (jsonb DB) :
 *  - `BankDetailsClearSchema`     : forme manipulée par le service AVANT
 *                                   chiffrement / APRÈS déchiffrement.
 *                                   Jamais persistée telle quelle.
 *  - `BankDetailsEncryptedSchema` : forme effectivement stockée en DB.
 *
 * Le chiffrement AES-256-GCM est géré côté API (`apps/api/src/lib/crypto.ts`
 * livré à l'Étape 3). Les schemas ici sont volontairement séparés pour que
 * le compilateur empêche toute confusion entre les deux formes.
 *
 * Référence : CLAUDE.md §G4 « bank_details chiffré », §G8 « Chiffrement applicatif ».
 */

// ─────────────────────────────────────────────────────────────────
// Enums (alignés avec Prisma via constants/enums)

export const ProducerTypeSchema = z.enum(PRODUCER_TYPES);
export const ProducerStatusSchema = z.enum(PRODUCER_STATUSES);

// ─────────────────────────────────────────────────────────────────
// Bank details

/**
 * Coordonnées bancaires EN CLAIR.
 *
 * Reçu côté API à l'update, déchiffré pour reveal admin. Ne JAMAIS logger
 * (pino redact configuré sur `bankDetails`).
 *
 * IBAN/BIC validation light au MVP : longueur + chars alphanum. Pas de
 * checksum mod-97 ni vérification BIC contre annuaire SWIFT.
 */
export const BankDetailsClearSchema = z.object({
  holder: z.string().min(2).max(120), // « Mor Diop »
  iban: z
    .string()
    .regex(/^[A-Z0-9]{15,34}$/, 'IBAN attendu en majuscules alphanumériques (15 à 34 caractères)'),
  bic: z
    .string()
    .regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/, 'BIC attendu en 8 ou 11 caractères alphanumériques')
    .optional(),
  bankName: z.string().min(1).max(120), // « BOA Sénégal »
});

export type BankDetailsClear = z.infer<typeof BankDetailsClearSchema>;

/**
 * Coordonnées bancaires CHIFFRÉES (forme DB).
 *
 * `alg` et `v` figés pour permettre une future rotation de schéma
 * (ex: passage à AES-256-SIV ou nouveau format).
 */
export const BankDetailsEncryptedSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  alg: z.literal('aes-256-gcm'),
  v: z.literal(1),
});

export type BankDetailsEncrypted = z.infer<typeof BankDetailsEncryptedSchema>;

// ─────────────────────────────────────────────────────────────────
// Documents (CNI, photo ferme, ...)

export const ProducerDocumentSchema = z.object({
  type: z.enum(PRODUCER_DOCUMENT_TYPES),
  publicId: z.string().min(1), // Cloudinary public_id
  uploadedAt: IsoDateTimeSchema,
});

export type ProducerDocument = z.infer<typeof ProducerDocumentSchema>;

export const ProducerDocumentsSchema = z.array(ProducerDocumentSchema);

// ─────────────────────────────────────────────────────────────────
// Profil

const BioSchema = z.string().max(500).optional();
const PhotoPublicIdSchema = z.string().max(200).optional();

/**
 * Création du profil producteur.
 *
 * `userId` n'est pas dans le payload : il est résolu côté API depuis le
 * JWT (un producer crée SON profil, ou un admin crée pour un user explicite
 * via une route dédiée — pas exposée au Lot 2).
 *
 * **Pas de Create combiné** (décision figée Lot 2). Les champs sensibles
 * `bankDetails` et `documents` ne sont PAS dans ce schema. Le bootstrap d'un
 * producteur se fait en 3 endpoints séparés, chacun avec son audit_log dédié :
 *   1. `POST /v1/producers/me`                       → profil (status=pending)
 *   2. `POST /v1/producers/me/bank-details`          → chiffre + audit
 *   3. `POST /v1/producers/me/documents` (× N)       → ajoute un doc + audit
 *
 * Justification : un producer peut être validé même sans BD/docs (parcours
 * où l'admin vérifie oralement par téléphone). Et chaque modification de BD
 * ou ajout de doc doit produire son entrée d'audit traçable indépendamment
 * — un payload composite rendrait l'audit plus difficile à lire.
 */
export const ProducerProfileCreateSchema = z.object({
  type: ProducerTypeSchema,
  zoneId: UuidSchema,
  whatsappPhone: PhoneSnSchema.optional(),
  photoPublicId: PhotoPublicIdSchema,
  bio: BioSchema,
});

export type ProducerProfileCreate = z.infer<typeof ProducerProfileCreateSchema>;

/**
 * Update du profil (champs autorisés).
 *
 * `status`, `validatedAt`, `validatedBy`, `bankDetails`, `documents` ne sont
 * PAS modifiables via cette route — elles passent par des endpoints dédiés
 * (`/v1/producers/:id/validate`, `/v1/producers/:id/bank-details`, etc.)
 * pour que chaque transition soit explicite et auditée.
 */
export const ProducerProfileUpdateSchema = ProducerProfileCreateSchema.partial();

export type ProducerProfileUpdate = z.infer<typeof ProducerProfileUpdateSchema>;

/**
 * Sortie API publique (sans bank_details ni documents sensibles).
 *
 * Une variante `*Admin` réservée à l'admin exposera documents + indicateur
 * de présence de bank_details (jamais le contenu en clair — celui-ci passe
 * par `POST /v1/producers/:id/bank-details/reveal` audité).
 */
export const ProducerProfilePublicSchema = z.object({
  userId: UuidSchema,
  displayName: z.string().min(1), // joint depuis users.display_name
  type: ProducerTypeSchema,
  status: ProducerStatusSchema,
  zoneId: UuidSchema,
  whatsappPhone: PhoneSnSchema.nullable(),
  photoPublicId: z.string().nullable(),
  bio: z.string().nullable(),
  validatedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type ProducerProfilePublic = z.infer<typeof ProducerProfilePublicSchema>;

export const ProducerProfileAdminSchema = ProducerProfilePublicSchema.extend({
  phone: z.string().nullable(), // contact principal user.phone (PII admin-only)
  email: z.string().email().nullable(),
  validatedBy: UuidSchema.nullable(),
  documents: ProducerDocumentsSchema,
  hasBankDetails: z.boolean(), // pas la valeur, juste si défini
  // Lot 9 — notation : moyenne (null si aucun avis) + nombre d'avis post-livraison.
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int().nonnegative(),
});

export type ProducerProfileAdmin = z.infer<typeof ProducerProfileAdminSchema>;

// ─────────────────────────────────────────────────────────────────
// Notation producteur (Lot 9) · avis client post-livraison

/**
 * Body POST /v1/producers/:producerId/ratings. Le client note un producteur
 * pour une commande LIVRÉE dont il est le propriétaire. 1 note par (commande,
 * producteur) — l'unicité est garantie en base (`@@unique`).
 */
export const ProducerRatingCreateSchema = z.object({
  orderId: UuidSchema,
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export type ProducerRatingCreate = z.infer<typeof ProducerRatingCreateSchema>;

// ─────────────────────────────────────────────────────────────────
// Liste admin (paginée + filtres)

export const ProducerAdminListQuerySchema = PaginationQuerySchema.extend({
  status: ProducerStatusSchema.optional(),
  type: ProducerTypeSchema.optional(),
  zoneId: UuidSchema.optional(),
  q: z.string().min(2).max(80).optional(), // recherche sur displayName / whatsappPhone
});

export type ProducerAdminListQuery = z.infer<typeof ProducerAdminListQuerySchema>;

export const ProducerAdminListResponseSchema = z.object({
  producers: z.array(ProducerProfileAdminSchema),
  meta: PaginationMetaSchema,
});

export type ProducerAdminListResponse = z.infer<typeof ProducerAdminListResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Transitions (validation / suspension)

export const ProducerValidateInputSchema = z.object({}); // pas de body, juste la route
export const ProducerSuspendInputSchema = z.object({
  reason: z.string().min(3).max(300),
});
export const ProducerBlacklistInputSchema = z.object({
  reason: z.string().min(3).max(300),
});

// ─────────────────────────────────────────────────────────────────
// Bank details : update + reveal

export const BankDetailsUpdateInputSchema = BankDetailsClearSchema;
export type BankDetailsUpdateInput = z.infer<typeof BankDetailsUpdateInputSchema>;

// Reveal : pas de body, mais réponse contient les BD en clair (audit obligatoire).
export const BankDetailsRevealResponseSchema = BankDetailsClearSchema;
export type BankDetailsRevealResponse = z.infer<typeof BankDetailsRevealResponseSchema>;
