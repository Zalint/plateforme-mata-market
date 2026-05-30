import { z } from 'zod';
import { env } from '../env.js';
import { httpFetch } from './bictorys.js';
import { logger } from './logger.js';

/**
 * Vérification hCaptcha · anti-bot pour le mode invité (Lot 8).
 *
 * Référence : CLAUDE.md §G3 (« Mode invité SÉPARÉ : routes /v1/guest/*, plugin
 * Fastify dédié, rate-limit strict »), §G5 (appels sortants via `httpFetch`,
 * timeout + retry), §G8 (secret jamais loggé, jamais en query string).
 *
 * SCAFFOLD OPTIONNEL : si `HCAPTCHA_SECRET` n'est pas configuré (cas dev par
 * défaut), la vérification est désactivée — le plugin guest log et laisse
 * passer. En prod, injecter le secret active la vérification réelle.
 *
 * INVARIANTS :
 *  1. `HCAPTCHA_SECRET` ne quitte jamais le serveur : envoyé dans le BODY
 *     form-urlencoded (jamais en query string → jamais loggé par httpFetch).
 *  2. La réponse hCaptcha est validée Zod (aucune confiance dans le payload).
 */

const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

/**
 * Vrai si la vérification hCaptcha est activée (secret configuré). Exposé pour
 * que les routes/plugins décident d'exiger ou non un token, et pour les tests.
 */
export function isHcaptchaConfigured(): boolean {
  return Boolean(env.HCAPTCHA_SECRET);
}

// Réponse de l'API siteverify hCaptcha. On ne lit que `success` ; les autres
// champs (`error-codes`, `challenge_ts`, `hostname`) sont optionnels.
const HcaptchaVerifyResponseSchema = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).optional(),
});

export type HcaptchaVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'missing_token' | 'rejected' | 'verify_failed' };

/**
 * Vérifie un token hCaptcha auprès de l'API siteverify.
 *
 * - Si non configuré → `{ ok: false, reason: 'not_configured' }` (l'appelant
 *   décide de laisser passer en dev).
 * - Si token absent alors que configuré → `{ ok: false, reason: 'missing_token' }`.
 * - Erreur réseau → `{ ok: false, reason: 'verify_failed' }` (ne throw pas :
 *   l'appelant choisit la politique d'échec).
 *
 * `remoteIp` est optionnel (hCaptcha l'accepte pour affiner le scoring).
 */
export async function verifyHcaptcha(
  token: string | undefined,
  remoteIp?: string,
): Promise<HcaptchaVerifyResult> {
  const secret = env.HCAPTCHA_SECRET;
  if (!secret) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!token) {
    return { ok: false, reason: 'missing_token' };
  }

  const form: Record<string, string> = { secret, response: token };
  if (remoteIp) {
    form.remoteip = remoteIp;
  }

  try {
    const res = await httpFetch({ method: 'POST', url: HCAPTCHA_VERIFY_URL, form });
    const parsed = HcaptchaVerifyResponseSchema.safeParse(res.body);
    if (!parsed.success) {
      logger.warn({ status: res.status }, 'hcaptcha.verify.unexpected_response');
      return { ok: false, reason: 'verify_failed' };
    }
    if (!parsed.data.success) {
      logger.warn({ errorCodes: parsed.data['error-codes'] ?? [] }, 'hcaptcha.verify.rejected');
      return { ok: false, reason: 'rejected' };
    }
    return { ok: true };
  } catch (err) {
    // httpFetch throw après épuisement des retries (réseau/5xx). On ne propage
    // pas : la politique d'échec (bloquer / laisser passer) appartient au plugin.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'hcaptcha.verify.network_failure',
    );
    return { ok: false, reason: 'verify_failed' };
  }
}
