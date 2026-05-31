import webpush, { type PushSubscription, WebPushError } from 'web-push';
import { env } from '../env.js';
import { logger } from './logger.js';

/**
 * Wrapper Web Push (VAPID) · Lot 7.
 *
 * Référence : CLAUDE.md §G1 (« Push web : permission demandée tardivement.
 * Endpoints 410 supprimés immédiatement »), §G8 (VAPID_PRIVATE_KEY jamais
 * côté client), §G5 (intégrations sortantes).
 *
 * Pourquoi la lib `web-push` : le protocole Web Push impose le chiffrement
 * du payload (ECDH P-256 + HKDF + AES-128-GCM, RFC 8291) et la signature
 * VAPID (JWT ES256, RFC 8292). Réimplémenter ce pipeline à la main serait
 * long et risqué côté crypto. `web-push` est la référence de facto, sans
 * dépendances natives. Alternative écartée : `@block65/webcrypto-web-push`
 * (moins mature). Surface : code JS pur, lit nos clés VAPID, aucune télémétrie.
 *
 * VAPID_PRIVATE_KEY ne quitte jamais le serveur (pino redact configuré).
 * Seule VAPID_PUBLIC_KEY est exposée au front (NEXT_PUBLIC_).
 */

export type WebPushKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

/**
 * Configure les détails VAPID une seule fois. Throw si les clés manquent —
 * appelé paresseusement par `sendWebPush`, donc les tests/déploiements sans
 * push ne sont pas bloqués au boot (le push n'est jamais dans le chemin
 * critique d'une mutation métier).
 */
function ensureConfigured(): void {
  if (configured) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error(
      'Web Push non configuré : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT requis',
    );
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export type SendWebPushResult =
  | { ok: true }
  | { ok: false; gone: boolean; statusCode: number | null; error: string };

/**
 * Envoie une notification push à un abonnement. Ne throw jamais : retourne
 * un résultat structuré. `gone: true` (HTTP 404/410) signale au service
 * appelant qu'il doit supprimer l'abonnement IMMÉDIATEMENT (CLAUDE.md §G1).
 */
export async function sendWebPush(
  keys: WebPushKeys,
  payload: Record<string, unknown>,
): Promise<SendWebPushResult> {
  ensureConfigured();

  const subscription: PushSubscription = {
    endpoint: keys.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
    return { ok: true };
  } catch (err) {
    if (err instanceof WebPushError) {
      const gone = err.statusCode === 404 || err.statusCode === 410;
      // On ne logge PAS l'endpoint complet (peut contenir un token) ni les
      // clés p256dh/auth (pino redact les couvre de toute façon).
      logger.warn(
        { statusCode: err.statusCode, gone },
        gone ? 'webpush.subscription.gone' : 'webpush.send.failed',
      );
      return { ok: false, gone, statusCode: err.statusCode, error: err.body };
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'webpush.send.error');
    return { ok: false, gone: false, statusCode: null, error: message };
  }
}
