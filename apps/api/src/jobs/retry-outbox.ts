import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { outboxService } from '../modules/outbox/index.js';

/**
 * Cron job · retry-outbox (Lot 7).
 *
 * Référence : ARCHITECTURE.md (Pattern Outbox), CLAUDE.md §G3 (« n8n jamais
 * dans le chemin critique »), §G5 (« event dans outbox_events, cron délivre.
 * Si n8n down, retry rattrape »).
 *
 * Exécution :
 *  - Local : `pnpm outbox:cron` (script package.json)
 *  - Render : Cron Job (config Lot 9, cf. BACKLOG [lot-7→lot-9])
 *
 * Idempotence : un event `dispatched_at IS NOT NULL` n'est jamais re-traité.
 * Re-run sans danger.
 *
 * Court-circuit : `CRON_DISABLED=true` skip l'exécution (pause manuelle).
 */

async function main(): Promise<void> {
  if (process.env.CRON_DISABLED === 'true') {
    logger.warn({ job: 'retry-outbox' }, 'cron.disabled_via_env');
    process.exit(0);
  }

  logger.info({ job: 'retry-outbox', env: env.NODE_ENV }, 'cron.start');

  try {
    const result = await outboxService.dispatchPending();
    logger.info({ job: 'retry-outbox', ...result }, 'cron.done');
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error(
      { job: 'retry-outbox', err: err instanceof Error ? err.message : String(err) },
      'cron.failure',
    );
    await prisma.$disconnect();
    process.exit(1);
  }
}

await main();
