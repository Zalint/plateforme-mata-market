import {
  TELECONSULT_SESSION_DURATION_MS,
  type TeleconsultCloseReason,
} from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type { TeleconsultSessionOutput } from '@mata/shared/schemas';
import type { Prisma, TeleconsultSession, User } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { codeService } from './code-service.js';

/**
 * Service session téléconseil · démarrage / fermeture / lectures.
 *
 * Référence : ARCHITECTURE.md §9, CLAUDE.md §G3 + §G8.
 *
 * INVARIANTS DE SÉCURITÉ :
 *  1. `startSession` rejette avec un message UNIFORME "Code invalide ou
 *     expiré" pour tous les cas d'échec (code KO, expiré, utilisé, producteur
 *     inconnu, lockout). Anti-enumeration.
 *  2. Audit `teleconsult.session.start` écrit avec `actor_user_id` =
 *     téléconseiller et `on_behalf_of_user_id` = producteur.
 *  3. Audit `teleconsult.session.action_forbidden` écrit pour TOUTE tentative
 *     suspecte (code KO, expiré, lockout) — utile pour détection bruteforce.
 *  4. Session 15 minutes max (`TELECONSULT_SESSION_DURATION_MS`).
 *  5. Le teleconseiller ne peut avoir qu'UNE seule session active à la fois.
 *  6. Un producteur ne peut avoir qu'UNE seule session active à la fois
 *     (sinon double délégation).
 */

const UNIFORM_ERROR = 'Code invalide ou expiré';

// ─────────────────────────────────────────────────────────────────
// Démarrage de session

interface StartSessionArgs {
  teleconsultantUserId: string;
  producerUsername: string;
  code: string;
  request?: FastifyRequest;
}

async function startSessionInternal(args: StartSessionArgs): Promise<TeleconsultSessionOutput> {
  // 1. Lookup producteur. Message UNIFORME si introuvable (anti-enumeration).
  const producer = await prisma.user.findUnique({
    where: { username: args.producerUsername },
    select: { id: true, username: true, displayName: true, phone: true, role: true, status: true },
  });
  if (!producer || producer.role !== 'producer' || producer.status !== 'active') {
    await logForbiddenAttempt({
      actorUserId: args.teleconsultantUserId,
      reason: 'unknown_producer_or_inactive',
      producerUsername: args.producerUsername,
      request: args.request,
    });
    throw new DomainError('UNAUTHORIZED', UNIFORM_ERROR);
  }

  // 2. Refuser si une session VRAIMENT active existe déjà pour le téléconseiller
  //    OU le producteur. On exige `expiresAt > now` (comme getActive) : une session
  //    expirée mais pas encore fermée par le cron ne doit PAS bloquer un nouveau
  //    démarrage (sinon elle « pollue » jusqu'à la purge).
  const conflicting = await prisma.teleconsultSession.findFirst({
    where: {
      closedAt: null,
      expiresAt: { gt: new Date() },
      OR: [{ teleconsultantUserId: args.teleconsultantUserId }, { producerUserId: producer.id }],
    },
    select: { id: true, sessionNumber: true },
  });
  if (conflicting) {
    throw new DomainError(
      'CONFLICT',
      `Une session déjà active (${conflicting.sessionNumber}) — fermez-la avant d'en démarrer une nouvelle`,
    );
  }

  // 3. Vérifie + consomme le code. Message uniforme si KO.
  const codeId = await codeService.verifyAndConsume({
    producerUserId: producer.id,
    code: args.code,
  });
  if (!codeId) {
    await logForbiddenAttempt({
      actorUserId: args.teleconsultantUserId,
      onBehalfOfUserId: producer.id,
      reason: 'invalid_or_expired_code',
      request: args.request,
    });
    throw new DomainError('UNAUTHORIZED', UNIFORM_ERROR);
  }

  // 4. Crée la session.
  const sessionNumber = await generateSessionNumber();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + TELECONSULT_SESSION_DURATION_MS);

  const created = await prisma.teleconsultSession.create({
    data: {
      sessionNumber,
      teleconsultantUserId: args.teleconsultantUserId,
      producerUserId: producer.id,
      codeId,
      startedAt,
      expiresAt,
    },
    include: { teleconsultant: { select: { displayName: true } } },
  });

  // 5. Audit obligatoire (CLAUDE.md §G8) avec on_behalf_of_user_id.
  await auditService.log({
    actorUserId: args.teleconsultantUserId,
    onBehalfOfUserId: producer.id,
    action: 'teleconsult.session.start',
    targetType: 'teleconsult_session',
    targetId: created.id,
    newValue: { sessionNumber, expiresAt: expiresAt.toISOString() },
    request: args.request,
  });

  logger.info(
    {
      sessionId: created.id,
      sessionNumber,
      teleconsultantUserId: args.teleconsultantUserId,
      producerUserId: producer.id,
      expiresAt,
    },
    'teleconsult.session.started',
  );

  return toSessionOutput({
    session: created,
    teleconsultantDisplayName: created.teleconsultant.displayName,
    producer,
  });
}

