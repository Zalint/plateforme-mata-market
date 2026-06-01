import type { PricingRuleOutput, PricingSnapshotOutput } from '@mata/shared/schemas';
import type { PricingRule, PricingSnapshot } from '@prisma/client';

/**
 * Mappers Prisma → Zod output. Convertit les `Date` en ISO 8601 string
 * et passe les champs nullable tels quels (Prisma utilise `null` pour optionnel,
 * cohérent avec Zod `.nullable()`).
 */

export function toPricingRuleOutput(r: PricingRule): PricingRuleOutput {
  return {
    id: r.id,
    scope: r.scope,
    category: r.categorySlug ?? r.category,
    offerId: r.offerId,
    model: r.model,
    commissionPct: r.commissionPct,
    commissionBase: r.commissionBase,
    commissionFlatFcfa: r.commissionFlatFcfa,
    safetyMarginPct: r.safetyMarginPct,
    safetyMarginBase: r.safetyMarginBase,
    collectionFcfa: r.collectionFcfa,
    deliveryFcfa: r.deliveryFcfa,
    storageFcfa: r.storageFcfa,
    discountFcfa: r.discountFcfa,
    validFrom: r.validFrom.toISOString(),
    validUntil: r.validUntil ? r.validUntil.toISOString() : null,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toPricingSnapshotOutput(s: PricingSnapshot): PricingSnapshotOutput {
  return {
    id: s.id,
    modelUsed: s.modelUsed,
    pricingRuleId: s.pricingRuleId,
    quantity: s.quantity,
    producerPriceFcfa: s.producerPriceFcfa,
    commissionFcfa: s.commissionFcfa,
    collectionFcfa: s.collectionFcfa,
    deliveryFcfa: s.deliveryFcfa,
    storageFcfa: s.storageFcfa,
    safetyMarginFcfa: s.safetyMarginFcfa,
    discountFcfa: s.discountFcfa,
    finalPriceFcfa: s.finalPriceFcfa,
    producerShareFcfa: s.producerShareFcfa,
    platformShareFcfa: s.platformShareFcfa,
    createdAt: s.createdAt.toISOString(),
  };
}
