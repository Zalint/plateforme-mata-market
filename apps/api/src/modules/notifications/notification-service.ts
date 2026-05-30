import type { NotificationCategory } from '@mata/shared/constants';
import type {
  NotificationPreferencesOutput,
  NotificationPreferencesUpdate,
  PushSubscribe,
} from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { isWebPushConfigured, sendWebPush } from '../../lib/web-push.js';
import { auditService } from '../audit/index.js';

/**
 * Service notifications push web (Lot 7).
 *
 * Référence : CLAUDE.md §G1 (« Endpoints 410 supprimés immédiatement »),
 * §G5 (intégrations), §G8 (clés VAPID jamais côté client).
 *
 * INVARIANTS :
 *  1. Un endpoint qui renvoie 404/410 est supprimé IMMÉDIATEMENT (au prochain
 *     envoi). Pas de retry sur un abonnement mort.
 *  2. `sendToUser` respecte les préférences : pushEnabled global + opt-out par
 *     catégorie. Une catégorie absente des prefs = activée par défaut.
 *  3. Le push n'est JAMAIS dans le chemin critique : `sendToUser` ne throw
 *     pas, log + continue (un échec d'envoi ne casse aucune mutation métier).
 */

// ─────────────────────────────────────────────────────────────────
// Abonnement

interface SubscribeArgs {
  userId: string;
  subscription: PushSubscribe;
  request?: FastifyRequest;
}

async function subscribeInternal(args: SubscribeArgs): Promise<void> {
  const { userId, subscription, request } = args;

  // Upsert par endpoint : ré-abonnement du même device met à jour les clés
  // et réattribue au bon user (cas device partagé puis ré-login).
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });

  await auditService.log({
    actorUserId: userId,
    action: 'notification.subscribe',
    targetType: 'push_subscription',
    request,
  });
}

interface UnsubscribeArgs {
  userId: string;
  endpoint: string;
  request?: FastifyRequest;
}

async function unsubscribeInternal(args: UnsubscribeArgs): Promise<void> {
  const { userId, endpoint, request } = args;

  // deleteMany (pas delete) pour rester idempotent si l'endpoint a déjà été
  // purgé (ex: nettoyage 410 concurrent). Borné au user pour éviter qu'un
  // user supprime l'abonnement d'un autre.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });

  await auditService.log({
    actorUserId: userId,
    action: 'notification.unsubscribe',
    targetType: 'push_subscription',
    request,
  });
}

// ─────────────────────────────────────────────────────────────────
// Préférences

function parseCategories(raw: Prisma.JsonValue): Record<string, boolean> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  }
  return {};
}

async function getPreferencesInternal(userId: string): Promise<NotificationPreferencesOutput> {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  return {
    pushEnabled: pref?.pushEnabled ?? true,
    emailEnabled: pref?.emailEnabled ?? true,
    categories: parseCategories(pref?.categories ?? {}),
  };
}

interface UpdatePreferencesArgs {
  userId: string;
  input: NotificationPreferencesUpdate;
  request?: FastifyRequest;
}

async function updatePreferencesInternal(
  args: UpdatePreferencesArgs,
): Promise<NotificationPreferencesOutput> {
  const { userId, input, request } = args;

  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  const mergedCategories = {
    ...parseCategories(existing?.categories ?? {}),
    ...(input.categories ?? {}),
  };

  const saved = await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      pushEnabled: input.pushEnabled ?? true,
      emailEnabled: input.emailEnabled ?? true,
      categories: mergedCategories as Prisma.InputJsonValue,
    },
    update: {
      ...(input.pushEnabled !== undefined && { pushEnabled: input.pushEnabled }),
      ...(input.emailEnabled !== undefined && { emailEnabled: input.emailEnabled }),
      categories: mergedCategories as Prisma.InputJsonValue,
    },
  });

  await auditService.log({
    actorUserId: userId,
    action: 'notification.preferences_update',
    targetType: 'notification_preference',
    targetId: userId,
    newValue: {
      pushEnabled: saved.pushEnabled,
      emailEnabled: saved.emailEnabled,
    },
    request,
  });

  return {
    pushEnabled: saved.pushEnabled,
    emailEnabled: saved.emailEnabled,
    categories: parseCategories(saved.categories),
  };
}

// ─────────────────────────────────────────────────────────────────
// Envoi

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  category: NotificationCategory;
}

/**
 * Envoie une notification à toutes les souscriptions d'un user, en respectant
 * ses préférences. Ne throw jamais (push hors chemin critique). Supprime
 * immédiatement les endpoints 404/410. Retourne le nombre d'envois réussis.
 */
async function sendToUserInternal(
  userId: string,
  payload: NotificationPayload,
): Promise<{ sent: number; removed: number }> {
  if (!isWebPushConfigured()) {
    logger.debug({ userId, category: payload.category }, 'webpush.skip.not_configured');
    return { sent: 0, removed: 0 };
  }

  const prefs = await getPreferencesInternal(userId);
  if (!prefs.pushEnabled || prefs.categories[payload.category] === false) {
    logger.debug({ userId, category: payload.category }, 'webpush.skip.opted_out');
    return { sent: 0, removed: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let removed = 0;
  const goneEndpoints: string[] = [];

  for (const sub of subs) {
    const result = await sendWebPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: payload.title,
        body: payload.body,
        url: payload.url ?? '/',
        category: payload.category,
      },
    );
    if (result.ok) {
      sent++;
    } else if (result.gone) {
      goneEndpoints.push(sub.endpoint);
    }
  }

  // CLAUDE.md §G1 : endpoints 410 supprimés IMMÉDIATEMENT.
  if (goneEndpoints.length > 0) {
    const del = await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: goneEndpoints } },
    });
    removed = del.count;
  }

  if (sent > 0 || removed > 0) {
    await prisma.pushSubscription.updateMany({
      where: { userId, endpoint: { notIn: goneEndpoints } },
      data: { lastUsedAt: new Date() },
    });
  }

  logger.info({ userId, category: payload.category, sent, removed }, 'webpush.sent');
  return { sent, removed };
}

// ─────────────────────────────────────────────────────────────────
// Service exporté

export const notificationService = {
  subscribe: subscribeInternal,
  unsubscribe: unsubscribeInternal,
  getPreferences: getPreferencesInternal,
  updatePreferences: updatePreferencesInternal,
  sendToUser: sendToUserInternal,
};
