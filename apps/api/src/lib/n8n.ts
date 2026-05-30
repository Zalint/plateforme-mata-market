import { createHmac } from 'node:crypto';
import { env } from '../env.js';
import { httpFetch } from './bictorys.js';
import { logger } from './logger.js';

/**
 * Dispatch sortant vers n8n (Lot 7).
 *
 * Référence : CLAUDE.md §G3 (« n8n jamais dans le chemin critique. Si n8n down,
 * le système fonctionne »), §G5 (« Pattern Outbox : event dans outbox_events,
 * cron délivre. Si n8n down, retry rattrape », timeout 10s + retry exponentiel).
 *
 * INVARIANTS :
 *  1. `N8N_WEBHOOK_SECRET` ne quitte JAMAIS le serveur (pino redact `*.n8n*`).
 *  2. Chaque payload sortant est signé HMAC SHA-256 sur le RAW BODY exact
 *     envoyé, posé dans l'en-tête `X-Mata-Signature` (hex). n8n vérifie avant
 *     de traiter — symétrique de notre propre vérif webhook Bictorys.
 *  3. `dispatch` ne throw JAMAIS : il retourne {ok:false} en cas d'échec pour
 *     que le cron retry-outbox décide quoi faire (re-tenter / abandonner).
 */

export function isN8nConfigured(): boolean {
  return Boolean(env.N8N_BASE_URL && env.N8N_WEBHOOK_SECRET);
}

/**
 * Signe le raw body en HMAC SHA-256 (hex). Exporté pour les tests (un test
 * peut recalculer la signature attendue) et pour usage symétrique côté n8n.
 */
export function signN8nPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export type DispatchResult = { ok: true; statusCode: number } | { ok: false; error: string };

/**
 * POST un event vers `${N8N_BASE_URL}/<eventType>` avec signature HMAC.
 *
 * Le body envoyé est `JSON.stringify({ eventType, payload })` — la signature
 * porte sur ces bytes exacts. `httpFetch` re-sérialise le même objet de façon
 * déterministe, donc les bytes signés == les bytes envoyés.
 *
 * Ne throw jamais : capture l'échec httpFetch (réseau / 5xx épuisé) et le 4xx,
 * et retourne {ok:false} pour laisser le cron gérer le retry.
 */
export async function dispatchToN8n(eventType: string, payload: unknown): Promise<DispatchResult> {
  if (!env.N8N_BASE_URL || !env.N8N_WEBHOOK_SECRET) {
    return { ok: false, error: 'n8n_not_configured' };
  }

  const bodyObj = { eventType, payload };
  const rawBody = JSON.stringify(bodyObj);
  const signature = signN8nPayload(rawBody, env.N8N_WEBHOOK_SECRET);
  const url = `${env.N8N_BASE_URL.replace(/\/$/, '')}/${encodeURIComponent(eventType)}`;

  try {
    const res = await httpFetch({
      method: 'POST',
      url,
      headers: { 'x-mata-signature': signature },
      body: bodyObj,
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, statusCode: res.status };
    }
    return { ok: false, error: `n8n_http_${res.status}` };
  } catch (err) {
    // httpFetch throw une DomainError quand n8n est injoignable après 3 tentatives.
    // n8n hors chemin critique : on log + on rend l'échec, le cron retentera.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ eventType, url, err: message }, 'n8n.dispatch.failed');
    return { ok: false, error: message };
  }
}
