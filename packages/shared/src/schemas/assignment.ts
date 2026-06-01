import { z } from 'zod';
import { UuidSchema } from './common.js';

/**
 * Schemas Affectations producteur ↔ téléconseiller (portée de modération).
 *
 * Un téléconseiller modère uniquement les offres de ses producteurs affectés ;
 * `allProducers` lui donne la portée globale. Cf. ARCHITECTURE.md §9 + schema
 * Prisma (TeleconsultantAssignment / TeleconsultantScope).
 */

// PUT body : remplace la portée d'un téléconseiller (toggle + liste cochée).
export const AssignmentScopeInputSchema = z.object({
  allProducers: z.boolean(),
  producerUserIds: z.array(UuidSchema).max(1000),
});
export type AssignmentScopeInput = z.infer<typeof AssignmentScopeInputSchema>;

// Portée résolue d'un téléconseiller.
export const AssignmentScopeOutputSchema = z.object({
  teleconsultantUserId: UuidSchema,
  allProducers: z.boolean(),
  producerUserIds: z.array(UuidSchema),
});
export type AssignmentScopeOutput = z.infer<typeof AssignmentScopeOutputSchema>;

// Contexte complet de l'écran admin (téléconseillers + producteurs + couverture).
export const AssignmentContextResponseSchema = z.object({
  teleconsultants: z.array(
    z.object({
      id: UuidSchema,
      displayName: z.string(),
      allProducers: z.boolean(),
    }),
  ),
  producers: z.array(
    z.object({
      id: UuidSchema,
      displayName: z.string(),
      zoneName: z.string().nullable(),
      teleconsultantUserIds: z.array(UuidSchema),
    }),
  ),
});
export type AssignmentContextResponse = z.infer<typeof AssignmentContextResponseSchema>;
