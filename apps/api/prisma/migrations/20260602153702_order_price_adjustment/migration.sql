-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "adjusted_total_fcfa" INTEGER,
ADD COLUMN     "price_adjusted_at" TIMESTAMP(3),
ADD COLUMN     "price_adjustment_reason" TEXT;
