import { randomInt } from 'node:crypto';
import {
  TELECONSULT_CODE_TTL_MS,
  TELECONSULT_LOCKOUT_DURATION_MS,
  TELECONSULT_LOCKOUT_MAX_ATTEMPTS,
  TELECONSULT_LOCKOUT_WINDOW_MS,
} from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type { TeleconsultCodeGenerateOutput } from '@mata/shared/schemas';
import bcrypt from 'bcrypt';
import type { FastifyRequest } from 'fastify';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';

/**
 * Service code téléconseil · génération + vérification.
 *
 * Référence : ARCHITECTURE.md §9, CLAUDE.md §G8.
 *
 * INVARIANTS DE SÉCURITÉ :
 *  1. Code généré via `crypto.randomInt(100000, 1000000)` — entropie ≈ 20 bits.
 *  2. Stocké uniquement en `bcrypt` (cost 10). Le code en clair n'existe qu'au
 *     moment du retour à l'appelant ; aucun champ DB ne le préserve.
 *  3. Expiration 15 minutes (`TELECONSULT_CODE_TTL_MS`).
 *  4. Lockout après `TELECONSULT_LOCKOUT_MAX_ATTEMPTS` échecs en
 *     `TELECONSULT_LOCKOUT_WINDOW_MS` → `TELECONSULT_LOCKOUT_DURATION_MS`.
 *  5. Le code n'est JAMAIS loggé (pino redact `*.code`, `*.codeHash`).
 *
 * Le code est invalidé dès la première utilisation (used_at). Une nouvelle
 * génération crée un nouveau row — l'ancien reste en base pour audit mais
 * n'est plus utilisable (used_at OU expires_at < now).
 */

const BCRYPT_COST = 10;

/**
 * Génère un nouveau code 6 chiffres pour un producteur.
 *
 * Vérifie d'abord qu'aucun lockout n'est actif. Si oui → 429 sans révéler
 * de timing info (failed_attempts servent uniquement à compter).
 */
async function generateForProducerInternal(args: {
  producerUserId: string;
  request?: FastifyRequest;
}): Promise<TeleconsultCodeGenerateOutput> {
  await assertNotLocked(args.producerUserId);

  // Génération entropie : randomInt borné min inclus, max exclus.
  // 100000-999999 inclus → 6 chiffres pleins (jamais de leading zero).
  const codeNum = randomInt(100_000, 1_000_000);
  const code = codeNum.toString();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TELECONSULT_CODE_TTL_MS);

  await prisma.teleconsultCode.create({
    data: {
      producerUserId: args.producerUserId,
      codeHash,
      expiresAt,
    },
  });

  await auditService.log({
    actorUserId: args.producerUserId,
    action: 'teleconsult.code.generate',
    targetType: 'teleconsult_code',
    targetId: args.producerUserId, // pas l'id du code (sinon corrélation possible)
    newValue: { expiresAt: expiresAt.toISOString() },
    request: args.request,
  });

  // Log info (PAS le code !).
  logger.info({ producerUserId: args.producerUserId, expiresAt }, 'teleconsult.code.generated');

  return { code, expiresAt: expiresAt.toISOString() };
}

/**
 * Vérifie un code et retourne l'id du row (pour usage par session-service).
 * - Renvoie `null` si lockout, code inconnu, expiré ou utilisé (message
 *   uniforme côté caller — pas de distinction pour anti-enumeration).
 * - Incrémente `failed_attempts` sur le DERNIER code émis pour ce producteur
 *   en cas d'échec (pour lockout cumulatif).
 * - Sur succès, marque `used_at` et reset failed_attempts à 0.
 */
