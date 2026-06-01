-- Lot « catégories dynamiques » — Release 1 (non destructive).
-- Crée la table product_categories, seed les 6 catégories historiques, ajoute
-- les colonnes category_slug (FK) sur offers/pricing_rules et backfille depuis
-- l'enum. L'enum product_category + les colonnes `category` restent en place
-- (supprimés en Release 2). Voir docs/BACKLOG.md.

-- 1. Table taxonomie
CREATE TABLE "product_categories" (
    "slug" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "product_categories_is_active_sort_order_idx" ON "product_categories"("is_active", "sort_order");

-- 2. Seed des catégories historiques (slug = anciennes valeurs de l'enum)
INSERT INTO "product_categories" ("slug", "label_fr", "emoji", "sort_order", "updated_at") VALUES
  ('poultry',    'Volaille',  '🐓', 1, CURRENT_TIMESTAMP),
  ('eggs',       'Œufs',      '🥚', 2, CURRENT_TIMESTAMP),
  ('cattle',     'Bovin',     '🐄', 3, CURRENT_TIMESTAMP),
  ('sheep',      'Ovin',      '🐑', 4, CURRENT_TIMESTAMP),
  ('vegetables', 'Maraîcher', '🥬', 5, CURRENT_TIMESTAMP),
  ('fish',       'Poisson',   '🐟', 6, CURRENT_TIMESTAMP);

-- 3. Colonnes category_slug + assouplissement de l'enum (nullable en R1)
ALTER TABLE "offers" ADD COLUMN "category_slug" TEXT,
ALTER COLUMN "category" DROP NOT NULL;

ALTER TABLE "pricing_rules" ADD COLUMN "category_slug" TEXT;

-- 4. Backfill depuis l'enum (cast enum → text ; les slugs sont identiques)
UPDATE "offers" SET "category_slug" = "category"::text WHERE "category" IS NOT NULL;
UPDATE "pricing_rules" SET "category_slug" = "category"::text WHERE "category" IS NOT NULL;

-- 5. Index de filtre
CREATE INDEX "offers_category_slug_status_created_at_idx" ON "offers"("category_slug", "status", "created_at" DESC);
CREATE INDEX "pricing_rules_category_slug_valid_from_idx" ON "pricing_rules"("category_slug", "valid_from" DESC);

-- 6. Clés étrangères (valides : tous les category_slug existent désormais)
ALTER TABLE "offers" ADD CONSTRAINT "offers_category_slug_fkey" FOREIGN KEY ("category_slug") REFERENCES "product_categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_category_slug_fkey" FOREIGN KEY ("category_slug") REFERENCES "product_categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Bascule de la contrainte XOR scope (category enum → category_slug). Le
-- backfill (étape 4) garantit que les règles category existantes ont déjà
-- category_slug renseigné, donc la nouvelle contrainte est satisfaite.
ALTER TABLE "pricing_rules" DROP CONSTRAINT "pricing_rules_scope_xor_check";
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_scope_xor_check" CHECK (
  (scope = 'category' AND category_slug IS NOT NULL AND offer_id IS NULL) OR
  (scope = 'offer'    AND category_slug IS NULL     AND offer_id IS NOT NULL)
);
