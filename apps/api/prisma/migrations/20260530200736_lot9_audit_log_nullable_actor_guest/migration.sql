-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_user_id_fkey";

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "guest_phone_number" TEXT,
ALTER COLUMN "actor_user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
