import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { offerService } from '../modules/offers/index.js';

/**
 * Cron job · expire-offers.
 *
 * Passe en statut `expired` les offres `validated`/`reserved` dont la date
 * limite (availableUntil) est dépassée. Le catalogue les masque déjà en
 * temps réel (filtre availableUntil), ce cron met le STATUT à jour pour que le
 * producteur voie « Expirée » et puisse les relancer.
 *
 * Exécution :
 *  - Local  : pnpm --filter @mata/api offers:expire:cron
 *  - Render : Cron Job quotidien (node dist/jobs/expire-offers.js)
 *
 * Idempotent : un re-run sans offre à expirer est un no-op.
 * CRON_DISABLED=true court-circuite l'exécution.
 */
async function main(): Promise<void> {
  if (process.env.CRON_DISABLED === 'true') {
    logger.warn({ job: 'expire-offers' }, 'cron.disabled_via_env');
    process.exit(0);
  }

  logger.info({ job: 'expire-offers', env: env.NODE_ENV }, 'cron.start');

  try {
    const { expired } = await offerService.expireOverdue();
    logger.info({ job: 'expire-offers', offersExpired: expired }, 'cron.done');
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error(
      { job: 'expire-offers', err: err instanceof Error ? err.message : String(err) },
      'cron.failure',
    );
    await prisma.$disconnect();
    process.exit(1);
  }
}

await main();
