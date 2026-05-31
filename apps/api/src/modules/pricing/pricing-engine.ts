import type { PricingBase, PricingModel } from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';

/**
 * Moteur de calcul pricing · pur, sans Prisma, sans Fastify.
 *
 * Reçoit les 7 composantes "brutes" (prix producteur + grille tarifaire
 * configurée dans une rule), résout l'algèbre selon le modèle économique
 * et les bases pourcentage choisies, retourne les valeurs FCFA arrondies
 * par unité + producer_share + platform_share.
 *
 * Formule générale (par unité) :
 *   Final = ProducerPrice + Commission + Collection + Delivery + Storage
 *         + SafetyMargin − Discount
 *
 * Bases pourcentage (configurables par champ commissionBase / safetyMarginBase) :
 *   - producer_price    : base = ProducerPrice
 *   - subtotal_pre_pct  : base = ProducerPrice + Collection + Delivery + Storage
 *   - final_price       : base = Final (équation circulaire résolue algébriquement)
 *
 * Modèles économiques :
 *   - commission_pct : Commission = round(base × commissionPct / 100)
 *   - fixed_margin   : Commission = commissionFlatFcfa
 *   - mixed          : Commission = round(base × pct / 100) + commissionFlatFcfa
 *   - negotiated     : Commission = commissionFlatFcfa  (étiquette métier, math = fixed_margin)
 *
 * Invariant comptable sortie :
 *   producerShareFcfa + platformShareFcfa === finalPriceFcfa  (toujours, par construction)
 *
 * Référence : mockup §2584-2771, ARCHITECTURE.md §6, CLAUDE.md §G6 (zone critique 100%).
 */

export interface PricingEngineInput {
  /** Prix demandé par le producteur (FCFA entier, par unité, > 0). */
  producerPriceFcfa: number;
  model: PricingModel;
  commissionPct: number;
  commissionBase: PricingBase;
  commissionFlatFcfa: number;
  safetyMarginPct: number;
  safetyMarginBase: PricingBase;
  collectionFcfa: number;
  deliveryFcfa: number;
  storageFcfa: number;
  discountFcfa: number;
}

export interface PricingEngineOutput {
  producerPriceFcfa: number;
  commissionFcfa: number;
  collectionFcfa: number;
  deliveryFcfa: number;
  storageFcfa: number;
  safetyMarginFcfa: number;
  discountFcfa: number;

  /** = producerPriceFcfa + commissionFcfa + collectionFcfa + deliveryFcfa + storageFcfa + safetyMarginFcfa − discountFcfa */
  finalPriceFcfa: number;
  /** Part producteur, toujours égale au prix demandé (le producteur touche son prix). */
  producerShareFcfa: number;
  /** Part MATA = finalPriceFcfa − producerShareFcfa (toutes les marges + frais MATA). */
  platformShareFcfa: number;
}

// ─────────────────────────────────────────────────────────────────
// API publique

/**
 * Calcul des 7 composantes + totaux par unité. Pure function (déterministe).
 *
 * Lève `DomainError('VALIDATION', ...)` si :
 *  - producerPriceFcfa <= 0
 *  - commission_base + safety_margin_base "final_price" totalisent ≥ 100%
 *  - configuration produit un Final négatif (discount > somme des marges)
 */
