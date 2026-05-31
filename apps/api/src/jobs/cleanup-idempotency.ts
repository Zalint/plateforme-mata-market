import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { cleanupExpiredIdempotency } from '../modules/orders/index.js';

/**
 * Cron job · cleanup-idempotency (Lot 9).
 *
 * Référence : ARCHITECTURE.md §7 (« table idempotency_records TTL 24h »),
 * BACKLOG [lot-4→lot-9] (cron cleanup idempotency_records).
 *
 * Supprime les `idempotency_records` plus vieux que 24h. L'index `created_at`
 * (cf. schema.prisma) couvre le filtre.
 *
 * Exécution :
 *  - Local : `pnpm idempotency:cron` (script package.json)
 *  - Render : Cron Job `mata-cron-cleanup-idempotency` (schedule `0 3 * * *`)
 *
 * Idempotent : un re-run sans row expiré est un no-op.
 * Court-circuit : `CRON_DISABLED=true` skip l'exécution (pause manuelle).
 */

async function main(): Promise<void> {
  if (process.env.CRON_DISABLED === 'true') {
    logger.warn({ job: 'cleanup-idempotency' }, 'cron.disabled_via_env');
    process.exit(0);
  }

  logger.info({ job: 'cleanup-idempotency', env: env.NODE_ENV }, 'cron.start');

  try {
    const result = await cleanupExpiredIdempotency();
    logger.info({ job: 'cleanup-idempotency', purged: result.purged }, 'cron.done');
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error(
      { job: 'cleanup-idempotency', err: err instanceof Error ? err.message : String(err) },
      'cron.failure',
    );
    await prisma.$disconnect();
    process.exit(1);
  }
}

await main();
