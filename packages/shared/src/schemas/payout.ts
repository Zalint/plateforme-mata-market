import { z } from 'zod';
import { PAYOUT_STATUSES } from '../constants/enums.js';
import { FcfaAmountSchema, IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Schemas Payout · reversements producteurs (Lot 5).
 *
 * Référence : ARCHITECTURE.md §7 (disbursement Bictorys via cron 6h UTC,
 * agrégation order_items delivered+paid non encore reversés), CLAUDE.md §G4
 * (bank_details chiffré, déchiffré en mémoire seulement au moment du call).
 *
 * Agrégation : un payout regroupe TOUS les order_items éligibles d'un même
 * producer_user_id à l'instant t. La table de liaison `payout_items` (UNIQUE
 * sur order_item_id) garantit qu'un item n'est jamais reversé deux fois —
 * fondamental pour l'idempotence du cron.
 *
 * Statuts (cf. PAYOUT_STATUSES) :
 *   pending  → row créée, en attente confirmation Bictorys (court terme)
 *   sent     → Bictorys a confirmé le virement
 *   failed   → erreur (coordonnées invalides, plafond, réseau)
 *   blocked  → bloqué manuellement par admin (dispute, KYC, fraude)
 */

export const PayoutStatusSchema = z.enum(PAYOUT_STATUSES);

// ─────────────────────────────────────────────────────────────────
// Outputs

export const PayoutOutputSchema = z.object({
  id: UuidSchema,
  producerUserId: UuidSchema,
  producerDisplayName: z.string(), // joint pour affichage admin

  amountFcfa: FcfaAmountSchema,
  status: PayoutStatusSchema,
  providerDisbursementId: z.string().nullable(),

  // IDs des order_items couverts (résolu via payout_items côté service).
  // Permet l'audit "quelle commande a payé quel producteur" sans join supplémentaire.
  coveredOrderItemIds: z.array(UuidSchema),

  sentAt: IsoDateTimeSchema.nullable(),
  failedAt: IsoDateTimeSchema.nullable(),
  failureReason: z.string().nullable(),

  createdAt: IsoDateTimeSchema,
});
export type PayoutOutput = z.infer<typeof PayoutOutputSchema>;

export const PayoutListResponseSchema = z.object({
  payouts: z.array(PayoutOutputSchema),
});
export type PayoutListResponse = z.infer<typeof PayoutListResponseSchema>;

// Query GET /v1/payouts (admin).
export const PayoutAdminListQuerySchema = z.object({
  status: PayoutStatusSchema.optional(),
  producerUserId: UuidSchema.optional(),
});
export type PayoutAdminListQuery = z.infer<typeof PayoutAdminListQuerySchema>;

// ─────────────────────────────────────────────────────────────────
// Pending summary (KPIs admin)

/**
 * Agrégat par producteur des montants restant à reverser. Utilisé par
 * la page admin/payments (Tabs « Reversements · N ») et le bouton
 * « Reverser (N) » en haut du mockup §2774.
 */
export const PayoutPendingSummarySchema = z.object({
  producerUserId: UuidSchema,
  producerDisplayName: z.string(),
  amountFcfa: FcfaAmountSchema,
  orderItemIds: z.array(UuidSchema),
});
export type PayoutPendingSummary = z.infer<typeof PayoutPendingSummarySchema>;

export const PayoutPendingResponseSchema = z.object({
  totalAmountFcfa: z.number().int().nonnegative(),
  producerCount: z.number().int().nonnegative(),
  summaries: z.array(PayoutPendingSummarySchema),
});
export type PayoutPendingResponse = z.infer<typeof PayoutPendingResponseSchema>;
