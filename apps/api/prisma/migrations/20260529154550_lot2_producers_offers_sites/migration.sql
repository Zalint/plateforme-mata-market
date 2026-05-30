-- CreateEnum
CREATE TYPE "producer_type" AS ENUM ('poultry', 'cattle', 'sheep', 'vegetables', 'fish', 'mixed');

-- CreateEnum
CREATE TYPE "producer_status" AS ENUM ('pending', 'validated', 'suspended', 'blacklisted');

-- CreateEnum
CREATE TYPE "site_type" AS ENUM ('poulailler', 'ferme', 'depot', 'mareyage');

-- CreateEnum
CREATE TYPE "site_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "product_category" AS ENUM ('poultry', 'eggs', 'cattle', 'sheep', 'vegetables', 'fish');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('draft', 'pending', 'validated', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "offer_unit" AS ENUM ('unit', 'kg', 'tray', 'crate', 'head');

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "centroid_lat" DOUBLE PRECISION,
    "centroid_lng" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_profiles" (
    "user_id" UUID NOT NULL,
    "type" "producer_type" NOT NULL,
    "status" "producer_status" NOT NULL DEFAULT 'pending',
    "zone_id" UUID NOT NULL,
    "whatsapp_phone" TEXT,
    "photo_public_id" TEXT,
    "bio" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "bank_details" JSONB,
    "validated_at" TIMESTAMP(3),
    "validated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "production_sites" (
    "id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "site_type" NOT NULL,
    "status" "site_status" NOT NULL DEFAULT 'active',
    "zone_id" UUID NOT NULL,
    "address_line" TEXT,
    "geo_lat" DOUBLE PRECISION,
    "geo_lng" DOUBLE PRECISION,
    "vehicle_access" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "pickup_hours" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "category" "product_category" NOT NULL,
    "status" "offer_status" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "unit" "offer_unit" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "price_fcfa" INTEGER NOT NULL,
    "available_from" DATE NOT NULL,
    "available_until" DATE,
    "quality_note" TEXT,
    "submitted_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "validated_by" UUID,
    "rejection_reason" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspended_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_photos" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "cloudinary_public_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zones_slug_key" ON "zones"("slug");

-- CreateIndex
CREATE INDEX "zones_active_idx" ON "zones"("active");

-- CreateIndex
CREATE INDEX "producer_profiles_status_idx" ON "producer_profiles"("status");

-- CreateIndex
CREATE INDEX "producer_profiles_zone_id_status_idx" ON "producer_profiles"("zone_id", "status");

-- CreateIndex
CREATE INDEX "producer_profiles_type_status_idx" ON "producer_profiles"("type", "status");

-- CreateIndex
CREATE INDEX "production_sites_producer_id_status_idx" ON "production_sites"("producer_id", "status");

-- CreateIndex
CREATE INDEX "production_sites_zone_id_idx" ON "production_sites"("zone_id");

-- CreateIndex
CREATE INDEX "offers_producer_id_status_idx" ON "offers"("producer_id", "status");

-- CreateIndex
CREATE INDEX "offers_category_status_created_at_idx" ON "offers"("category", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "offers_status_created_at_idx" ON "offers"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "offers_site_id_idx" ON "offers"("site_id");

-- CreateIndex
CREATE INDEX "offer_photos_offer_id_position_idx" ON "offer_photos"("offer_id", "position");

-- AddForeignKey
ALTER TABLE "producer_profiles" ADD CONSTRAINT "producer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_profiles" ADD CONSTRAINT "producer_profiles_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_sites" ADD CONSTRAINT "production_sites_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_sites" ADD CONSTRAINT "production_sites_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producer_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "production_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_photos" ADD CONSTRAINT "offer_photos_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
