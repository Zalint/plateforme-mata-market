import { z } from 'zod';
import { OFFER_STATUSES, OFFER_UNITS } from '../constants/enums.js';
import {
  FcfaAmountSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
  UuidSchema,
} from './common.js';

/**
 * Schemas Offer · offres produit + workflow validation.
 *
 * Workflow status (cf. schema.prisma) :
 *   draft     → pending      (producteur soumet)
 *   pending   → draft        (producteur retire pour corriger, tant que pending)
 *   pending   → validated    (admin valide)
 *   pending   → rejected     (admin refuse, raison obligatoire)
 *   validated → suspended    (admin OU producteur masque)
 *   suspended → validated    (admin OU producteur réactive)
 *
 * PATCH (édition champs) autorisé uniquement en `draft`. Pour modifier
 * une offre publiée le producteur doit créer une nouvelle offre.
 */

export const OfferStatusSchema = z.enum(OFFER_STATUSES);
export const OfferUnitSchema = z.enum(OFFER_UNITS);

// Catégorie produit = SLUG vers la table `product_categories` (taxonomie
// data-driven, gérée par l'admin). On ne valide plus contre un enum figé : le
// slug doit respecter le format ci-dessous, et son existence + son statut actif
// sont vérifiés à l'exécution côté service (offer.create) + garantis par la FK
// Postgres. Cf. ARCHITECTURE.md (dérogation §E2/§G4, taxonomie dynamique).
export const ProductCategorySchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_-]*$/, 'slug invalide (minuscules, chiffres, - ou _)');

// ─────────────────────────────────────────────────────────────────
// Champs

const TitleSchema = z.string().min(3).max(120);
const QualityNoteSchema = z.string().max(280).optional();
const QuantitySchema = z.number().int().positive().max(100_000);

// ─────────────────────────────────────────────────────────────────
// CRUD

/**
 * Création d'une offre. Toujours créée en `draft`, le statut n'est PAS
 * dans le payload (côté service).
 */
export const OfferCreateSchema = z
  .object({
    siteId: UuidSchema,
    category: ProductCategorySchema,
    title: TitleSchema,
    unit: OfferUnitSchema,
    quantity: QuantitySchema,
    priceFcfa: FcfaAmountSchema,
    availableFrom: IsoDateSchema,
    availableUntil: IsoDateSchema.optional(),
    qualityNote: QualityNoteSchema,
  })
  .refine(
    (data) =>
      data.availableUntil === undefined ||
      Date.parse(data.availableUntil) >= Date.parse(data.availableFrom),
    {
      path: ['availableUntil'],
      message: 'availableUntil doit être ≥ availableFrom',
    },
  );

export type OfferCreate = z.infer<typeof OfferCreateSchema>;

/**
 * Update partiel — autorisé uniquement quand l'offre est en `draft`
 * (vérifié côté service, rejette `409 CONFLICT` sinon).
 */
export const OfferUpdateSchema = z
  .object({
    siteId: UuidSchema,
    category: ProductCategorySchema,
    title: TitleSchema,
    unit: OfferUnitSchema,
    quantity: QuantitySchema,
    priceFcfa: FcfaAmountSchema,
    availableFrom: IsoDateSchema,
    availableUntil: IsoDateSchema.nullable(),
    qualityNote: QualityNoteSchema,
  })
  .partial();

export type OfferUpdate = z.infer<typeof OfferUpdateSchema>;

// ─────────────────────────────────────────────────────────────────
// Photos (cloudinary public_id only)

export const OfferPhotoSchema = z.object({
  id: UuidSchema,
  cloudinaryPublicId: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export type OfferPhoto = z.infer<typeof OfferPhotoSchema>;

// Attache une liste de public_id à une offre (après upload Cloudinary signé).
export const OfferAttachPhotosInputSchema = z.object({
  publicIds: z.array(z.string().min(1)).min(1).max(10),
});
export type OfferAttachPhotosInput = z.infer<typeof OfferAttachPhotosInputSchema>;

// ─────────────────────────────────────────────────────────────────
// Sortie

export const OfferOutputSchema = z.object({
  id: UuidSchema,
  producerUserId: UuidSchema,
  producerDisplayName: z.string(), // joint depuis users.display_name
  siteId: UuidSchema,
  siteName: z.string(), // joint depuis production_sites.name
  category: ProductCategorySchema,
  status: OfferStatusSchema,
  title: z.string(),
  unit: OfferUnitSchema,
  quantity: z.number().int(),
  quantityReserved: z.number().int().nonnegative(),
  priceFcfa: z.number().int().positive(),
  availableFrom: IsoDateSchema,
  availableUntil: IsoDateSchema.nullable(),
  qualityNote: z.string().nullable(),
  submittedAt: IsoDateTimeSchema.nullable(),
  validatedAt: IsoDateTimeSchema.nullable(),
  validatedBy: UuidSchema.nullable(),
  rejectionReason: z.string().nullable(),
  suspendedAt: IsoDateTimeSchema.nullable(),
  suspendedBy: UuidSchema.nullable(),
  photos: z.array(OfferPhotoSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type OfferOutput = z.infer<typeof OfferOutputSchema>;

// ─────────────────────────────────────────────────────────────────
// Listes (producer self + admin)

export const OfferListResponseSchema = z.object({
  offers: z.array(OfferOutputSchema),
});

export type OfferListResponse = z.infer<typeof OfferListResponseSchema>;

export const OfferAdminListQuerySchema = PaginationQuerySchema.extend({
  status: OfferStatusSchema.optional(),
  category: ProductCategorySchema.optional(),
  q: z.string().min(2).max(80).optional(), // recherche sur title
});

export type OfferAdminListQuery = z.infer<typeof OfferAdminListQuerySchema>;

export const OfferAdminListResponseSchema = z.object({
  offers: z.array(OfferOutputSchema),
  meta: PaginationMetaSchema,
});

export type OfferAdminListResponse = z.infer<typeof OfferAdminListResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Transitions

// `submit` : pas de body (producteur), service vérifie offer.status === draft.
export const OfferSubmitInputSchema = z.object({});

// `validate` : pas de body (admin), service vérifie offer.status === pending.
export const OfferValidateInputSchema = z.object({});

// `reject` : raison obligatoire, audit garde la trace.
export const OfferRejectInputSchema = z.object({
  reason: z.string().min(5).max(500),
});
export type OfferRejectInput = z.infer<typeof OfferRejectInputSchema>;

// `suspend` : raison courte recommandée (admin OU producteur).
export const OfferSuspendInputSchema = z.object({
  reason: z.string().min(3).max(300).optional(),
});
export type OfferSuspendInput = z.infer<typeof OfferSuspendInputSchema>;

// `reactivate` : pas de body, ramène suspended → validated.
export const OfferReactivateInputSchema = z.object({});
