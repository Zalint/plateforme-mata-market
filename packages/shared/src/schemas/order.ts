import { z } from 'zod';
import { DELIVERY_PERIODS, ORDER_STATUSES, PAYMENT_STATUSES } from '../constants/enums.js';
import { FcfaAmountSchema, IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common.js';
import { PricingSnapshotOutputSchema } from './pricing.js';

/**
 * Schemas Order · commandes + cycle 8 étapes (Lot 4).
 *
 * Référence : ARCHITECTURE.md §6 (modèle), §13 (plan Lot 4), mockup
 * §sec-status-orders (8 statuts) + §client/cart + §admin/orders.
 *
 * State machine : voir `ORDER_TRANSITIONS` dans `@mata/shared/constants`.
 *
 * Idempotency : `POST /v1/orders` exige le header `X-Idempotency-Key`
 * (UUID v4 client) — voir `IdempotencyKeySchema` ci-dessous.
 */

// ─────────────────────────────────────────────────────────────────
// Enums Zod

export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export const DeliveryPeriodSchema = z.enum(DELIVERY_PERIODS);
export const OrderPaymentStatusSchema = z.enum(PAYMENT_STATUSES);

// ─────────────────────────────────────────────────────────────────
// Helpers

// UUID v4 strict (le client génère côté navigateur via crypto.randomUUID()).
export const IdempotencyKeySchema = z.string().uuid({
  message: 'X-Idempotency-Key doit être un UUID v4',
});

const QuantitySchema = z.number().int().positive().max(100_000);

// Adresse libre Sénégal. Le mockup montre "Almadies · Livraison souhaitée 28 mai".
const AddressLineSchema = z.string().min(3).max(200);

const CancelReasonSchema = z.string().min(3).max(300);

// ─────────────────────────────────────────────────────────────────
// Création de commande

/**
 * Une ligne du panier au moment du POST. Le serveur calcule le prix via
 * `pricingSnapshotService` du Lot 3 et FIGE le snapshot (immuable).
 */
export const OrderItemInputSchema = z.object({
  offerId: UuidSchema,
  quantity: QuantitySchema,
});
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;

export const DeliveryInputSchema = z.object({
  zoneId: UuidSchema,
  addressLine: AddressLineSchema,
  slotDate: IsoDateSchema,
  slotPeriod: DeliveryPeriodSchema,
});
export type DeliveryInput = z.infer<typeof DeliveryInputSchema>;

/**
 * Body POST /v1/orders. Idempotency-Key passé en header, pas dans le body.
 */
export const OrderCreateSchema = z
  .object({
    items: z.array(OrderItemInputSchema).min(1).max(50),
    delivery: DeliveryInputSchema,
  })
  .refine(
    (data) => {
      const offerIds = data.items.map((i) => i.offerId);
      return new Set(offerIds).size === offerIds.length;
    },
    {
      path: ['items'],
      message: 'Une même offre ne peut apparaître deux fois (consolide la quantité)',
    },
  );
export type OrderCreate = z.infer<typeof OrderCreateSchema>;

// ─────────────────────────────────────────────────────────────────
// Transitions

/**
 * Body POST /v1/orders/:id/status. Le service vérifie la transition via
 * `ORDER_TRANSITIONS` et écrit l'audit `order.status_change`.
 */
export const OrderStatusTransitionInputSchema = z.object({
  to: OrderStatusSchema,
});
export type OrderStatusTransitionInput = z.infer<typeof OrderStatusTransitionInputSchema>;

/**
 * Body POST /v1/orders/:id/cancel. Variante de transition avec raison
 * obligatoire (audit trace).
 */
export const OrderCancelInputSchema = z.object({
  reason: CancelReasonSchema,
});
export type OrderCancelInput = z.infer<typeof OrderCancelInputSchema>;

// ─────────────────────────────────────────────────────────────────
// Sortie API

/**
 * Item de commande retourné. Inclut le snapshot pricing pour permettre
 * au client d'afficher la décomposition (mockup admin §sec-status-orders
 * et client/orders détails).
 */
export const OrderItemOutputSchema = z.object({
  id: UuidSchema,
  offerId: UuidSchema,
  offerTitle: z.string(), // joint depuis offers.title pour affichage rapide
  producerUserId: UuidSchema,
  producerDisplayName: z.string(), // joint depuis users.display_name
  quantity: z.number().int().positive(),
  unitPriceAtOrder: FcfaAmountSchema,
  pricingSnapshot: PricingSnapshotOutputSchema,
  createdAt: IsoDateTimeSchema,
});
export type OrderItemOutput = z.infer<typeof OrderItemOutputSchema>;

export const OrderOutputSchema = z.object({
  id: UuidSchema,
  orderNumber: z.string(), // ex: CMD-2026-0001
  clientUserId: UuidSchema.nullable(),
  clientDisplayName: z.string().nullable(), // joint depuis users.display_name (null si guest)
  status: OrderStatusSchema,

  // Livraison
  deliveryZoneId: UuidSchema,
  deliveryZoneName: z.string(), // joint depuis zones.name
  deliveryAddressLine: z.string(),
  deliverySlotDate: IsoDateSchema,
  deliverySlotPeriod: DeliveryPeriodSchema,

  // Total figé
  totalFcfa: FcfaAmountSchema,

  // Lot 5 : enum dédié PaymentStatus (TEXT stub Lot 4 supprimé migration lot5_payments_part2)
  paymentStatus: OrderPaymentStatusSchema,

  // Items
  items: z.array(OrderItemOutputSchema),

  // Timestamps des transitions importantes
  confirmedAt: IsoDateTimeSchema.nullable(),
  collectedAt: IsoDateTimeSchema.nullable(),
  storedAt: IsoDateTimeSchema.nullable(),
  deliveredAt: IsoDateTimeSchema.nullable(),
  cancelledAt: IsoDateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type OrderOutput = z.infer<typeof OrderOutputSchema>;

export const OrderListResponseSchema = z.object({
  orders: z.array(OrderOutputSchema),
});
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

// Query GET /v1/orders (admin) avec filtres légers (pas de pagination MVP).
export const OrderAdminListQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
});
export type OrderAdminListQuery = z.infer<typeof OrderAdminListQuerySchema>;
