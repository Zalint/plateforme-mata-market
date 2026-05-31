import { DomainError } from '@mata/shared/errors';
import { describe, expect, it } from 'vitest';
import {
  computePricing,
  type PricingEngineInput,
  type PricingEngineOutput,
  roundHalfEven,
} from './pricing-engine.js';

/**
 * Zone critique 100% — CLAUDE.md §G6.
 *
 * Couvre :
 *  - 4 modèles × 3 bases pct (commission + safety)
 *  - invariant comptable producer_share + platform_share = final
 *  - cas dégénérés (pct=0, flat=0, discount=0)
 *  - cas pathologiques (alpha>=100%, final<producer, producer<=0)
 *  - arrondi half-to-even
 */

const base: PricingEngineInput = {
  producerPriceFcfa: 3000,
  model: 'commission_pct',
  commissionPct: 10,
  commissionBase: 'producer_price',
  commissionFlatFcfa: 0,
  safetyMarginPct: 0,
  safetyMarginBase: 'producer_price',
  collectionFcfa: 120,
  deliveryFcfa: 200,
  storageFcfa: 50,
  discountFcfa: 0,
};

function assertInvariant(out: PricingEngineOutput): void {
  expect(out.producerShareFcfa + out.platformShareFcfa).toBe(out.finalPriceFcfa);
  expect(out.producerShareFcfa).toBe(out.producerPriceFcfa);
  expect(out.platformShareFcfa).toBeGreaterThanOrEqual(0);
  expect(
    out.producerPriceFcfa +
      out.commissionFcfa +
      out.collectionFcfa +
      out.deliveryFcfa +
      out.storageFcfa +
      out.safetyMarginFcfa -
      out.discountFcfa,
  ).toBe(out.finalPriceFcfa);
}

describe('computePricing — modèle commission_pct, base producer_price', () => {
  it('commission = 10% sur 3000 = 300', () => {
    const out = computePricing(base);
    expect(out.producerPriceFcfa).toBe(3000);
    expect(out.commissionFcfa).toBe(300);
    expect(out.collectionFcfa).toBe(120);
    expect(out.deliveryFcfa).toBe(200);
    expect(out.storageFcfa).toBe(50);
    expect(out.safetyMarginFcfa).toBe(0);
    expect(out.discountFcfa).toBe(0);
    expect(out.finalPriceFcfa).toBe(3670);
    assertInvariant(out);
  });

  it('avec safety 3% sur producer = 90', () => {
    const out = computePricing({
      ...base,
      safetyMarginPct: 3,
      safetyMarginBase: 'producer_price',
    });
    expect(out.commissionFcfa).toBe(300);
    expect(out.safetyMarginFcfa).toBe(90);
    expect(out.finalPriceFcfa).toBe(3760);
    assertInvariant(out);
  });

  it('avec remise 100 FCFA', () => {
    const out = computePricing({ ...base, discountFcfa: 100 });
    expect(out.finalPriceFcfa).toBe(3570);
    assertInvariant(out);
  });
});

describe('computePricing — modèle commission_pct, base final_price (circulaire)', () => {
  it('algèbre résolue : X / (1 − pct) avec safety inactif', () => {
    const out = computePricing({
      ...base,
      commissionBase: 'final_price',
      commissionPct: 10,
    });
    // X = 3000 + 120 + 200 + 50 = 3370, alpha = 0.1
    // final = 3370 / 0.9 = 3744.44 → round 3744
    // commission = round(3744 * 10 / 100) = 374
    // recheck : 3000 + 374 + 120 + 200 + 50 = 3744 ✓
    expect(out.finalPriceFcfa).toBe(3744);
    expect(out.commissionFcfa).toBe(374);
    assertInvariant(out);
  });

  it('safety également sur final → alpha = pct_commission + pct_safety', () => {
    const out = computePricing({
      ...base,
      commissionBase: 'final_price',
      commissionPct: 10,
      safetyMarginPct: 3,
      safetyMarginBase: 'final_price',
    });
    // X = 3370, alpha = 0.13
    // final = 3370 / 0.87 ≈ 3873.56 → round 3874
    // commission = round(3874 * 0.10) = 387
    // safety = round(3874 * 0.03) = 116
    // final recompute = 3000 + 387 + 120 + 200 + 50 + 116 = 3873
    // (1 FCFA de drift dû à l'arrondi des composantes : OK, on prend la somme)
    expect(out.commissionFcfa).toBe(387);
    expect(out.safetyMarginFcfa).toBe(116);
    expect(out.finalPriceFcfa).toBe(3873);
    assertInvariant(out);
  });
});

