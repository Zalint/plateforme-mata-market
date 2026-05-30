import { z } from 'zod';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  PhoneSnSchema,
  UuidSchema,
} from './common.js';
import { OfferUnitSchema, ProductCategorySchema } from './offer.js';
import { DeliveryInputSchema, OrderItemInputSchema, PaymentMethodSchema } from './order.js';

/**
 * Schemas Guest checkout · commande invité sans compte (Lot 8).
 *
 * Référence : CLAUDE.md §G3 (« Mode invité SÉPARÉ : routes /v1/guest/*, plugin
 * Fastify dédié, rate-limit strict »), §G8 (Zod systématique aux frontières),
 * mockup §guest/checkout.
 *
 * Un invité réutilise les mêmes briques métier qu'une commande authentifiée
 * (items + livraison) mais fournit en plus son identité de contact
 * (`guestFullName`, `guestPhoneNumber`) et choisit son moyen de paiement
 * (`paymentMethod`). `consent` est obligatoire (case à cocher CGU). Le token
 * hCaptcha est optionnel : vérifié seulement si `HCAPTCHA_SECRET` est configuré
 * côté serveur (cf. `isHcaptchaConfigured`).
 */

// `PaymentMethodSchema` est ré-exporté depuis `order.ts` (défini là-bas pour
// éviter un cycle d'import — `guest.ts` dépend de `order.ts`).
export { PaymentMethodSchema };

// ─────────────────────────────────────────────────────────────────
// Helpers

// Nom de contact libre. Min 2 (« Ba »), max 120 pour borner.
const GuestFullNameSchema = z.string().trim().min(2).max(120);

// Token renvoyé par le widget hCaptcha côté navigateur. Borné pour éviter les
// payloads aberrants ; la vérification réelle se fait serveur-side.
const HcaptchaTokenSchema = z.string().min(1).max(5000);

// ─────────────────────────────────────────────────────────────────
// Création de commande invité

/**
 * Body POST /v1/guest/orders. Idempotency-Key passé en header (réutilise
 * `IdempotencyKeySchema` côté route). Symétrique de `OrderCreateSchema` +
 * identité de contact + moyen de paiement + consentement.
 */
export const CreateGuestOrderSchema = z
  .object({
    items: z.array(OrderItemInputSchema).min(1).max(50),
    delivery: DeliveryInputSchema,
    guestFullName: GuestFullNameSchema,
    guestPhoneNumber: PhoneSnSchema,
    paymentMethod: PaymentMethodSchema,
    // Consentement CGU explicite : doit valoir `true` (case cochée).
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Le consentement aux conditions est obligatoire' }),
    }),
    // Optionnel : présent si le widget hCaptcha est affiché côté front. Vérifié
    // serveur-side seulement si HCAPTCHA_SECRET est configuré.
    hcaptchaToken: HcaptchaTokenSchema.optional(),
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
export type CreateGuestOrder = z.infer<typeof CreateGuestOrderSchema>;

// ─────────────────────────────────────────────────────────────────
// Création d'intent de paiement invité

/**
 * Body POST /v1/guest/payments/intents. L'invité crée un payment intent
 * Bictorys pour une commande `online` déjà créée (lookup par orderId +
 * guestPhoneNumber, pas de JWT). Le webhook Bictorys confirme ensuite.
 */
export const CreateGuestPaymentIntentSchema = z.object({
  orderId: z.string().uuid(),
  // Re-fourni pour lier l'intent à l'identité de la commande invité (le serveur
  // vérifie qu'il correspond au guest_phone_number figé à la création).
  guestPhoneNumber: PhoneSnSchema,
  hcaptchaToken: HcaptchaTokenSchema.optional(),
});
export type CreateGuestPaymentIntent = z.infer<typeof CreateGuestPaymentIntentSchema>;

// ─────────────────────────────────────────────────────────────────
// Catalogue invité · version MASQUÉE (identité producteur cachée)
//
// Décision Lot 8 : un invité (non authentifié) ne voit PAS l'identité du
// producteur ni le nom du site (qui pourrait l'identifier). Il voit le produit,
// le prix, la zone de livraison et les photos. Le `producer.displayName` exposé
// au catalogue authentifié (`CatalogOfferItemSchema`) est volontairement omis ici.

export const GuestCatalogOfferListQuerySchema = PaginationQuerySchema.extend({
  category: ProductCategorySchema.optional(),
  zoneId: UuidSchema.optional(),
  q: z.string().min(2).max(80).optional(),
});
export type GuestCatalogOfferListQuery = z.infer<typeof GuestCatalogOfferListQuerySchema>;

export const GuestCatalogOfferItemSchema = z.object({
  id: UuidSchema,
  category: ProductCategorySchema,
  title: z.string(),
  unit: OfferUnitSchema,
  quantity: z.number().int(),
  priceFcfa: z.number().int().positive(),
  availableFrom: z.string().date(),
  qualityNote: z.string().nullable(),
  photoPublicIds: z.array(z.string()),
  // Seule la zone (livraison) est exposée — PAS le producteur ni le site.
  zoneId: UuidSchema,
});
export type GuestCatalogOfferItem = z.infer<typeof GuestCatalogOfferItemSchema>;

export const GuestCatalogOfferListResponseSchema = z.object({
  offers: z.array(GuestCatalogOfferItemSchema),
  meta: PaginationMetaSchema,
});
export type GuestCatalogOfferListResponse = z.infer<typeof GuestCatalogOfferListResponseSchema>;

export const GuestCatalogOfferDetailSchema = GuestCatalogOfferItemSchema.extend({
  availableUntil: z.string().date().nullable(),
});
export type GuestCatalogOfferDetail = z.infer<typeof GuestCatalogOfferDetailSchema>;
