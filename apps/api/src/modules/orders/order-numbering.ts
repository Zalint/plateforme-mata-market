import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Génération du numéro de commande au format `CMD-${YYYY}-${NNNN}`.
 *
 * Utilise la SEQUENCE Postgres `order_number_seq` (cf. migration lot4_orders).
 * Atomique : pas de collision en concurrence multi-instance API.
 *
 * Décision MVP : la séquence ne reset pas chaque année — elle continue
 * sur 2027, 2028, etc. L'année dans le numéro est l'année courante au
 * moment de l'appel. Le numéro reste unique globalement (la séquence
 * Postgres garantit l'unicité du `nextval`).
 *
 * Si on voulait reset annuel : il faudrait soit une séquence par année,
 * soit une colonne `(year, seq)` composite. Hors scope MVP.
 */

export async function generateOrderNumber(
  tx: Prisma.TransactionClient | PrismaClient,
  now: Date = new Date(),
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('order_number_seq')`;
  const first = rows[0];
  if (!first) {
    throw new Error('order_number_seq nextval returned empty result');
  }
  const seq = Number(first.nextval);
  const year = now.getFullYear();
  const padded = String(seq).padStart(4, '0');
  return `CMD-${year}-${padded}`;
}
