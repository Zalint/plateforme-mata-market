import { z } from 'zod';
import { PaginationMetaSchema, PaginationQuerySchema, UuidSchema } from './common.js';
import { OfferUnitSchema, ProductCategorySchema } from './offer.js';

/**
 * Schemas Catalog · lecture publique des offres validées.
 *
 * Accessible par tout JWT (producer, client_pro, client_particulier, admin).
 * Le mode invité (Lot 8) aura sa propre route distincte `/v1/guest/catalog`
 * avec rate-limit dédié.
 *
 * Seuls les champs publics sont exposés ici (pas de quantityReserved, pas
 * de timestamps internes du workflow). Les producteurs continuent d'utiliser
 * `/v1/offers/me` pour leur vue complète.
 */

// ─────────────────────────────────────────────────────────────────
// Liste paginée + filtres

export const CatalogOfferListQuerySchema = PaginationQuerySchema.extend({
  category: ProductCategorySchema.optional(),
  zoneId: UuidSchema.optional(),
  q: z.string().min(2).max(80).optional(), // recherche full-text simple sur title / producer
});

export type CatalogOfferListQuery = z.infer<typeof CatalogOfferListQuerySchema>;

// Élément catalogue : version "publique", sans détails workflow.
export const CatalogOfferItemSchema = z.object({
  id: UuidSchema,
  category: ProductCategorySchema,
  title: z.string(),
  unit: OfferUnitSchema,
  quantity: z.number().int(),
  priceFcfa: z.number().int().positive(),
  availableFrom: z.string().date(),
  qualityNote: z.string().nullable(),
  photoPublicIds: z.array(z.string()), // ids Cloudinary (URLs reconstruites côté front)
  producer: z.object({
    userId: UuidSchema,
    displayName: z.string(),
    zoneId: UuidSchema,
  }),
  site: z.object({
    id: UuidSchema,
    name: z.string(),
    zoneId: UuidSchema,
  }),
});

export type CatalogOfferItem = z.infer<typeof CatalogOfferItemSchema>;

export const CatalogOfferListResponseSchema = z.object({
  offers: z.array(CatalogOfferItemSchema),
  meta: PaginationMetaSchema,
});

export type CatalogOfferListResponse = z.infer<typeof CatalogOfferListResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Détail (utilisé par l'écran `client/product`)

export const CatalogOfferDetailSchema = CatalogOfferItemSchema.extend({
  availableUntil: z.string().date().nullable(),
});

export type CatalogOfferDetail = z.infer<typeof CatalogOfferDetailSchema>;
