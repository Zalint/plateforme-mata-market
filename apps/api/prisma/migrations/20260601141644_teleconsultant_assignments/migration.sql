-- CreateTable
CREATE TABLE "teleconsultant_assignments" (
    "id" UUID NOT NULL,
    "teleconsultant_user_id" UUID NOT NULL,
    "producer_user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teleconsultant_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teleconsultant_scope" (
    "teleconsultant_user_id" UUID NOT NULL,
    "all_producers" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teleconsultant_scope_pkey" PRIMARY KEY ("teleconsultant_user_id")
);

-- CreateIndex
CREATE INDEX "teleconsultant_assignments_teleconsultant_user_id_idx" ON "teleconsultant_assignments"("teleconsultant_user_id");

-- CreateIndex
CREATE INDEX "teleconsultant_assignments_producer_user_id_idx" ON "teleconsultant_assignments"("producer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teleconsultant_assignments_teleconsultant_user_id_producer__key" ON "teleconsultant_assignments"("teleconsultant_user_id", "producer_user_id");

-- AddForeignKey
ALTER TABLE "teleconsultant_assignments" ADD CONSTRAINT "teleconsultant_assignments_teleconsultant_user_id_fkey" FOREIGN KEY ("teleconsultant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teleconsultant_assignments" ADD CONSTRAINT "teleconsultant_assignments_producer_user_id_fkey" FOREIGN KEY ("producer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teleconsultant_assignments" ADD CONSTRAINT "teleconsultant_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teleconsultant_scope" ADD CONSTRAINT "teleconsultant_scope_teleconsultant_user_id_fkey" FOREIGN KEY ("teleconsultant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teleconsultant_scope" ADD CONSTRAINT "teleconsultant_scope_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