describe('computePricing — modèle commission_pct, base subtotal_pre_pct', () => {
  it('base = producer + collecte + livraison + storage = 3370', () => {
    const out = computePricing({
      ...base,
      commissionBase: 'subtotal_pre_pct',
      commissionPct: 10,
    });
    // commission = round(3370 * 10 / 100) = 337
    expect(out.commissionFcfa).toBe(337);
    expect(out.finalPriceFcfa).toBe(3000 + 337 + 120 + 200 + 50);
    assertInvariant(out);
  });
});

describe('computePricing — modèle fixed_margin', () => {
  it('commission = montant fixe, pct ignoré', () => {
    const out = computePricing({
      ...base,
      model: 'fixed_margin',
      commissionPct: 99, // ignoré
      commissionFlatFcfa: 500,
    });
    expect(out.commissionFcfa).toBe(500);
    expect(out.finalPriceFcfa).toBe(3000 + 500 + 120 + 200 + 50);
    assertInvariant(out);
  });
});

describe('computePricing — modèle mixed', () => {
  it('commission = pct × base + flat', () => {
    const out = computePricing({
      ...base,
      model: 'mixed',
      commissionPct: 5,
      commissionBase: 'producer_price',
      commissionFlatFcfa: 200,
    });
    // pct part : 3000 * 5 / 100 = 150
    // commission = 150 + 200 = 350
    expect(out.commissionFcfa).toBe(350);
    assertInvariant(out);
  });

  it('mixed avec base final_price', () => {
    const out = computePricing({
      ...base,
      model: 'mixed',
      commissionPct: 10,
      commissionBase: 'final_price',
      commissionFlatFcfa: 200,
    });
    // X = 3000 + 120 + 200 + 50 + 200 (flat) = 3570
    // alpha = 0.1
    // final_theoretical = 3570 / 0.9 = 3966.67 → round 3967
    // pct_part = round(3967 * 10 / 100) = 397
    // commission = 397 + 200 = 597
    // final recompute = 3000 + 597 + 120 + 200 + 50 = 3967
    expect(out.commissionFcfa).toBe(597);
    expect(out.finalPriceFcfa).toBe(3967);
    assertInvariant(out);
  });
});

describe('computePricing — modèle negotiated', () => {
  it('équivalent à fixed_margin côté math', () => {
    const out = computePricing({
      ...base,
      model: 'negotiated',
      commissionPct: 50, // ignoré
      commissionFlatFcfa: 800,
    });
    expect(out.commissionFcfa).toBe(800);
    assertInvariant(out);
  });
});

describe('computePricing — cas dégénérés', () => {
  it('tous % = 0, tous flat = 0 → final = producer + frais fixes', () => {
    const out = computePricing({
      ...base,
      commissionPct: 0,
    });
    expect(out.commissionFcfa).toBe(0);
    expect(out.finalPriceFcfa).toBe(3370);
    assertInvariant(out);
  });

  it('aucun frais fixe, juste la commission %', () => {
    const out = computePricing({
      ...base,
      collectionFcfa: 0,
      deliveryFcfa: 0,
      storageFcfa: 0,
    });
    expect(out.commissionFcfa).toBe(300);
    expect(out.finalPriceFcfa).toBe(3300);
    assertInvariant(out);
  });

  it('remise = somme exacte des marges → platform_share = 0', () => {
    const out = computePricing({
      ...base,
      commissionPct: 10,
      discountFcfa: 670, // commission 300 + collecte 120 + livraison 200 + storage 50
    });
    expect(out.finalPriceFcfa).toBe(3000);
    expect(out.producerShareFcfa).toBe(3000);
    expect(out.platformShareFcfa).toBe(0);
    assertInvariant(out);
  });
});

