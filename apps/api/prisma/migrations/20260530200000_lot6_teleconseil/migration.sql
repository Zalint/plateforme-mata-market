-- ═══════════════════════════════════════════════════════════════════
-- Lot 6 · Téléconseil sécurisé
--
-- - Enum TeleconsultCloseReason
-- - Tables teleconsult_codes (bcrypt + expiry + lockout) +
--   teleconsult_sessions (15 min, SES-YYYY-NNNN via SEQUENCE)
-- - Ajout colonne users.username (nullable, unique) pour lookup producteur
--   au démarrage de session (mockup §2888)
-- - SEQUENCE teleconsult_session_number_seq
--
-- Référence : ARCHITECTURE.md §9 « Téléconseil », CLAUDE.md §G8 + §G3 + §G4.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Enum
-- ─────────────────────────────────────────────────────────────────

CREATE TYPE "teleconsult_close_reason" AS ENUM (
  'expired',
  'closed_by_teleconsultant',
  'revoked_by_producer',
  'revoked_by_admin'
);

-- ─────────────────────────────────────────────────────────────────
-- 2. Colonne users.username (nullable, unique)
--
-- Backfill possible via le seed-dev ou côté API au prochain /v1/auth/me
-- pour les rows existants. Pas de NOT NULL au Lot 6 pour ne pas casser
-- les users sans username Keycloak résolu.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- ─────────────────────────────────────────────────────────────────
-- 3. Table teleconsult_codes
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "teleconsult_codes" (
    "id" UUID NOT NULL,
    "producer_user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teleconsult_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "teleconsult_codes_producer_user_id_expires_at_used_at_idx"
  ON "teleconsult_codes"("producer_user_id", "expires_at", "used_at");

CREATE INDEX "teleconsult_codes_created_at_idx"
  ON "teleconsult_codes"("created_at");

ALTER TABLE "teleconsult_codes" ADD CONSTRAINT "teleconsult_codes_producer_user_id_fkey"
  FOREIGN KEY ("producer_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK : failed_attempts borné (anti-overflow et lisibilité).
ALTER TABLE "teleconsult_codes" ADD CONSTRAINT "teleconsult_codes_failed_attempts_check"
  CHECK ("failed_attempts" >= 0 AND "failed_attempts" <= 100);

-- CHECK : expires_at strictement après created_at.
ALTER TABLE "teleconsult_codes" ADD CONSTRAINT "teleconsult_codes_expires_after_created_check"
  CHECK ("expires_at" > "created_at");

-- ─────────────────────────────────────────────────────────────────
-- 4. SEQUENCE pour numérotation SES-{YYYY}-{NNNN}
--
-- Pattern identique à `order_number_seq` (cf. Lot 4) : atomique, pas de
-- collision en concurrence, pas de reset annuel (le numéro reste unique
-- globalement même si l'année du préfixe change).
-- ─────────────────────────────────────────────────────────────────

CREATE SEQUENCE "teleconsult_session_number_seq" START 1 INCREMENT 1 NO CYCLE;

-- ─────────────────────────────────────────────────────────────────
-- 5. Table teleconsult_sessions
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "teleconsult_sessions" (
    "id" UUID NOT NULL,
    "session_number" TEXT NOT NULL,
    "teleconsultant_user_id" UUID NOT NULL,
    "producer_user_id" UUID NOT NULL,
    "code_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "close_reason" "teleconsult_close_reason",
    "closed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teleconsult_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teleconsult_sessions_session_number_key"
  ON "teleconsult_sessions"("session_number");

CREATE INDEX "teleconsult_sessions_teleconsultant_user_id_closed_at_idx"
  ON "teleconsult_sessions"("teleconsultant_user_id", "closed_at");

CREATE INDEX "teleconsult_sessions_producer_user_id_closed_at_idx"
  ON "teleconsult_sessions"("producer_user_id", "closed_at");

CREATE INDEX "teleconsult_sessions_expires_at_closed_at_idx"
  ON "teleconsult_sessions"("expires_at", "closed_at");

ALTER TABLE "teleconsult_sessions" ADD CONSTRAINT "teleconsult_sessions_teleconsultant_user_id_fkey"
  FOREIGN KEY ("teleconsultant_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teleconsult_sessions" ADD CONSTRAINT "teleconsult_sessions_producer_user_id_fkey"
  FOREIGN KEY ("producer_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teleconsult_sessions" ADD CONSTRAINT "teleconsult_sessions_code_id_fkey"
  FOREIGN KEY ("code_id") REFERENCES "teleconsult_codes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK : cohérence closedAt ↔ closeReason (l'un implique l'autre).
ALTER TABLE "teleconsult_sessions" ADD CONSTRAINT "teleconsult_sessions_closed_consistency_check"
  CHECK ((closed_at IS NULL) = (close_reason IS NULL));

-- CHECK : expires_at strictement après started_at.
ALTER TABLE "teleconsult_sessions" ADD CONSTRAINT "teleconsult_sessions_expires_after_started_check"
  CHECK ("expires_at" > "started_at");
