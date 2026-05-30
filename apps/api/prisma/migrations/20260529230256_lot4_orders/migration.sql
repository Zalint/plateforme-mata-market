-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('created', 'confirmed', 'collecting', 'collected', 'stored', 'delivering', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "delivery_period" AS ENUM ('morning', 'afternoon');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "offer_status" ADD VALUE 'reserved';
ALTER TYPE "offer_status" ADD VALUE 'sold';

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "client_user_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'created',
    "delivery_zone_id" UUID NOT NULL,
    "delivery_address_line" TEXT NOT NULL,
    "delivery_slot_date" DATE NOT NULL,
    "delivery_slot_period" "delivery_period" NOT NULL,
    "total_fcfa" INTEGER NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "confirmed_at" TIMESTAMP(3),
    "collected_at" TIMESTAMP(3),
    "stored_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "producer_user_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_at_order" INTEGER NOT NULL,
    "pricing_snapshot_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key","scope")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_client_user_id_created_at_idx" ON "orders"("client_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_delivery_slot_date_status_idx" ON "orders"("delivery_slot_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_pricing_snapshot_id_key" ON "order_items"("pricing_snapshot_id");

-- CreateIndex
CREATE INDEX "order_items_producer_user_id_created_at_idx" ON "order_items"("producer_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_offer_id_idx" ON "order_items"("offer_id");

-- CreateIndex
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_fkey" FOREIGN KEY ("delivery_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_producer_user_id_fkey" FOREIGN KEY ("producer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pricing_snapshot_id_fkey" FOREIGN KEY ("pricing_snapshot_id") REFERENCES "pricing_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- Lot 4 · SEQUENCE Postgres pour numérotation CMD-{YYYY}-{NNNN}
-- ─────────────────────────────────────────────────────────────────

-- Séquence atomique sans collision (concurrence multi-instance API).
-- Le service formate `CMD-${année courante}-${nextval padded 4}`.
-- La séquence ne reset pas à chaque année — décision MVP simple.
CREATE SEQUENCE "order_number_seq" START 1 INCREMENT 1 NO CYCLE;

-- ─────────────────────────────────────────────────────────────────
-- Lot 4 · CHECK constraints (Prisma 7 ne génère pas les CHECK custom)
-- ─────────────────────────────────────────────────────────────────

-- Montants commande non-négatifs (total = somme positive des items).
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_fcfa_non_negative_check"
  CHECK (total_fcfa >= 0);

-- payment_status borné aux valeurs Lot 4. Lot 5 alterera en enum dédié.
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_allowed_check"
  CHECK (payment_status IN ('pending', 'paid', 'refunded', 'disputed'));

-- Cohérence cancel : status=cancelled exige cancelled_at non null et inverse.
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_consistency_check"
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL));

-- Item : quantity > 0 et unit_price_at_order > 0 (refuse les commandes fantômes).
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive_check"
  CHECK (quantity > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_positive_check"
  CHECK (unit_price_at_order > 0);
