import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { codeService, sessionService } from '../modules/teleconsult/index.js';

/**
 * Cron job - cleanup-expired-teleconsult (Lot 6).
 *
 * Reference : ARCHITECTURE.md #11 (cron tous les 5 min, ferme sessions
 * expirees, purge codes > 1h non utilises).
 *
 * Deux operations :
 *  1. Sessions expirees (expires_at < now, closed_at NULL) -> closeReason=expired
 *  2. Codes > 1h non utilises (created_at < now-1h, used_at NULL) -> DELETE
 *
 * Execution :
 *  - Local : pnpm teleconsult:cleanup
 *  - Render : Cron Job (config Lot 9, cf. BACKLOG)
 *
 * Idempotent : un re-run sans nouveau materiel a traiter est un no-op.
 * CRON_DISABLED=true court-circuite l'execution.
 */

async function main(): Promise<void> {
  if (process.env.CRON_DISABLED === 'true') {
    logger.warn({ job: 'cleanup-expired-teleconsult' }, 'cron.disabled_via_env');
    process.exit(0);
  }

  logger.info({ job: 'cleanup-expired-teleconsult', env: env.NODE_ENV }, 'cron.start');

  try {
    const sessions = await sessionService.expireOverdue();
    const codes = await codeService.cleanupExpired();
    logger.info(
      {
        job: 'cleanup-expired-teleconsult',
        sessionsExpired: sessions.expired,
        codesPurged: codes.purged,
      },
      'cron.done',
    );
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error(
      {
        job: 'cleanup-expired-teleconsult',
        err: err instanceof Error ? err.message : String(err),
      },
      'cron.failure',
    );
    await prisma.$disconnect();
    process.exit(1);
  }
}

await main();
