import { z } from 'zod';
import { PAYMENT_STATUSES } from '../constants/enums.js';
import { FcfaAmountSchema, IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Schemas Payment · paiements Bictorys (Lot 5).
 *
 * Référence : ARCHITECTURE.md §7 (Bictorys checkout hosted + webhook signé HMAC
 * + idempotence 3 niveaux), CLAUDE.md §G5 (raw body + HMAC temps constant),
 * §G8 (sécurité webhooks), mockup §2774 (ADMIN/PAYMENTS).
 *
 * Statuts MATA (cf. PAYMENT_STATUSES) :
 *   pending  → checkout émis, en attente du client
 *   paid     → webhook 'paid' reçu, order passe en `confirmed`
 *   refunded → cancel order après paid OU webhook 'refunded' (rare)
 *   disputed → webhook 'disputed' / chargeback, payouts liés bloqués
 *
 * Le `providerIntentId` est la clé unique côté Bictorys (paymentLink id).
 * Toute opération est IDEMPOTENTE par ce lookup (cf. CLAUDE.md §G5).
 */

export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

// ─────────────────────────────────────────────────────────────────
// Inputs

/**
 * Body POST /v1/payments/intents.
 * Le serveur récupère le order, vérifie status='created' et payment_status='pending',
 * appelle bictorys.createPaymentIntent et insère la row payments.
 */
export const PaymentIntentCreateSchema = z.object({
  orderId: UuidSchema,
});
export type PaymentIntentCreate = z.infer<typeof PaymentIntentCreateSchema>;

// ─────────────────────────────────────────────────────────────────
// Outputs

export const PaymentOutputSchema = z.object({
  id: UuidSchema,
  orderId: UuidSchema,
  orderNumber: z.string(), // joint depuis orders pour affichage rapide

  providerIntentId: z.string(),
  amountFcfa: FcfaAmountSchema,
  currency: z.string(), // 'XOF' au MVP
  status: PaymentStatusSchema,
  paymentUrl: z.string().url(),
  paymentMethod: z.string().nullable(), // wave / orange_money / card — rempli au paid

  paidAt: IsoDateTimeSchema.nullable(),
  refundedAt: IsoDateTimeSchema.nullable(),
  disputedAt: IsoDateTimeSchema.nullable(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PaymentOutput = z.infer<typeof PaymentOutputSchema>;

/**
 * Sortie POST /v1/payments/intents. Réduite (paymentUrl + paymentId)
 * pour minimiser la surface vers le client (le reste se récupère via GET).
 */
export const PaymentIntentResponseSchema = z.object({
  paymentId: UuidSchema,
  paymentUrl: z.string().url(),
  providerIntentId: z.string(),
});
export type PaymentIntentResponse = z.infer<typeof PaymentIntentResponseSchema>;

export const PaymentListResponseSchema = z.object({
  payments: z.array(PaymentOutputSchema),
});
export type PaymentListResponse = z.infer<typeof PaymentListResponseSchema>;

// Query GET /v1/payments (admin).
export const PaymentAdminListQuerySchema = z.object({
  status: PaymentStatusSchema.optional(),
});
export type PaymentAdminListQuery = z.infer<typeof PaymentAdminListQuerySchema>;

/**
 * KPIs admin agrégés côté API (GET /v1/payments/kpis) — Lot 9.
 *
 * Remplace le calcul front approximatif (commission 10 % / frais 5 % du brut)
 * par des sommes EXACTES tirées des `pricing_snapshots` figés (commission =
 * Σ commission_fcfa × quantity ; frais logistique = Σ (collecte + livraison +
 * stockage) × quantity), bornées au mois en cours sur les paiements `paid`.
 */
export const PaymentKpisOutputSchema = z.object({
  /** Mois agrégé, ISO `YYYY-MM` (UTC). */
  period: z.string(),
  encaisseFcfa: FcfaAmountSchema,
  commissionFcfa: FcfaAmountSchema,
  fraisLogistiqueFcfa: FcfaAmountSchema,
  /** Nombre de paiements `paid` retenus dans la période. */
  paidCount: z.number().int().nonnegative(),
});
export type PaymentKpisOutput = z.infer<typeof PaymentKpisOutputSchema>;
