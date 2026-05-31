-- CreateTable
CREATE TABLE "producer_ratings" (
    "id" UUID NOT NULL,
    "producer_user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producer_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "producer_ratings_producer_user_id_idx" ON "producer_ratings"("producer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_ratings_order_id_producer_user_id_key" ON "producer_ratings"("order_id", "producer_user_id");

-- AddForeignKey
ALTER TABLE "producer_ratings" ADD CONSTRAINT "producer_ratings_producer_user_id_fkey" FOREIGN KEY ("producer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_ratings" ADD CONSTRAINT "producer_ratings_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_ratings" ADD CONSTRAINT "producer_ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
