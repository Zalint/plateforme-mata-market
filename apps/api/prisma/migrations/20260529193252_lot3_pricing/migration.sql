-- CreateEnum
CREATE TYPE "pricing_model" AS ENUM ('commission_pct', 'fixed_margin', 'mixed', 'negotiated');

-- CreateEnum
CREATE TYPE "pricing_scope" AS ENUM ('category', 'offer');

-- CreateEnum
CREATE TYPE "pricing_base" AS ENUM ('producer_price', 'final_price', 'subtotal_pre_pct');

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "scope" "pricing_scope" NOT NULL,
    "category" "product_category",
    "offer_id" UUID,
    "model" "pricing_model" NOT NULL,
    "commission_pct" INTEGER NOT NULL DEFAULT 0,
    "commission_base" "pricing_base" NOT NULL DEFAULT 'producer_price',
    "commission_flat_fcfa" INTEGER NOT NULL DEFAULT 0,
    "safety_margin_pct" INTEGER NOT NULL DEFAULT 0,
    "safety_margin_base" "pricing_base" NOT NULL DEFAULT 'producer_price',
    "collection_fcfa" INTEGER NOT NULL DEFAULT 0,
    "delivery_fcfa" INTEGER NOT NULL DEFAULT 0,
    "storage_fcfa" INTEGER NOT NULL DEFAULT 0,
    "discount_fcfa" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_snapshots" (
    "id" UUID NOT NULL,
    "model_used" "pricing_model" NOT NULL,
    "producer_price_fcfa" INTEGER NOT NULL,
    "commission_fcfa" INTEGER NOT NULL,
    "collection_fcfa" INTEGER NOT NULL,
    "delivery_fcfa" INTEGER NOT NULL,
    "storage_fcfa" INTEGER NOT NULL,
    "safety_margin_fcfa" INTEGER NOT NULL,
    "discount_fcfa" INTEGER NOT NULL,
    "final_price_fcfa" INTEGER NOT NULL,
    "producer_share_fcfa" INTEGER NOT NULL,
    "platform_share_fcfa" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricing_rule_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_rules_category_valid_from_idx" ON "pricing_rules"("category", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "pricing_rules_offer_id_valid_from_idx" ON "pricing_rules"("offer_id", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "pricing_snapshots_pricing_rule_id_created_at_idx" ON "pricing_snapshots"("pricing_rule_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- Lot 3 · CHECK constraints (Prisma 7 ne génère pas les CHECK custom)
-- ─────────────────────────────────────────────────────────────────

-- XOR scope : scope=category exige category NOT NULL et offer_id NULL.
-- scope=offer exige category NULL et offer_id NOT NULL.
-- Garantit qu'on ne peut pas créer une rule "fantôme" sans cible.
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_scope_xor_check" CHECK (
  (scope = 'category' AND category IS NOT NULL AND offer_id IS NULL) OR
  (scope = 'offer'    AND category IS NULL     AND offer_id IS NOT NULL)
);

-- Pourcentages bornés 0-100 (entiers). Default 0 = composante inactive.
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_commission_pct_range_check"
  CHECK (commission_pct BETWEEN 0 AND 100);
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_safety_margin_pct_range_check"
  CHECK (safety_margin_pct BETWEEN 0 AND 100);

-- Composantes FCFA non-négatives (la remise discount_fcfa est soustraite
-- mais reste stockée en valeur positive ; le moteur l'applique avec signe).
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_amounts_non_negative_check"
  CHECK (
    commission_flat_fcfa >= 0 AND
    collection_fcfa      >= 0 AND
    delivery_fcfa        >= 0 AND
    storage_fcfa         >= 0 AND
    discount_fcfa        >= 0
  );

-- Période de validité cohérente (si validUntil renseigné, postérieur à validFrom).
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_validity_range_check"
  CHECK (valid_until IS NULL OR valid_until > valid_from);

-- Snapshots : invariant comptable enforced au niveau DB.
-- producer_share + platform_share = final_price (par unité).
-- Complète le test côté code (cf. pricing-engine.ts).
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_share_invariant_check"
  CHECK (producer_share_fcfa + platform_share_fcfa = final_price_fcfa);

-- Snapshots : quantity > 0.
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_quantity_positive_check"
  CHECK (quantity > 0);

-- Snapshots : montants non-négatifs sauf discount (toujours positif stocké).
-- Note : commission peut être 0 (modèle fixed_margin=0 par exemple), donc >= 0.
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_amounts_non_negative_check"
  CHECK (
    producer_price_fcfa  >= 0 AND
    commission_fcfa      >= 0 AND
    collection_fcfa      >= 0 AND
    delivery_fcfa        >= 0 AND
    storage_fcfa         >= 0 AND
    safety_margin_fcfa   >= 0 AND
    discount_fcfa        >= 0 AND
    final_price_fcfa     >= 0
  );
