-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('online', 'cash_on_delivery');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "guest_full_name" TEXT,
ADD COLUMN     "guest_phone_number" TEXT,
ADD COLUMN     "payment_method" "payment_method" NOT NULL DEFAULT 'online';
