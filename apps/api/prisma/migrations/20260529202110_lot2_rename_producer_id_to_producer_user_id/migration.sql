-- Rename `producer_id` → `producer_user_id` sur `production_sites` et `offers`.
--
-- Pourquoi : cohérence avec la convention `*UserId` du Lot 1 (cf. audit_log.
-- actor_user_id / on_behalf_of_user_id). La FK pointe vers producer_profiles
-- dont la PK est elle-même `user_id` (relation 1:1 stricte avec users), donc
-- préciser `_user_id` lève l'ambiguïté pour les futurs lecteurs de l'API.
--
-- ALTER ... RENAME COLUMN préserve les données, les index et les contraintes
-- FK (Postgres met juste à jour la référence interne). Pas de DROP/CREATE.

-- Colonnes
ALTER TABLE "production_sites" RENAME COLUMN "producer_id" TO "producer_user_id";
ALTER TABLE "offers" RENAME COLUMN "producer_id" TO "producer_user_id";

-- Index (renommés pour matcher la convention Prisma `<table>_<cols>_idx`)
ALTER INDEX "production_sites_producer_id_status_idx" RENAME TO "production_sites_producer_user_id_status_idx";
ALTER INDEX "offers_producer_id_status_idx" RENAME TO "offers_producer_user_id_status_idx";

-- Contraintes FK (renommées pour rester alignées avec ce qu'aurait généré Prisma)
ALTER TABLE "production_sites" RENAME CONSTRAINT "production_sites_producer_id_fkey" TO "production_sites_producer_user_id_fkey";
ALTER TABLE "offers" RENAME CONSTRAINT "offers_producer_id_fkey" TO "offers_producer_user_id_fkey";
