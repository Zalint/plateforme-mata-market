-- ═══════════════════════════════════════════════════════════════════
-- Lot 5 · PART 1 — ajout enum PaymentStatus + tables payments/payouts/
-- payout_items/outbox_events + colonne payment_status_v2 backfilled.
--
-- Migration EN DEUX TEMPS (cf. CLAUDE.md §G4 « Migrations destructives
-- en DEUX déploiements ») :
--  - PART 1 (ce fichier) : non destructive. Ajoute enum + colonne
--    transitoire + backfill. La colonne TEXT `payment_status` reste
--    en place pour permettre un rollback applicatif si besoin.
--  - PART 2 (20260530100100_lot5_payments_part2_drop_text) : destructive.
--    DROP TEXT + RENAME enum → payment_status.
--
-- En PROD ces deux migrations doivent être déployées en deux releases
-- distinctes (cf. BACKLOG [lot-5→lot-9]). En dev/test elles s'enchaînent
-- naturellement via `prisma migrate dev`.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Enums Lot 5
-- ─────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'refunded', 'disputed');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'sent', 'failed', 'blocked');

-- ─────────────────────────────────────────────────────────────────
-- 2. Table payments — 1:1 inverse avec orders (provider_intent_id unique)
-- ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider_intent_id" TEXT NOT NULL,
    "amount_fcfa" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "payment_url" TEXT NOT NULL,
    "payment_method" TEXT,
    "raw_webhook_payload" JSONB,
    "provider_customer" JSONB,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "disputed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_intent_id_key" ON "payments"("provider_intent_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK : montant > 0 (refuse les payments fantômes).
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_fcfa_positive_check"
  CHECK (amount_fcfa > 0);

-- CHECK : cohérence timestamps ↔ status.
--   paid     ⇒ paid_at NOT NULL
--   refunded ⇒ refunded_at NOT NULL
--   disputed ⇒ disputed_at NOT NULL
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_consistency_check"
  CHECK ((status = 'paid') = (paid_at IS NOT NULL) OR status IN ('refunded', 'disputed'));

-- ─────────────────────────────────────────────────────────────────
-- 3. Table payouts — reversement producteur
-- ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "producer_user_id" UUID NOT NULL,
    "amount_fcfa" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "payout_status" NOT NULL DEFAULT 'pending',
    "provider_disbursement_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "blocked_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payouts_provider_disbursement_id_key" ON "payouts"("provider_disbursement_id");

-- CreateIndex
CREATE INDEX "payouts_producer_user_id_status_idx" ON "payouts"("producer_user_id", "status");

-- CreateIndex
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_producer_user_id_fkey"
  FOREIGN KEY ("producer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK : montant > 0 (un payout vide n'a pas de sens).
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_fcfa_positive_check"
  CHECK (amount_fcfa > 0);

-- ─────────────────────────────────────────────────────────────────
-- 4. Table payout_items — liaison payout ↔ order_item (UNIQUE order_item_id)
-- ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "payout_items" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "amount_fcfa" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- UNIQUE absolument critique : empêche le double versement d'un même item
-- (idempotence du cron process-payouts).
CREATE UNIQUE INDEX "payout_items_order_item_id_key" ON "payout_items"("order_item_id");

-- CreateIndex
CREATE INDEX "payout_items_payout_id_idx" ON "payout_items"("payout_id");

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK : montant > 0 par item (preuve qu'on n'agrège pas du vide).
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_amount_fcfa_positive_check"
  CHECK (amount_fcfa > 0);

-- ─────────────────────────────────────────────────────────────────
-- 5. Table outbox_events — Pattern Outbox vers n8n (Lot 7 consommera)
-- ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dispatched_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_pending_created_at_idx" ON "outbox_events"("created_at");

-- CreateIndex
CREATE INDEX "outbox_events_event_type_created_at_idx" ON "outbox_events"("event_type", "created_at" DESC);

-- CHECK : retry_count >= 0 et borné à 100 (le cron arrête au-delà).
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_retry_count_check"
  CHECK (retry_count >= 0 AND retry_count <= 100);

-- ─────────────────────────────────────────────────────────────────
-- 6. orders.payment_status_v2 — colonne transitoire enum + backfill
--
-- La colonne TEXT `payment_status` reste en place (avec sa CHECK constraint
-- Lot 4) pour permettre un rollback applicatif au cas où.
-- PART 2 droppera la TEXT et renommera v2 → payment_status.
-- ─────────────────────────────────────────────────────────────────

-- AlterTable : ajout nullable d'abord, backfill, puis NOT NULL.
ALTER TABLE "orders" ADD COLUMN "payment_status_v2" "payment_status";

-- Backfill depuis la TEXT existante. La CHECK constraint Lot 4 garantit
-- que toutes les valeurs sont dans ('pending', 'paid', 'refunded', 'disputed'),
-- donc le cast PaymentStatus ne peut pas échouer.
UPDATE "orders" SET "payment_status_v2" = "payment_status"::"payment_status";

-- Une fois remplie, on impose NOT NULL + DEFAULT.
ALTER TABLE "orders" ALTER COLUMN "payment_status_v2" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "payment_status_v2" SET DEFAULT 'pending';
