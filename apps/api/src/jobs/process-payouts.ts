import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { payoutService } from '../modules/payouts/index.js';

/**
 * Cron job · process-payouts (Lot 5).
 *
 * Référence : ARCHITECTURE.md §11 (« process-payouts : 6h UTC, agrège
 * order_items delivered, crée payouts, appel Bictorys disbursement »),
 * CLAUDE.md §G3 (audit obligatoire), §G5 (idempotence).
 *
 * Exécution :
 *  - Local : `pnpm payouts:cron` (script package.json)
 *  - Render : Cron Job (config Lot 9, cf. BACKLOG [lot-5→lot-9])
 *
 * Idempotence : la table payout_items.order_item_id UNIQUE garantit qu'un
 * item n'est jamais reversé deux fois. Re-run sans danger.
 *
 * Court-circuit : `CRON_DISABLED=true` skip l'exécution (pour pause manuelle).
 */

async function main(): Promise<void> {
  // Garde-fou env : si CRON_DISABLED set, on log et on sort proprement (exit 0).
  if (process.env.CRON_DISABLED === 'true') {
    logger.warn({ job: 'process-payouts' }, 'cron.disabled_via_env');
    process.exit(0);
  }

  logger.info({ job: 'process-payouts', env: env.NODE_ENV }, 'cron.start');

  // Trouve un admin actif comme actor (pour audit_log).
  // Hypothèse : il existe au moins un user role='admin' status='active' en DB.
  // Si la config Render set CRON_ACTOR_USER_ID, l'utilise en priorité.
  const actorUserId = await resolveActorUserId();
  if (!actorUserId) {
    logger.error(
      { job: 'process-payouts' },
      'cron.no_admin_found — abort (impossible to audit without an actor)',
    );
    process.exit(1);
  }

  try {
    const result = await payoutService.triggerAllPending({ actorUserId });
    logger.info(
      { job: 'process-payouts', triggered: result.triggered, failed: result.failed },
      'cron.done',
    );
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error(
      { job: 'process-payouts', err: err instanceof Error ? err.message : String(err) },
      'cron.failure',
    );
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function resolveActorUserId(): Promise<string | null> {
  // Priorité 1 : env var explicite (config Render).
  const explicit = process.env.CRON_ACTOR_USER_ID;
  if (explicit && explicit.length > 0) {
    const user = await prisma.user.findUnique({
      where: { id: explicit },
      select: { id: true, status: true, role: true },
    });
    if (!user) {
      logger.warn({ cronActorUserId: explicit }, 'cron.actor.explicit_not_found — fallback admin');
    } else if (user.status !== 'active') {
      logger.warn(
        { cronActorUserId: explicit, status: user.status },
        'cron.actor.explicit_inactive — fallback admin',
      );
    } else {
      return user.id;
    }
  }

  // Fallback : premier admin actif (le seed dev/prod en garantit au moins un).
  const admin = await prisma.user.findFirst({
    where: { role: 'admin', status: 'active' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return admin?.id ?? null;
}

await main();
