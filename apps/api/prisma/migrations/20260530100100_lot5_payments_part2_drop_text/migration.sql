-- ═══════════════════════════════════════════════════════════════════
-- Lot 5 · PART 2 — drop TEXT payment_status + rename v2 → payment_status
--
-- Migration DESTRUCTIVE (drop column). En PROD, doit être déployée
-- dans une release SÉPARÉE de PART 1 (cf. CLAUDE.md §G4 « DEUX
-- déploiements » + BACKLOG [lot-5→lot-9]).
--
-- Pré-requis : PART 1 doit être appliquée, la colonne payment_status_v2
-- doit exister et être backfilled. Si on saute PART 1, ce SQL échoue
-- proprement (DROP COLUMN sur une colonne qui n'existe pas ou rename
-- qui collisionne).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Drop la CHECK constraint Lot 4 (bornait la TEXT à 4 valeurs).
--    Sans cela, le DROP COLUMN suivant cleanup la contrainte automatiquement,
--    mais on l'explicite pour faciliter la lecture (et le diff inverse).
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_status_allowed_check";

-- 2. Drop la colonne TEXT (les données sont déjà dans payment_status_v2).
ALTER TABLE "orders" DROP COLUMN "payment_status";

-- 3. Rename v2 → payment_status (l'app référence cette colonne dans schema.prisma).
ALTER TABLE "orders" RENAME COLUMN "payment_status_v2" TO "payment_status";

-- À ce stade, orders.payment_status est :
--   - type "payment_status" (enum)
--   - NOT NULL DEFAULT 'pending'
-- Conforme au schema.prisma final.