async function verifyAndConsumeInternal(args: {
  producerUserId: string;
  code: string;
}): Promise<string | null> {
  // Si lockout actif → fail silently. Le caller renverra le message uniforme.
  const lockedNow = await isLocked(args.producerUserId);
  if (lockedNow) return null;

  // Cherche le code actif le plus récent. On utilise le dernier émis car
  // chaque nouvelle génération invalide l'ancienne en pratique.
  const now = new Date();
  const candidate = await prisma.teleconsultCode.findFirst({
    where: {
      producerUserId: args.producerUserId,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!candidate) {
    // Pas de code valide → incrémente quand même les tentatives sur le
    // dernier code émis (s'il existe) pour la mécanique lockout.
    await registerFailedAttempt(args.producerUserId);
    return null;
  }

  // Comparaison bcrypt (constant-time côté lib).
  const ok = await bcrypt.compare(args.code, candidate.codeHash);
  if (!ok) {
    await prisma.teleconsultCode.updateMany({
      where: { id: candidate.id, usedAt: null },
      data: { failedAttempts: { increment: 1 } },
    });
    await maybeApplyLockout(args.producerUserId);
    return null;
  }

  // Succès : consommation ATOMIQUE. `updateMany` conditionné à `usedAt: null`
  // → si deux requêtes concurrentes passent toutes deux `bcrypt.compare`, une
  // seule obtient `count === 1` ; l'autre voit 0 (code déjà consommé) et échoue.
  // Empêche le double-usage d'un même code (§G8).
  const consumed = await prisma.teleconsultCode.updateMany({
    where: { id: candidate.id, usedAt: null },
    data: { usedAt: now, failedAttempts: 0, lockedUntil: null },
  });
  if (consumed.count !== 1) return null;
  return candidate.id;
}

// ─────────────────────────────────────────────────────────────────
// Lockout helpers

async function assertNotLocked(producerUserId: string): Promise<void> {
  if (await isLocked(producerUserId)) {
    throw new DomainError('RATE_LIMITED', 'Trop de tentatives — réessayez dans 30 minutes');
  }
}

async function isLocked(producerUserId: string): Promise<boolean> {
  const now = new Date();
  const lockedRow = await prisma.teleconsultCode.findFirst({
    where: {
      producerUserId,
      lockedUntil: { gt: now },
    },
    select: { id: true },
  });
  return lockedRow !== null;
}

async function registerFailedAttempt(producerUserId: string): Promise<void> {
  // Cherche le dernier code émis pour ce producteur (utilisé ou non) dans
  // la fenêtre de lockout. Si aucun → no-op.
  const windowStart = new Date(Date.now() - TELECONSULT_LOCKOUT_WINDOW_MS);
  const lastCode = await prisma.teleconsultCode.findFirst({
    where: {
      producerUserId,
      createdAt: { gt: windowStart },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!lastCode) return;
  await prisma.teleconsultCode.update({
    where: { id: lastCode.id },
    data: { failedAttempts: { increment: 1 } },
  });
  await maybeApplyLockout(producerUserId);
}

async function maybeApplyLockout(producerUserId: string): Promise<void> {
  const windowStart = new Date(Date.now() - TELECONSULT_LOCKOUT_WINDOW_MS);
  const codes = await prisma.teleconsultCode.findMany({
    where: {
      producerUserId,
      createdAt: { gt: windowStart },
    },
    select: { failedAttempts: true },
  });
  const total = codes.reduce((sum, c) => sum + c.failedAttempts, 0);
  if (total < TELECONSULT_LOCKOUT_MAX_ATTEMPTS) return;

  const lockedUntil = new Date(Date.now() + TELECONSULT_LOCKOUT_DURATION_MS);
  // Pose le lockout sur le dernier code (ou crée un row "sentinel" sinon).
  const last = await prisma.teleconsultCode.findFirst({
    where: { producerUserId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (last) {
    await prisma.teleconsultCode.update({
      where: { id: last.id },
      data: { lockedUntil },
    });
  }
  logger.warn(
    { event: 'teleconsult.code.lockout', producerUserId, totalAttempts: total, lockedUntil },
    'teleconsult.code.lockout',
  );
}

// ─────────────────────────────────────────────────────────────────
// Cleanup (utilisé par le cron)

/**
 * Purge tous les codes créés depuis plus d'1h ET non utilisés. Pas de
 * cascade — sessions référencent codes via FK Restrict (les codes utilisés
 * restent).
 */
async function cleanupExpiredInternal(): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // > 1h
  const res = await prisma.teleconsultCode.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      usedAt: null,
      sessions: { none: {} }, // sécurité : pas de session active liée
    },
  });
  return { purged: res.count };
}

// ─────────────────────────────────────────────────────────────────
// Export

export const codeService = {
  generateForProducer: generateForProducerInternal,
  verifyAndConsume: verifyAndConsumeInternal,
  cleanupExpired: cleanupExpiredInternal,
};
