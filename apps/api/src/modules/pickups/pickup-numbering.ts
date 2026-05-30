import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Génération du numéro de tournée au format `PKP-${YYYY}-${NNNN}`.
 *
 * Utilise la SEQUENCE Postgres `pickup_number_seq` (cf. migration
 * lot7_pickups_push). Même contrat que `generateOrderNumber` (Lot 4) :
 * atomique, pas de collision en concurrence, pas de reset annuel.
 */
export async function generatePickupNumber(
  tx: Prisma.TransactionClient | PrismaClient,
  now: Date = new Date(),
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('pickup_number_seq')`;
  const first = rows[0];
  if (!first) {
    throw new Error('pickup_number_seq nextval returned empty result');
  }
  const seq = Number(first.nextval);
  const year = now.getFullYear();
  const padded = String(seq).padStart(4, '0');
  return `PKP-${year}-${padded}`;
}
