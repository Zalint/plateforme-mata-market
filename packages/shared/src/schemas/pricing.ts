import { z } from 'zod';
import { PRICING_BASES, PRICING_MODELS, PRICING_SCOPES } from '../constants/enums.js';
import { IsoDateTimeSchema, UuidSchema } from './common.js';
import { ProductCategorySchema } from './offer.js';

/**
 * Schemas Pricing · règles configurables (7 composantes, 4 modèles, 3 bases pct)
 * et snapshots figés au moment de la commande.
 *
 * Référence : ARCHITECTURE.md §6 + mockup §2584-2771.
 *
 * Invariants enforced par la migration SQL (CHECK constraints) :
 *  - Scope XOR : `scope=category` ⇒ `category` rempli + `offerId` null, et inverse.
 *  - Pourcentages bornés 0-100.
 *  - Montants FCFA non-négatifs.
 *  - `validUntil > validFrom` si renseigné.
 *  - Snapshots : `producer_share + platform_share = final_price` (immuabilité côté service).
 */

// ─────────────────────────────────────────────────────────────────
// Enums Zod

export const PricingModelSchema = z.enum(PRICING_MODELS);
export const PricingScopeSchema = z.enum(PRICING_SCOPES);
export const PricingBaseSchema = z.enum(PRICING_BASES);

// ─────────────────────────────────────────────────────────────────
// Helpers

// Composante FCFA (entier non-négatif, peut être 0 = inactive).
// Plafond généreux pour absorber les gros volumes B2B sans bloquer.
const FcfaComponentSchema = z
  .number()
  .int('Montant FCFA en entiers (pas de centimes)')
  .nonnegative('Montant FCFA non-négatif')
  .max(200_000_000, 'Montant FCFA trop élevé (max 200 000 000)');

// Pourcentage entier 0-100. Le moteur traite 0 comme "composante inactive".
const PctSchema = z.number().int().min(0).max(100);

const QuantitySchema = z.number().int().positive().max(100_000);

// ─────────────────────────────────────────────────────────────────
// PricingRule

/**
 * Création — body POST /v1/pricing/rules (admin).
 *
 * Discriminé par `scope` (vérifié par `superRefine`) :
 *  - scope=category ⇒ `category` requis, `offerId` absent
 *  - scope=offer    ⇒ `offerId` requis, `category` absent
 *
 * Le `superRefine` combine la cohérence scope ET la cohérence période validité
 * (validUntil > validFrom). Redonde les CHECK SQL pour rejeter au plus tôt en API.
 */
export const PricingRuleCreateSchema = z
  .object({
    scope: PricingScopeSchema,
    category: ProductCategorySchema.optional(),
    offerId: UuidSchema.optional(),
    model: PricingModelSchema,
    commissionPct: PctSchema.default(0),
    commissionBase: PricingBaseSchema.default('producer_price'),
    commissionFlatFcfa: FcfaComponentSchema.default(0),
    safetyMarginPct: PctSchema.default(0),
    safetyMarginBase: PricingBaseSchema.default('producer_price'),
    collectionFcfa: FcfaComponentSchema.default(0),
    deliveryFcfa: FcfaComponentSchema.default(0),
    storageFcfa: FcfaComponentSchema.default(0),
    discountFcfa: FcfaComponentSchema.default(0),
    validFrom: IsoDateTimeSchema.optional(),
    validUntil: IsoDateTimeSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const scopeOk =
      (data.scope === 'category' && data.category !== undefined && data.offerId === undefined) ||
      (data.scope === 'offer' && data.offerId !== undefined && data.category === undefined);
    if (!scopeOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scope=category exige category seul, scope=offer exige offerId seul',
        path: ['scope'],
      });
    }
    if (
      data.validUntil !== null &&
      data.validUntil !== undefined &&
      data.validFrom !== undefined &&
      Date.parse(data.validUntil) <= Date.parse(data.validFrom)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validUntil doit être > validFrom',
        path: ['validUntil'],
      });
    }
  });

export type PricingRuleCreate = z.infer<typeof PricingRuleCreateSchema>;

/**
 * Update — PATCH /v1/pricing/rules/:id. Scope/category/offer immuables
 * (créer une nouvelle rule si la cible change), donc on omet ces champs.
 * Seules les composantes et la période sont modifiables.
 */
export const PricingRuleUpdateSchema = z
  .object({
    model: PricingModelSchema,
    commissionPct: PctSchema,
    commissionBase: PricingBaseSchema,
    commissionFlatFcfa: FcfaComponentSchema,
    safetyMarginPct: PctSchema,
    safetyMarginBase: PricingBaseSchema,
    collectionFcfa: FcfaComponentSchema,
    deliveryFcfa: FcfaComponentSchema,
    storageFcfa: FcfaComponentSchema,
    discountFcfa: FcfaComponentSchema,
    validFrom: IsoDateTimeSchema,
    validUntil: IsoDateTimeSchema.nullable(),
  })
  .partial()
  .refine(
    (data) =>
      data.validUntil === undefined ||
      data.validUntil === null ||
      data.validFrom === undefined ||
      Date.parse(data.validUntil) > Date.parse(data.validFrom),
    {
      path: ['validUntil'],
      message: 'validUntil doit être > validFrom',
    },
  );

export type PricingRuleUpdate = z.infer<typeof PricingRuleUpdateSchema>;