// ─────────────────────────────────────────────────────────────────
// Fermeture

interface CloseSessionArgs {
  sessionId: string;
  closedByUserId: string;
  closedByRole: 'admin' | 'super_admin' | 'teleconsultant' | 'producer';
  reasonOverride?: TeleconsultCloseReason;
  request?: FastifyRequest;
}

async function closeSessionInternal(args: CloseSessionArgs): Promise<TeleconsultSessionOutput> {
  const session = await prisma.teleconsultSession.findUnique({
    where: { id: args.sessionId },
    include: {
      teleconsultant: { select: { displayName: true } },
      producer: { select: { id: true, username: true, displayName: true, phone: true } },
    },
  });
  if (!session) throw new DomainError('NOT_FOUND', 'Session introuvable');
  if (session.closedAt) {
    // Idempotent : fermer une session déjà fermée (expirée, ou fermée dans un
    // autre onglet) est un no-op réussi. Évite un 409 qui empêcherait le client
    // de nettoyer son état local (singleton X-Teleconsult-Session-Id) et bloquerait
    // le démarrage d'une nouvelle session.
    return toSessionOutput({
      session,
      teleconsultantDisplayName: session.teleconsultant.displayName,
      producer: session.producer,
    });
  }

  // Infère la raison selon le rôle si non fournie.
  const reason: TeleconsultCloseReason = args.reasonOverride ?? inferCloseReason(args.closedByRole);

  const updated = await prisma.teleconsultSession.update({
    where: { id: args.sessionId },
    data: {
      closedAt: new Date(),
      closeReason: reason,
      closedByUserId: args.closedByUserId,
    },
    include: {
      teleconsultant: { select: { displayName: true } },
      producer: { select: { id: true, username: true, displayName: true, phone: true } },
    },
  });

  await auditService.log({
    actorUserId: args.closedByUserId,
    onBehalfOfUserId: session.producerUserId,
    action: 'teleconsult.session.end',
    targetType: 'teleconsult_session',
    targetId: session.id,
    newValue: { reason, sessionNumber: session.sessionNumber },
    request: args.request,
  });

  return toSessionOutput({
    session: updated,
    teleconsultantDisplayName: updated.teleconsultant.displayName,
    producer: updated.producer,
  });
}

function inferCloseReason(
  role: 'admin' | 'super_admin' | 'teleconsultant' | 'producer',
): TeleconsultCloseReason {
  if (role === 'teleconsultant') return 'closed_by_teleconsultant';
  if (role === 'producer') return 'revoked_by_producer';
  return 'revoked_by_admin';
}

// ─────────────────────────────────────────────────────────────────
// Lectures

async function getActiveForTeleconsultantInternal(
  userId: string,
): Promise<TeleconsultSessionOutput | null> {
  const now = new Date();
  const session = await prisma.teleconsultSession.findFirst({
    where: {
      teleconsultantUserId: userId,
      closedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      teleconsultant: { select: { displayName: true } },
      producer: { select: { id: true, username: true, displayName: true, phone: true } },
    },
    orderBy: { startedAt: 'desc' },
  });
  if (!session) return null;
  return toSessionOutput({
    session,
    teleconsultantDisplayName: session.teleconsultant.displayName,
    producer: session.producer,
  });
}

/** Session active dont le PRODUCTEUR est la cible (pour l'écran « Me faire aider »). */
async function getActiveForProducerInternal(
  producerUserId: string,
): Promise<TeleconsultSessionOutput | null> {
  const now = new Date();
  const session = await prisma.teleconsultSession.findFirst({
    where: {
      producerUserId,
      closedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      teleconsultant: { select: { displayName: true } },
      producer: { select: { id: true, username: true, displayName: true, phone: true } },
    },
    orderBy: { startedAt: 'desc' },
  });
  if (!session) return null;
  return toSessionOutput({
    session,
    teleconsultantDisplayName: session.teleconsultant.displayName,
    producer: session.producer,
  });
}

async function getByIdInternal(sessionId: string): Promise<TeleconsultSessionOutput> {
  const session = await prisma.teleconsultSession.findUnique({
    where: { id: sessionId },
    include: {
      teleconsultant: { select: { displayName: true } },
      producer: { select: { id: true, username: true, displayName: true, phone: true } },
    },
  });
  if (!session) throw new DomainError('NOT_FOUND', 'Session introuvable');
  return toSessionOutput({
    session,
    teleconsultantDisplayName: session.teleconsultant.displayName,
    producer: session.producer,
  });
}

