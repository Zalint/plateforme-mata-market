import { DomainError } from '@mata/shared/errors';
import { IdempotencyKeySchema } from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
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

  // 1. Lookup cache
  const cached = await prisma.idempotencyRecord.findUnique({
    where: { key_scope: { key, scope } },
  });
  if (cached) {
    // Audit du replay seulement si on a un acteur (skip pour invité, cf. FK).
    if (args.actorUserId) {
      await auditService.log({
        actorUserId: args.actorUserId,
        action: 'order.idempotent_replay',
        targetType: 'idempotency',
        newValue: { key, scope, replayedStatus: cached.statusCode },
        request: args.request,
      });
    }
    return {
      body: cached.responseBody as T,
      statusCode: cached.statusCode,
      replay: true,
    };
  }

  // 2. Exécute le handler
  const body = await args.handler();
  const statusCode = 201; // POST /v1/orders renvoie 201 Created

  // 3. Cache la response (2xx uniquement — handler throw sinon)
  await prisma.idempotencyRecord.create({
    data: {
      key,
      scope,
      statusCode,
      responseBody: body as Prisma.InputJsonValue,
    },
  });

  return { body, statusCode, replay: false };
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
