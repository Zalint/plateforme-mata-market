import { logger } from '../../lib/logger.js';
import { dispatchToN8n, isN8nConfigured } from '../../lib/n8n.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Service outbox · dispatch asynchrone vers n8n (Lot 7).
 *
 * Référence : ARCHITECTURE.md (Pattern Outbox), CLAUDE.md §G3/§G5
 * (« n8n jamais dans le chemin critique », « Si n8n down, retry rattrape »).
 *
 * INVARIANTS :
 *  1. Traite les events `dispatched_at IS NULL` ET `retry_count < MAX_RETRIES`,
 *     les plus anciens d'abord (FIFO), par lot borné (LIMIT) pour ne pas
 *     monopoliser le cron.
 *  2. Succès → `dispatched_at = now()`. Le retry repart de zéro à chaque run
 *     du cron : on ne re-dispatch jamais un event déjà dispatché.
 *  3. Échec → `retry_count + 1` + `last_error`. Au-delà de MAX_RETRIES un event
 *     est ABANDONNÉ : il sort naturellement de la requête (retry_count >= MAX),
 *     loggé une fois en `error` au passage du seuil.
 *  4. Si n8n n'est pas configuré, on log + skip TOUT (jamais bloquant).
 */

const MAX_RETRIES = 100;
const BATCH_SIZE = 100;

interface DispatchPendingResult {
  scanned: number;
  dispatched: number;
  retried: number;
  abandoned: number;
}

async function dispatchPendingInternal(): Promise<DispatchPendingResult> {
  if (!isN8nConfigured()) {
    logger.warn({ job: 'retry-outbox' }, 'outbox.skip.n8n_not_configured');
    return { scanned: 0, dispatched: 0, retried: 0, abandoned: 0 };
  }

  const pending = await prisma.outboxEvent.findMany({
    where: { dispatchedAt: null, retryCount: { lt: MAX_RETRIES } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  let dispatched = 0;
  let retried = 0;
  let abandoned = 0;

  for (const event of pending) {
    const result = await dispatchToN8n(event.eventType, event.payload);

    if (result.ok) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { dispatchedAt: new Date(), lastError: null },
      });
      dispatched++;
      continue;
    }

    const nextRetryCount = event.retryCount + 1;
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { retryCount: nextRetryCount, lastError: result.error.slice(0, 500) },
    });

    if (nextRetryCount >= MAX_RETRIES) {
      // CLAUDE.md §G5 : « Si > 100 retry, log error + abandon ». L'event reste
      // en base (audit / replay manuel possible) mais ne sera plus re-tenté.
      abandoned++;
      logger.error(
        {
          job: 'retry-outbox',
          outboxEventId: event.id,
          eventType: event.eventType,
          retryCount: nextRetryCount,
          lastError: result.error,
        },
        'outbox.abandoned',
      );
    } else {
      retried++;
    }
  }

  logger.info(
    { job: 'retry-outbox', scanned: pending.length, dispatched, retried, abandoned },
    'outbox.dispatch.done',
  );
  return { scanned: pending.length, dispatched, retried, abandoned };
}

export const outboxService = {
  dispatchPending: dispatchPendingInternal,
};
