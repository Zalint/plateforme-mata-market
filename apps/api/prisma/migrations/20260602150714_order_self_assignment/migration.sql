-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "assigned_teleconsultant_user_id" UUID;

-- CreateIndex
CREATE INDEX "orders_assigned_teleconsultant_user_id_idx" ON "orders"("assigned_teleconsultant_user_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_teleconsultant_user_id_fkey" FOREIGN KEY ("assigned_teleconsultant_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
