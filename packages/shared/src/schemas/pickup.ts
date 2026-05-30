import { z } from 'zod';
import { DELIVERY_PERIODS, PICKUP_STATUSES, SITE_VEHICLE_ACCESS } from '../constants/enums.js';
import { IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Schemas Pickup · tournées de collecte chez les producteurs (Lot 7).
 *
 * Référence : ARCHITECTURE.md §7 + mockup §admin/pickup (calendrier
 * hebdomadaire, statuts Planifiée / À confirmer / Confirmée / En cours /
 * Effectuée + Annulée), CLAUDE.md §G3 (audit + outbox).
 *
 * Une tournée regroupe N order_items à collecter dans une zone, à une date
 * et période données. `vehicleType` réutilise SITE_VEHICLE_ACCESS et
 * `scheduledPeriod` réutilise DELIVERY_PERIODS (pas de nouvel enum).
 */

export const PickupStatusSchema = z.enum(PICKUP_STATUSES);
export const PickupPeriodSchema = z.enum(DELIVERY_PERIODS);
export const PickupVehicleTypeSchema = z.enum(SITE_VEHICLE_ACCESS);

// ─────────────────────────────────────────────────────────────────
// Outputs

/**
 * Ligne de tournée — un order_item à collecter, enrichi des infos
 * d'affichage (offre, producteur, quantité, commande) résolues côté service.
 */
export const PickupItemOutputSchema = z.object({
  id: UuidSchema,
  orderItemId: UuidSchema,
  collected: z.boolean(),
  notes: z.string().nullable(),

  // Champs joints pour l'affichage admin/producteur (lecture seule).
  orderNumber: z.string(),
  offerTitle: z.string(),
  quantity: z.number().int().positive(),
  producerUserId: UuidSchema,
  producerDisplayName: z.string(),
});
export type PickupItemOutput = z.infer<typeof PickupItemOutputSchema>;

export const PickupOutputSchema = z.object({
  id: UuidSchema,
  pickupNumber: z.string(), // PKP-2026-NNNN
  zoneId: UuidSchema,
  zoneName: z.string(), // joint pour affichage
  scheduledFor: IsoDateTimeSchema,
  scheduledPeriod: PickupPeriodSchema,
  // Libre côté DB (cf. schema.prisma) mais guidé à l'écriture par
  // PickupVehicleTypeSchema (SITE_VEHICLE_ACCESS) — output en string brut
  // pour cohérence avec production_sites.vehicleAccess.
  vehicleType: z.string().nullable(),
  driverDisplayName: z.string().nullable(),
  status: PickupStatusSchema,

  completedAt: IsoDateTimeSchema.nullable(),
  cancelledAt: IsoDateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),

  items: z.array(PickupItemOutputSchema),
  createdAt: IsoDateTimeSchema,
});
export type PickupOutput = z.infer<typeof PickupOutputSchema>;

export const PickupListResponseSchema = z.object({
  pickups: z.array(PickupOutputSchema),
});
export type PickupListResponse = z.infer<typeof PickupListResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Inputs

/**
 * Création d'une tournée (admin). Les `orderItemIds` doivent appartenir à
 * des commandes `confirmed` et ne pas être déjà rattachés à une tournée.
 */
export const PickupCreateSchema = z.object({
  zoneId: UuidSchema,
  scheduledFor: IsoDateTimeSchema,
  scheduledPeriod: PickupPeriodSchema,
  vehicleType: PickupVehicleTypeSchema.optional(),
  driverDisplayName: z.string().min(1).max(120).optional(),
  orderItemIds: z.array(UuidSchema).min(1, 'Au moins un item à collecter'),
});
export type PickupCreate = z.infer<typeof PickupCreateSchema>;

// Transition de statut (hors cancel, qui a sa route dédiée avec raison).
export const PickupTransitionSchema = z.object({
  to: PickupStatusSchema,
});
export type PickupTransition = z.infer<typeof PickupTransitionSchema>;

export const PickupCancelSchema = z.object({
  reason: z.string().min(3).max(300),
});
export type PickupCancel = z.infer<typeof PickupCancelSchema>;

// Cochage d'un item pendant la collecte (chauffeur / admin).
export const PickupItemCheckSchema = z.object({
  collected: z.boolean(),
  notes: z.string().max(300).optional(),
});
export type PickupItemCheck = z.infer<typeof PickupItemCheckSchema>;

// Query GET /v1/pickups (admin) — filtres optionnels.
export const PickupAdminListQuerySchema = z.object({
  status: PickupStatusSchema.optional(),
  zoneId: UuidSchema.optional(),
});
export type PickupAdminListQuery = z.infer<typeof PickupAdminListQuerySchema>;
