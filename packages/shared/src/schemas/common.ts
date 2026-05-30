import { z } from 'zod';

/**
 * Helpers Zod réutilisables aux frontières HTTP.
 *
 * Référence : CLAUDE.md §G2 « Toute frontière passe par un schéma Zod ».
 */

// ─────────────────────────────────────────────────────────────────
// Identifiants

export const UuidSchema = z.string().uuid();

// ─────────────────────────────────────────────────────────────────
// Téléphone Sénégal — format E.164 simplifié.
//
// Numéros mobiles SN commencent par 70/75/76/77/78, fixes par 33. Au MVP on
// se contente d'imposer `+221` suivi de 9 chiffres. Validation plus fine
// (préfixe opérateur) à reporter quand on intégrera la vérification SMS
// (post-Lot 9 éventuellement).

export const PhoneSnSchema = z
  .string()
  .regex(/^\+221\d{9}$/, 'Numéro Sénégal attendu au format +221XXXXXXXXX');

// ─────────────────────────────────────────────────────────────────
// Montants FCFA — entiers stricts, jamais de centimes (cf. CLAUDE.md §I).
//
// Max 200 000 000 FCFA (~300 000 €) pour borner les saisies aberrantes
// côté front. Au Lot 4 (orders) on aura aussi des sommes plus grandes
// (total commande pro) ; on relâchera la borne là-bas si besoin.

export const FcfaAmountSchema = z
  .number()
  .int('Montant FCFA en entiers (pas de centimes)')
  .positive('Montant FCFA strictement positif')
  .max(200_000_000, 'Montant FCFA trop élevé (max 200 000 000)');

// ─────────────────────────────────────────────────────────────────
// Dates

// YYYY-MM-DD (Zod 3.23+). Utilisé pour les champs `@db.Date` Prisma
// (availableFrom, availableUntil) qui n'ont pas de composante horaire.
export const IsoDateSchema = z.string().date();

// ISO 8601 datetime (ex: 2026-05-29T14:00:00.000Z). Utilisé pour les
// champs `@map @default(now())` retournés en API.
export const IsoDateTimeSchema = z.string().datetime();

// ─────────────────────────────────────────────────────────────────
// Coordonnées GPS

export const LatitudeSchema = z.number().min(-90).max(90);
export const LongitudeSchema = z.number().min(-180).max(180);

// ─────────────────────────────────────────────────────────────────
// Pagination (query string).
//
// `coerce.number` car les query params arrivent en string. Limites prudentes :
// page commence à 1, limit borné à 100 pour éviter les énumérations massives.

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// Méta retournée avec une liste paginée.
export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
