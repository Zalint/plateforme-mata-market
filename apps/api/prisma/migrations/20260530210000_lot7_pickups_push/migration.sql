-- ═══════════════════════════════════════════════════════════════════
-- Lot 7 · Tournées de collecte + Web Push
--
-- - Enum PickupStatus (scheduled / to_confirm / confirmed / collecting /
--   collected / cancelled) aligné sur la légende mockup §admin/pickup.
-- - Table pickups (PKP-YYYY-NNNN via SEQUENCE pickup_number_seq, zone FK,
--   scheduled_for, period, vehicle_type, driver, status).
-- - Table pickup_items (liaison pickup ↔ order_item, UNIQUE order_item_id,
--   FK order_items en ON DELETE RESTRICT pour ne pas perdre l'historique).
-- - Table push_subscriptions (Web Push VAPID, endpoint unique par device).
-- - SEQUENCE pickup_number_seq.
--
-- Référence : ARCHITECTURE.md §7 (Outbox/n8n), CLAUDE.md §G1 + §G3 + §G5.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Enum
-- ─────────────────────────────────────────────────────────────────

CREATE TYPE "pickup_status" AS ENUM (
  'scheduled',
  'to_confirm',
  'confirmed',
  'collecting',
  'collected',
  'cancelled'
);

-- ─────────────────────────────────────────────────────────────────
-- 2. SEQUENCE pour numérotation PKP-{YYYY}-{NNNN}
--
-- Pattern identique à order_number_seq (Lot 4) et
-- teleconsult_session_number_seq (Lot 6) : atomique, pas de collision en
-- concurrence, pas de reset annuel.
-- ─────────────────────────────────────────────────────────────────

CREATE SEQUENCE "pickup_number_seq" START 1 INCREMENT 1 NO CYCLE;

-- ─────────────────────────────────────────────────────────────────
-- 3. Table pickups
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "pickups" (
    "id" UUID NOT NULL,
    "pickup_number" TEXT NOT NULL,
    "zone_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "scheduled_period" "delivery_period" NOT NULL,
    "vehicle_type" TEXT,
    "driver_display_name" TEXT,
    "status" "pickup_status" NOT NULL DEFAULT 'scheduled',
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pickups_pickup_number_key"
  ON "pickups"("pickup_number");

CREATE INDEX "pickups_zone_id_scheduled_for_idx"
  ON "pickups"("zone_id", "scheduled_for");

CREATE INDEX "pickups_status_scheduled_for_idx"
  ON "pickups"("status", "scheduled_for");

ALTER TABLE "pickups" ADD CONSTRAINT "pickups_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "zones"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK : cohérence cancelled_at ↔ cancel_reason (l'un implique l'autre).
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_cancel_consistency_check"
  CHECK ((cancelled_at IS NULL) = (cancel_reason IS NULL));

-- ─────────────────────────────────────────────────────────────────
-- 4. Table pickup_items
--
-- FK vers order_items en ON DELETE RESTRICT (PAS cascade) : on ne perd
-- jamais l'historique d'une commande même si une tournée est purgée
-- (CLAUDE.md / brief Lot 7).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "pickup_items" (
    "id" UUID NOT NULL,
    "pickup_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "collected" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pickup_items_order_item_id_key"
  ON "pickup_items"("order_item_id");

CREATE INDEX "pickup_items_pickup_id_idx"
  ON "pickup_items"("pickup_id");

ALTER TABLE "pickup_items" ADD CONSTRAINT "pickup_items_pickup_id_fkey"
  FOREIGN KEY ("pickup_id") REFERENCES "pickups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pickup_items" ADD CONSTRAINT "pickup_items_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- 5. Table push_subscriptions
--
-- CLAUDE.md §G5 : endpoint qui renvoie 410 supprimé immédiatement côté
-- service. endpoint UNIQUE = ré-abonnement du même device = upsert.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key"
  ON "push_subscriptions"("endpoint");

CREATE INDEX "push_subscriptions_user_id_idx"
  ON "push_subscriptions"("user_id");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