describe('computePricing — cas pathologiques (DomainError VALIDATION)', () => {
  it('producerPriceFcfa = 0 → erreur', () => {
    expect(() => computePricing({ ...base, producerPriceFcfa: 0 })).toThrow(DomainError);
  });

  it('producerPriceFcfa négatif → erreur', () => {
    expect(() => computePricing({ ...base, producerPriceFcfa: -100 })).toThrow(DomainError);
  });

  it('commission + safety sur final ≥ 100% → erreur', () => {
    expect(() =>
      computePricing({
        ...base,
        commissionBase: 'final_price',
        commissionPct: 60,
        safetyMarginBase: 'final_price',
        safetyMarginPct: 50,
      }),
    ).toThrow(/configuration impossible/);
  });

  it('remise > somme des marges → final < producer → erreur', () => {
    expect(() =>
      computePricing({
        ...base,
        discountFcfa: 10_000, // bien plus que les marges
      }),
    ).toThrow(/remise dépasse/);
  });
});

describe('computePricing — combinaisons mixtes commission/safety bases', () => {
  it('commission sur producer_price, safety sur final_price', () => {
    const out = computePricing({
      ...base,
      commissionBase: 'producer_price',
      commissionPct: 10,
      safetyMarginBase: 'final_price',
      safetyMarginPct: 3,
    });
    // X = 3000 + 120 + 200 + 50 + round(3000*0.10) = 3370 + 300 = 3670
    // alpha = 0.03 (safety sur final)
    // final_theoretical = 3670 / 0.97 = 3783.51 → round 3784
    // commission = round(3000 * 10 / 100) = 300 (pas recalculé car base = producer)
    // safety = round(3784 * 3 / 100) = 114
    // final recompute = 3000 + 300 + 120 + 200 + 50 + 114 = 3784
    expect(out.commissionFcfa).toBe(300);
    expect(out.safetyMarginFcfa).toBe(114);
    expect(out.finalPriceFcfa).toBe(3784);
    assertInvariant(out);
  });

  it('commission sur final, safety sur producer', () => {
    const out = computePricing({
      ...base,
      commissionBase: 'final_price',
      commissionPct: 10,
      safetyMarginBase: 'producer_price',
      safetyMarginPct: 3,
    });
    // safety_fcfa direct = round(3000 * 3 / 100) = 90 (ajouté à X)
    // X = 3000 + 120 + 200 + 50 - 0 + 0 + 90 = 3460
    // alpha = 0.10 (commission sur final)
    // final_theoretical = 3460 / 0.90 = 3844.44 → round 3844
    // commission = round(3844 * 10 / 100) = 384
    // safety = 90 (re-confirmé)
    // final recompute = 3000 + 384 + 120 + 200 + 50 + 90 = 3844
    expect(out.commissionFcfa).toBe(384);
    expect(out.safetyMarginFcfa).toBe(90);
    expect(out.finalPriceFcfa).toBe(3844);
    assertInvariant(out);
  });
});

describe('roundHalfEven (banker rounding)', () => {
  it('arrondi vers le bas si reste < demi', () => {
    expect(roundHalfEven(124, 100)).toBe(1); // 124 / 100 = 1.24 → 1
  });

  it('arrondi vers le haut si reste > demi', () => {
    expect(roundHalfEven(176, 100)).toBe(2); // 176 / 100 = 1.76 → 2
  });

  it('arrondi vers pair si exactement à la demi', () => {
    expect(roundHalfEven(150, 100)).toBe(2); // 1.5 → 2 (pair)
    expect(roundHalfEven(250, 100)).toBe(2); // 2.5 → 2 (pair)
    expect(roundHalfEven(350, 100)).toBe(4); // 3.5 → 4 (pair)
  });

  it('zéro reste un zéro', () => {
    expect(roundHalfEven(0, 100)).toBe(0);
  });

  it('reproduit (3000 × 10) / 100 = 300 exactement', () => {
    expect(roundHalfEven(3000 * 10, 100)).toBe(300);
  });
});
