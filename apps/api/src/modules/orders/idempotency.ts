import { DomainError } from '@mata/shared/errors';
import { IdempotencyKeySchema } from '@mata/shared/schemas';
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';

/**
 * Helper d'idempotency · table `idempotency_records` (cf. migration lot4_orders).
 *
 * Référence : ARCHITECTURE.md §7 « Client → MATA : header X-Idempotency-Key
 * sur POST /v1/orders, table idempotency_records TTL 24h ».
 *
 * Comportement :
 *  1. Header `X-Idempotency-Key` (UUID v4) **obligatoire** sur les routes
 *     idempotentes — sans, retourne 400 VALIDATION (au lieu de laisser
 *     passer silencieusement, ce qui rendrait l'idempotency facultative).
 *  2. Lookup par (key, scope) où scope = `${method} ${path}|user:${userId}`.
 *     Si match : retourne le `cachedBody` directement avec son `statusCode`.
 *     Audit `order.idempotent_replay` pour traçabilité.
 *  3. Sinon : exécute `handler()`, sérialise sa response dans `idempotency_records`
 *     (uniquement les codes 2xx — les erreurs ne sont PAS cachées, le client
 *     peut retry avec une intent différente).
 *
 * Nettoyage : le cron `cleanup-idempotency` (Lot 9) supprime les records > 24h
 * via `cleanupExpired()`. Référence : ARCHITECTURE.md §7 (TTL 24h).
 */

/** TTL d'un record d'idempotence avant purge par le cron (24h). */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Supprime les records d'idempotence plus vieux que le TTL (24h). Appelé par
 * le cron `cleanup-idempotency`. Idempotent : un re-run sans row expiré est un
 * no-op. Retourne le nombre de rows supprimés.
 */
export async function cleanupExpired(now: Date = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_MS);
  const result = await prisma.idempotencyRecord.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { purged: result.count };
}

interface WithIdempotencyArgs<T> {
  request: FastifyRequest;
  /**
   * Identifiant de scope d'idempotence, ex `user:<uuid>` (client authentifié)
   * ou `guest:<+221...>` (mode invité Lot 8). Garantit qu'une même clé ne
   * collisionne pas entre deux acteurs distincts.
   */
  scopeOwner: string;
  /**
   * Acteur pour l'audit `order.idempotent_replay`. `null` pour un invité (pas
   * de row `users` → on skip l'audit pour ne pas violer la FK actor, même
   * politique que le webhook côté payment-service).
   */
  actorUserId: string | null;
  handler: () => Promise<T>;
}

interface IdempotencyOutcome<T> {
  body: T;
  statusCode: number;
  replay: boolean;
}

export async function withIdempotency<T>(
  args: WithIdempotencyArgs<T>,
): Promise<IdempotencyOutcome<T>> {
  const key = readKeyHeader(args.request);
  const scope = buildScope(args.request, args.scopeOwner);

  // 1. RÉSERVE la clé AVANT d'exécuter le handler. On insère un record provisoire
  //    (statusCode 0 = « en cours »). La PK composite ([key, scope]) garantit
  //    qu'une seule requête concurrente gagne la réservation ; les autres tombent
  //    en P2002 et ne ré-exécutent PAS le handler (sinon double commande créée).
  try {
    await prisma.idempotencyRecord.create({
      data: { key, scope, statusCode: 0, responseBody: {} as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return replayExisting<T>(args, key, scope);
    }
    throw err;
  }

  // 2. Exécute le handler. En cas d'échec, on LIBÈRE la réservation pour que le
  //    client puisse retenter (les erreurs ne sont pas cachées — politique inchangée).
  let body: T;
  try {
    body = await args.handler();
  } catch (err) {
    await prisma.idempotencyRecord.delete({ where: { key_scope: { key, scope } } }).catch(() => {
      // Best-effort : si la suppression échoue, le record provisoire sera
      // purgé par le cron TTL ; on ne masque pas l'erreur d'origine.
    });
    throw err;
  }

  // 3. Finalise le record avec la response (201 Created).
  const statusCode = 201;
  await prisma.idempotencyRecord.update({
    where: { key_scope: { key, scope } },
    data: { statusCode, responseBody: body as Prisma.InputJsonValue },
  });

  return { body, statusCode, replay: false };
}

/**
 * Rejoue le résultat d'une requête identique déjà traitée (ou en cours).
 * - Record finalisé (statusCode ≠ 0) → renvoie la response cachée (replay).
 * - Record encore provisoire (statusCode 0) → une requête identique est en
 *   cours de traitement : on renvoie un CONFLICT déterministe plutôt que de
 *   ré-exécuter le handler.
 */
async function replayExisting<T>(
  args: WithIdempotencyArgs<T>,
  key: string,
  scope: string,
): Promise<IdempotencyOutcome<T>> {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key_scope: { key, scope } },
  });
  if (!existing || existing.statusCode === 0) {
    throw new DomainError(
      'CONFLICT',
      'Une requête identique est en cours de traitement, réessayez dans un instant',
    );
  }
  // Audit du replay seulement si on a un acteur (skip pour invité, cf. FK).
  if (args.actorUserId) {
    await auditService.log({
      actorUserId: args.actorUserId,
      action: 'order.idempotent_replay',
      targetType: 'idempotency',
      newValue: { key, scope, replayedStatus: existing.statusCode },
      request: args.request,
    });
  }
  return {
    body: existing.responseBody as T,
    statusCode: existing.statusCode,
    replay: true,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers internes

function readKeyHeader(req: FastifyRequest): string {
  const raw = req.headers['x-idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') {
    throw new DomainError(
      'VALIDATION',
      "Header 'X-Idempotency-Key' (UUID v4) obligatoire sur POST /v1/orders",
    );
  }
  const parsed = IdempotencyKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError('VALIDATION', 'X-Idempotency-Key doit être un UUID v4 valide');
  }
  return parsed.data;
}

function buildScope(req: FastifyRequest, scopeOwner: string): string {
  // Fastify 5 : route info exposée via req.routeOptions (method + url canonique
  // avec params templated). Fallback sur req.method/req.url si absent.
  const method = req.routeOptions?.method ?? req.method;
  const path = req.routeOptions?.url ?? req.url.split('?')[0];
  return `${method} ${path}|${scopeOwner}`;
}