/**
 * Charge une session par id pour le plugin auth. Vérifie validité ET
 * teleconsultant correspond. Renvoie null sinon (sans throw — le plugin
 * décide quoi faire).
 */
async function resolveActiveForTeleconsultant(args: {
  sessionId: string;
  teleconsultantUserId: string;
}): Promise<{
  sessionId: string;
  producerUserId: string;
  producer: Pick<User, 'id' | 'username' | 'displayName' | 'role' | 'status'>;
} | null> {
  const now = new Date();
  const session = await prisma.teleconsultSession.findUnique({
    where: { id: args.sessionId },
    select: {
      id: true,
      teleconsultantUserId: true,
      producerUserId: true,
      closedAt: true,
      expiresAt: true,
      producer: {
        select: { id: true, username: true, displayName: true, role: true, status: true },
      },
    },
  });
  if (!session) return null;
  if (session.teleconsultantUserId !== args.teleconsultantUserId) return null;
  if (session.closedAt !== null) return null;
  if (session.expiresAt <= now) return null;
  if (session.producer.status !== 'active') return null;
  return {
    sessionId: session.id,
    producerUserId: session.producerUserId,
    producer: session.producer,
  };
}

// ─────────────────────────────────────────────────────────────────
// Cleanup (cron)

/**
 * Marque comme `expired` toutes les sessions où expires_at < now et
 * closed_at IS NULL. Retourne le nombre fermé.
 */
async function expireOverdueInternal(): Promise<{ expired: number }> {
  const now = new Date();
  const res = await prisma.teleconsultSession.updateMany({
    where: {
      closedAt: null,
      expiresAt: { lt: now },
    },
    data: {
      closedAt: now,
      closeReason: 'expired',
    },
  });
  return { expired: res.count };
}

// ─────────────────────────────────────────────────────────────────
// Helpers internes

async function generateSessionNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const result = (await prisma.$queryRawUnsafe(
    "SELECT nextval('teleconsult_session_number_seq') AS n",
  )) as Array<{ n: bigint }>;
  const n = Number(result[0]?.n ?? 0);
  return `SES-${year}-${n.toString().padStart(4, '0')}`;
}

async function logForbiddenAttempt(args: {
  actorUserId: string;
  onBehalfOfUserId?: string;
  reason: string;
  producerUsername?: string;
  request?: FastifyRequest;
}): Promise<void> {
  try {
    await auditService.log({
      actorUserId: args.actorUserId,
      onBehalfOfUserId: args.onBehalfOfUserId ?? null,
      action: 'teleconsult.session.action_forbidden',
      targetType: 'teleconsult_session',
      // intentionnellement pas le code en clair ni le hash
      newValue: {
        reason: args.reason,
        ...(args.producerUsername ? { attemptedUsername: args.producerUsername } : {}),
      },
      request: args.request,
    });
  } catch (err) {
    // Audit log fail ne doit pas masquer l'erreur principale (qui sera throw).
    logger.warn(
      { event: 'teleconsult.audit_failure', err: err instanceof Error ? err.message : String(err) },
      'teleconsult.audit_failure',
    );
  }
}

function toSessionOutput(args: {
  session: TeleconsultSession;
  teleconsultantDisplayName: string;
  producer: Pick<User, 'id' | 'username' | 'displayName' | 'phone'> & { username: string | null };
}): TeleconsultSessionOutput {
  return {
    id: args.session.id,
    sessionNumber: args.session.sessionNumber,
    teleconsultantUserId: args.session.teleconsultantUserId,
    teleconsultantDisplayName: args.teleconsultantDisplayName,
    producer: {
      userId: args.producer.id,
      username: args.producer.username ?? '',
      displayName: args.producer.displayName,
      phone: args.producer.phone,
    },
    startedAt: args.session.startedAt.toISOString(),
    expiresAt: args.session.expiresAt.toISOString(),
    closedAt: args.session.closedAt?.toISOString() ?? null,
    closeReason: args.session.closeReason,
  };
}

// ─────────────────────────────────────────────────────────────────
// Export

export const sessionService = {
  start: startSessionInternal,
  close: closeSessionInternal,
  getActiveForTeleconsultant: getActiveForTeleconsultantInternal,
  getActiveForProducer: getActiveForProducerInternal,
  getById: getByIdInternal,
  resolveActiveForTeleconsultant,
  expireOverdue: expireOverdueInternal,
};

// Export pour tests unitaires.
export const _internals = {
  UNIFORM_ERROR,
  generateSessionNumber,
  inferCloseReason,
};

// Type Prisma utility — Session loaded avec relations pour les tests.
export type TeleconsultSessionLoaded = Prisma.TeleconsultSessionGetPayload<{
  include: {
    teleconsultant: { select: { displayName: true } };
    producer: { select: { id: true; username: true; displayName: true; phone: true } };
  };
}>;