/**
 * Sortie API d'une rule. Le client (UI admin) en a besoin pour rendre les
 * inputs et l'historique createdBy/updatedBy.
 */
export const PricingRuleOutputSchema = z.object({
  id: UuidSchema,
  scope: PricingScopeSchema,
  category: ProductCategorySchema.nullable(),
  offerId: UuidSchema.nullable(),
  model: PricingModelSchema,

  commissionPct: PctSchema,
  commissionBase: PricingBaseSchema,
  commissionFlatFcfa: FcfaComponentSchema,

  safetyMarginPct: PctSchema,
  safetyMarginBase: PricingBaseSchema,

  collectionFcfa: FcfaComponentSchema,
  deliveryFcfa: FcfaComponentSchema,
  storageFcfa: FcfaComponentSchema,
  discountFcfa: FcfaComponentSchema,

  validFrom: IsoDateTimeSchema,
  validUntil: IsoDateTimeSchema.nullable(),

  createdBy: UuidSchema,
  updatedBy: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type PricingRuleOutput = z.infer<typeof PricingRuleOutputSchema>;

export const PricingRuleListResponseSchema = z.object({
  rules: z.array(PricingRuleOutputSchema),
});
export type PricingRuleListResponse = z.infer<typeof PricingRuleListResponseSchema>;

// Query GET /v1/pricing/rules
export const PricingRuleListQuerySchema = z.object({
  scope: PricingScopeSchema.optional(),
  category: ProductCategorySchema.optional(),
  offerId: UuidSchema.optional(),
  activeAt: IsoDateTimeSchema.optional(), // filtre validFrom <= X AND (validUntil null OR >= X)
});
export type PricingRuleListQuery = z.infer<typeof PricingRuleListQuerySchema>;

// ─────────────────────────────────────────────────────────────────
// Simulate

/**
 * POST /v1/pricing/simulate. Deux formes :
 *  - `offerId` seul → le service lookup la rule active + lit prix producteur de l'offre
 *  - `inline`       → override complet pour tester un cas (UI admin)
 *
 * Le moteur applique les arrondis et garantit l'invariant.
 */
export const PricingSimulateInputSchema = z.union([
  z.object({
    offerId: UuidSchema,
    quantity: QuantitySchema.default(1),
  }),
  z.object({
    inline: z.object({
      producerPriceFcfa: FcfaComponentSchema,
      model: PricingModelSchema,
      commissionPct: PctSchema.default(0),
      commissionBase: PricingBaseSchema.default('producer_price'),
      commissionFlatFcfa: FcfaComponentSchema.default(0),
      safetyMarginPct: PctSchema.default(0),
      safetyMarginBase: PricingBaseSchema.default('producer_price'),
      collectionFcfa: FcfaComponentSchema.default(0),
      deliveryFcfa: FcfaComponentSchema.default(0),
      storageFcfa: FcfaComponentSchema.default(0),
      discountFcfa: FcfaComponentSchema.default(0),
      quantity: QuantitySchema.default(1),
    }),
  }),
]);
export type PricingSimulateInput = z.infer<typeof PricingSimulateInputSchema>;

/**
 * Sortie simulate — calculée par unité (et par ligne).
 *
 * `ruleId` est null si l'input est `inline` (pas de rule persistée).
 */
export const PricingSimulateOutputSchema = z.object({
  ruleId: UuidSchema.nullable(),
  modelUsed: PricingModelSchema,
  quantity: z.number().int().positive(),

  // Par unité
  perUnit: z.object({
    producerPriceFcfa: FcfaComponentSchema,
    commissionFcfa: FcfaComponentSchema,
    collectionFcfa: FcfaComponentSchema,
    deliveryFcfa: FcfaComponentSchema,
    storageFcfa: FcfaComponentSchema,
    safetyMarginFcfa: FcfaComponentSchema,
    discountFcfa: FcfaComponentSchema,
    finalPriceFcfa: FcfaComponentSchema,
    producerShareFcfa: FcfaComponentSchema,
    platformShareFcfa: FcfaComponentSchema,
  }),

  // Multiplié par quantity
  lineTotal: z.object({
    producerPriceFcfa: FcfaComponentSchema,
    finalPriceFcfa: FcfaComponentSchema,
    producerShareFcfa: FcfaComponentSchema,
    platformShareFcfa: FcfaComponentSchema,
  }),
});
export type PricingSimulateOutput = z.infer<typeof PricingSimulateOutputSchema>;

// ─────────────────────────────────────────────────────────────────
// Snapshot (sortie API — Lot 4 affichera order details avec le snapshot lié)

export const PricingSnapshotOutputSchema = z.object({
  id: UuidSchema,
  modelUsed: PricingModelSchema,
  pricingRuleId: UuidSchema.nullable(),
  quantity: z.number().int().positive(),

  producerPriceFcfa: FcfaComponentSchema,
  commissionFcfa: FcfaComponentSchema,
  collectionFcfa: FcfaComponentSchema,
  deliveryFcfa: FcfaComponentSchema,
  storageFcfa: FcfaComponentSchema,
  safetyMarginFcfa: FcfaComponentSchema,
  discountFcfa: FcfaComponentSchema,

  finalPriceFcfa: FcfaComponentSchema,
  producerShareFcfa: FcfaComponentSchema,
  platformShareFcfa: FcfaComponentSchema,

  createdAt: IsoDateTimeSchema,
});
export type PricingSnapshotOutput = z.infer<typeof PricingSnapshotOutputSchema>;