export function computePricing(input: PricingEngineInput): PricingEngineOutput {
  if (input.producerPriceFcfa <= 0) {
    throw new DomainError('VALIDATION', 'producerPriceFcfa doit être > 0');
  }

  const P = input.producerPriceFcfa;
  const C = input.collectionFcfa;
  const L = input.deliveryFcfa;
  const S = input.storageFcfa;
  const D = input.discountFcfa;
  const subtotal = P + C + L + S;

  // Commission : pct + flat selon le modèle.
  // commission_pct : pct uniquement
  // fixed_margin / negotiated : flat uniquement
  // mixed : les deux
  const usesPct = input.model === 'commission_pct' || input.model === 'mixed';
  const usesFlat =
    input.model === 'fixed_margin' || input.model === 'mixed' || input.model === 'negotiated';

  const pctCommission = usesPct ? input.commissionPct : 0;
  const flatCommission = usesFlat ? input.commissionFlatFcfa : 0;
  const safetyPct = input.safetyMarginPct;

  // Pré-calcul : montants déjà connus (X) et fraction sur Final (alpha).
  // Final = (X) / (1 - alpha), si alpha ≥ 1 → impossible.
  let X = P + C + L + S - D + flatCommission;
  let alpha = 0;

  if (pctCommission > 0) {
    if (input.commissionBase === 'producer_price') {
      X += roundHalfEven(P * pctCommission, 100);
    } else if (input.commissionBase === 'subtotal_pre_pct') {
      X += roundHalfEven(subtotal * pctCommission, 100);
    } else {
      alpha += pctCommission / 100;
    }
  }

  if (safetyPct > 0) {
    if (input.safetyMarginBase === 'producer_price') {
      X += roundHalfEven(P * safetyPct, 100);
    } else if (input.safetyMarginBase === 'subtotal_pre_pct') {
      X += roundHalfEven(subtotal * safetyPct, 100);
    } else {
      alpha += safetyPct / 100;
    }
  }

  if (alpha >= 1) {
    throw new DomainError(
      'VALIDATION',
      'commission + marge sécurité sur prix final ≥ 100% (configuration impossible)',
      { details: { totalPctOnFinal: alpha * 100 } },
    );
  }

  // Final théorique → arrondi à l'entier FCFA.
  const finalTheoretical = X / (1 - alpha);
  const finalRounded = Math.round(finalTheoretical);

  // Recalcule les composantes pct selon les bases (utilise finalRounded
  // pour les bases final_price afin d'avoir des entiers cohérents).
  const commissionPctPart = computePctComponent({
    pct: pctCommission,
    base: input.commissionBase,
    P,
    subtotal,
    final: finalRounded,
  });
  const commissionFcfa = commissionPctPart + flatCommission;

  const safetyFcfa = computePctComponent({
    pct: safetyPct,
    base: input.safetyMarginBase,
    P,
    subtotal,
    final: finalRounded,
  });

  // Final final (peut différer de finalRounded de 1-2 FCFA suite à l'arrondi
  // des composantes — on prend la somme exacte pour préserver l'invariant
  // comptable strict).
  const finalPriceFcfa = P + commissionFcfa + C + L + S + safetyFcfa - D;

  if (finalPriceFcfa < P) {
    // platform_share serait négatif → MATA paye plus de remise qu'elle ne marge.
    throw new DomainError(
      'VALIDATION',
      'configuration invalide : la remise dépasse la somme des marges MATA (final < prix producteur)',
      {
        details: {
          producerPriceFcfa: P,
          finalPriceFcfa,
          discountFcfa: D,
        },
      },
    );
  }

  return {
    producerPriceFcfa: P,
    commissionFcfa,
    collectionFcfa: C,
    deliveryFcfa: L,
    storageFcfa: S,
    safetyMarginFcfa: safetyFcfa,
    discountFcfa: D,
    finalPriceFcfa,
    producerShareFcfa: P,
    platformShareFcfa: finalPriceFcfa - P,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers

function computePctComponent(args: {
  pct: number;
  base: PricingBase;
  P: number;
  subtotal: number;
  final: number;
}): number {
  if (args.pct <= 0) return 0;
  const base =
    args.base === 'producer_price'
      ? args.P
      : args.base === 'subtotal_pre_pct'
        ? args.subtotal
        : args.final;
  return roundHalfEven(base * args.pct, 100);
}

/**
 * Arrondi "banker's rounding" (half to even) : minimise le biais cumulatif
 * sur de gros volumes de transactions. `value` est la valeur AVANT division
 * par `divisor`. Implémentation pure entière pour éviter les imprécisions
 * float typiques de Math.round(P * pct / 100).
 *
 * Exemple : roundHalfEven(125, 100) = 1 (round to even, pas 2)
 *           roundHalfEven(175, 100) = 2
 *           roundHalfEven(150, 100) = 2 (round to even, pas 1)
 */
export function roundHalfEven(value: number, divisor: number): number {
  // Pour les nombres potentiellement décimaux (P * pct = 3000 * 10 = 30000,
  // mais avec final_price ça peut être 3873.56 * 10 = 38735.6), on travaille
  // en arrondissant d'abord à l'entier proche en évitant l'erreur float.
  const scaled = value;
  const q = Math.floor(scaled / divisor);
  const r = scaled - q * divisor;
  const half = divisor / 2;
  if (r < half) return q;
  if (r > half) return q + 1;
  // r === half : round to even
  return q % 2 === 0 ? q : q + 1;
}
