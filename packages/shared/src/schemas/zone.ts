import { z } from 'zod';
import { IsoDateTimeSchema, LatitudeSchema, LongitudeSchema, UuidSchema } from './common.js';

/**
 * Schemas Zone · référentiel géographique en lecture.
 *
 * Pas de schema Create/Update au Lot 2 : ajout de zone via seed ou SQL
 * jusqu'à un éventuel CRUD admin (Lot 9 probable). Lecture publique
 * authentifiée via `GET /v1/zones`.
 */

// Slug : kebab-case ASCII, utilisé pour les URLs et l'identification stable
// au-delà du UUID DB. Pattern lâche au MVP, ré-évaluer si conflits.
const SlugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug attendu en kebab-case ASCII');

export const ZoneOutputSchema = z.object({
  id: UuidSchema,
  slug: SlugSchema,
  name: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  centroidLat: LatitudeSchema.nullable(),
  centroidLng: LongitudeSchema.nullable(),
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
});

export type ZoneOutput = z.infer<typeof ZoneOutputSchema>;

export const ZoneListResponseSchema = z.object({
  zones: z.array(ZoneOutputSchema),
});

export type ZoneListResponse = z.infer<typeof ZoneListResponseSchema>;
