import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '@mata/shared/errors';
import { z } from 'zod';
import { env } from '../env.js';
import { logger } from './logger.js';

/**
 * Client Bictorys · paiement (checkout hosted) + disbursement (reversements).
 *
 * Référence : ARCHITECTURE.md §7 (Bictorys checkout hosted, 4 statuts MATA,
 * idempotence 3 niveaux), CLAUDE.md §G5 (raw body + HMAC temps constant,
 * timeout + retry exponentiel sur appels sortants), §G8 (sécurité webhooks),
 * référence MataPay-Payment.html (pattern checkout côté MATA existant).
 *
 * INVARIANTS DE SÉCURITÉ :
 *  1. `BICTORYS_API_SECRET` et `BICTORYS_WEBHOOK_SECRET` ne quittent JAMAIS
 *     le serveur. Jamais loggés (pino redact configuré).
 *  2. `verifyWebhookSignature` lit le RAW BODY et compare en TEMPS CONSTANT
 *     (`timingSafeEqual`) AVANT toute autre logique côté service.
 *  3. Tout appel sortant a un timeout de 10s et 3 tentatives en retry
 *     exponentiel (CLAUDE.md §G5). Pas de `fetch` nu.
 *  4. Les réponses Bictorys sont VALIDÉES Zod avant utilisation — aucune
 *     confiance dans le payload du provider.
 *
 * NOTE — URL + format de signature à confirmer par la doc Bictorys :
 *  - `BICTORYS_API_BASE_URL` configurable via env (default https://api.test.bictorys.com)
 *  - paths `/charges`, `/charges/:id`, `/payouts` : hypothèses raisonnables sur
 *    base d'autres intégrations PSP. À ajuster ici-même si la doc diffère.
 *  - Auth header : `Authorization: Bearer <API_SECRET>` + `X-Api-Key: <API_KEY>`.
 *    Pattern le plus courant ; à pivoter au besoin.
 *  - Webhook signature : header `X-Bictorys-Signature` (hex SHA-256 HMAC sur raw body).
 *    Algorithme standard ; à vérifier si Bictorys utilise base64 ou un autre header.
 *
 * Pour un test bout-en-bout sandbox réel, valider ces hypothèses via la doc
 * Bictorys avant de retirer le mock côté tests d'intégration.
 */

// ─────────────────────────────────────────────────────────────────
// Configuration & guards

export type BictorysConfig = {
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
  baseUrl: string;
};

const DEFAULT_BASE_URL = 'https://api.test.bictorys.com';

/**
 * Vérifie que les variables Bictorys sont définies. Refuse de procéder
 * sinon (CLAUDE.md §G5 : « Clés externes validées Zod au boot. Manquante
 * en prod = serveur refuse de démarrer. »).
 *
 * Appelé par le payment-service uniquement, pas au boot global — ainsi les
 * tests unitaires qui ne touchent pas Bictorys ne nécessitent pas ces vars.
 * Le boot prod refuse de démarrer si BICTORYS_API_SECRET manque (cf. server.ts).
 */
export function requireBictorysConfig(): BictorysConfig {
  if (!env.BICTORYS_API_KEY || !env.BICTORYS_API_SECRET || !env.BICTORYS_WEBHOOK_SECRET) {
    throw new DomainError(
      'EXTERNAL_FAILURE',
      'Bictorys non configuré (BICTORYS_API_KEY, _API_SECRET, _WEBHOOK_SECRET requis)',
    );
  }
  return {
    apiKey: env.BICTORYS_API_KEY,
    apiSecret: env.BICTORYS_API_SECRET,
    webhookSecret: env.BICTORYS_WEBHOOK_SECRET,
    baseUrl: env.BICTORYS_API_BASE_URL ?? DEFAULT_BASE_URL,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helper httpFetch — timeout 10s + retry exp 3× base 500ms (CLAUDE.md §G5)

type HttpFetchOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown; // JSON-serialisable (content-type: application/json)
  // Corps `application/x-www-form-urlencoded` (mutuellement exclusif avec `body`).
  // Utilisé pour les API qui n'acceptent pas de JSON (ex : hCaptcha siteverify).
  // Les valeurs ne sont JAMAIS loggées (seule `url` l'est) — on garde donc les
  // secrets dans le form, jamais en query string (CLAUDE.md §G8).
  form?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
};

type HttpFetchResult = {
  status: number;
  body: unknown;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 500;

/**
 * Helper HTTP avec timeout + retry exponentiel.
 *
 * - Timeout par tentative : 10s (AbortController).
 * - Retry sur erreurs réseau ET 5xx (jamais sur 4xx — erreur applicative,
 *   pas la peine de retenter).
 * - Backoff exponentiel : 500ms, 1000ms, 2000ms entre les tentatives.
 *
 * Exposé pour usage par d'autres intégrations futures (resend, n8n, ...).
 */
export async function httpFetch(opts: HttpFetchOptions): Promise<HttpFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Corps : form-urlencoded si `form` fourni, sinon JSON (défaut).
      const isForm = opts.form !== undefined;
      const requestBody = isForm
        ? new URLSearchParams(opts.form).toString()
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined;
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: {
          'content-type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
          accept: 'application/json',
          ...opts.headers,
        },
        body: requestBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text();
      let parsedBody: unknown = null;
      if (text.length > 0) {
        try {
          parsedBody = JSON.parse(text);
        } catch {
          parsedBody = { raw: text };
        }
      }

      // 5xx : retry. 4xx : abandon (erreur applicative).
      if (res.status >= 500 && attempt < maxRetries - 1) {
        lastError = new Error(`HTTP ${res.status}`);
        const wait = retryBaseMs * 2 ** attempt;
        logger.warn(
          { url: opts.url, status: res.status, attempt: attempt + 1, retryInMs: wait },
          'httpFetch.retry',
        );
        await sleep(wait);
        continue;
      }

      return { status: res.status, body: parsedBody };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt < maxRetries - 1) {
        const wait = retryBaseMs * 2 ** attempt;
        logger.warn(
          { url: opts.url, err: errMessage(err), attempt: attempt + 1, retryInMs: wait },
          'httpFetch.network_retry',
        );
        await sleep(wait);
      }
    }
  }
  // Message générique (sans nom de prestataire) : `httpFetch` est un helper
  // partagé (Bictorys, n8n, hCaptcha...). Un échec n8n ne doit pas écrire
  // « Bictorys ... » dans `outbox_events.last_error` (debug trompeur).
  throw new DomainError('EXTERNAL_FAILURE', `Upstream request failed: ${errMessage(lastError)}`, {
    cause: lastError instanceof Error ? lastError : undefined,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ─────────────────────────────────────────────────────────────────
// Bictorys API · createPaymentIntent

// Paths à confirmer via doc Bictorys (cf. note en tête de fichier).
const PATHS = {
  createCharge: '/charges',
  getCharge: (id: string) => `/charges/${encodeURIComponent(id)}`,
  createPayout: '/payouts',
} as const;

export type CreatePaymentIntentInput = {
  amountFcfa: number;
  currency: string; // 'XOF'
  reference: string; // orderNumber MATA (CMD-2026-NNNN)
  returnUrl: string; // URL côté MATA web où le client revient
  callbackUrl: string; // URL webhook MATA api
  metadata: {
    orderId: string;
    orderNumber: string;
    paymentId: string;
  };
};

// Réponse minimale validée. Bictorys peut renvoyer plus de champs, on ne
// se base que sur ceux nécessaires côté MATA.
const CreatePaymentIntentResponseSchema = z.object({
  id: z.string().min(1), // providerIntentId Bictorys
  paymentUrl: z.string().url(),
  status: z.string(), // brut, mappé côté service
});

export type CreatePaymentIntentResponse = z.infer<typeof CreatePaymentIntentResponseSchema>;

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResponse> {
  const config = requireBictorysConfig();
  const result = await httpFetch({
    method: 'POST',
    url: `${config.baseUrl}${PATHS.createCharge}`,
    headers: authHeaders(config),
    body: {
      amount: input.amountFcfa,
      currency: input.currency,
      reference: input.reference,
      return_url: input.returnUrl,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });

  if (result.status >= 400) {
    throw new DomainError('EXTERNAL_FAILURE', `Bictorys createCharge HTTP ${result.status}`, {
      details: { status: result.status },
    });
  }

  const parsed = CreatePaymentIntentResponseSchema.safeParse(result.body);
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues, url: PATHS.createCharge },
      'bictorys.createCharge.invalid_response',
    );
    throw new DomainError('EXTERNAL_FAILURE', 'Bictorys createCharge response invalide');
  }
  return parsed.data;
}

// ─────────────────────────────────────────────────────────────────
// Bictorys API · getPaymentStatus (polling éventuel + reconciliation)

const GetPaymentStatusResponseSchema = z.object({
  id: z.string(),
  status: z.string(), // brut
  amount: z.number().int().optional(),
  currency: z.string().optional(),
  paymentMethod: z.string().nullable().optional(),
  customer: z
    .object({
      name: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type GetPaymentStatusResponse = z.infer<typeof GetPaymentStatusResponseSchema>;

export async function getPaymentStatus(
  providerIntentId: string,
): Promise<GetPaymentStatusResponse> {
  const config = requireBictorysConfig();
  const result = await httpFetch({
    method: 'GET',
    url: `${config.baseUrl}${PATHS.getCharge(providerIntentId)}`,
    headers: authHeaders(config),
  });

  if (result.status === 404) {
    throw new DomainError('NOT_FOUND', `Intent ${providerIntentId} introuvable côté Bictorys`);
  }
  if (result.status >= 400) {
    throw new DomainError('EXTERNAL_FAILURE', `Bictorys getCharge HTTP ${result.status}`);
  }

  const parsed = GetPaymentStatusResponseSchema.safeParse(result.body);
  if (!parsed.success) {
    throw new DomainError('EXTERNAL_FAILURE', 'Bictorys getCharge response invalide');
  }
  return parsed.data;
}

// ─────────────────────────────────────────────────────────────────
// Bictorys API · triggerDisbursement (reversement producteur)

export type TriggerDisbursementInput = {
  amountFcfa: number;
  currency: string;
  reference: string; // ex: PAY-2026-NNNN MATA
  idempotencyKey: string; // payouts.id MATA — re-call avec même key = no-op côté provider
  beneficiary: {
    holder: string;
    iban: string;
    bic?: string;
    bankName: string;
  };
};

const TriggerDisbursementResponseSchema = z.object({
  id: z.string().min(1), // providerDisbursementId
  status: z.string(),
});

export type TriggerDisbursementResponse = z.infer<typeof TriggerDisbursementResponseSchema>;

export async function triggerDisbursement(
  input: TriggerDisbursementInput,
): Promise<TriggerDisbursementResponse> {
  const config = requireBictorysConfig();
  const result = await httpFetch({
    method: 'POST',
    url: `${config.baseUrl}${PATHS.createPayout}`,
    headers: {
      ...authHeaders(config),
      // Idempotence côté provider (le header standard est `Idempotency-Key`).
      'idempotency-key': input.idempotencyKey,
    },
    body: {
      amount: input.amountFcfa,
      currency: input.currency,
      reference: input.reference,
      beneficiary: input.beneficiary,
    },
  });

  if (result.status >= 400) {
    throw new DomainError('EXTERNAL_FAILURE', `Bictorys disbursement HTTP ${result.status}`, {
      details: { status: result.status },
    });
  }

  const parsed = TriggerDisbursementResponseSchema.safeParse(result.body);
  if (!parsed.success) {
    throw new DomainError('EXTERNAL_FAILURE', 'Bictorys disbursement response invalide');
  }
  return parsed.data;
}

// ─────────────────────────────────────────────────────────────────
// Webhook · vérification signature HMAC SHA-256 EN TEMPS CONSTANT

/**
 * Vérifie la signature HMAC SHA-256 du webhook Bictorys.
 *
 * SÉCURITÉ CRITIQUE (CLAUDE.md §G5, ARCHITECTURE.md §9) :
 *  - Lit le RAW BODY brut (Buffer ou string) — fastify-raw-body scope-limited
 *  - Compare avec `timingSafeEqual` (résiste aux timing attacks)
 *  - Aucune autre logique avant cette vérification
 *
 * Format header attendu : `X-Bictorys-Signature` ou `X-Signature` au format hex.
 * Si Bictorys utilise base64, ajuster le `digest('hex')` ci-dessous.
 *
 * Retourne `true` si valide, `false` sinon. JAMAIS THROW pour ne pas révéler
 * la cause précise (timing/format) au caller (anti enumeration attack).
 */
export function verifyWebhookSignature(args: {
  rawBody: Buffer | string;
  signatureHeader: string | null | undefined;
  secret: string;
}): boolean {
  if (!args.signatureHeader || args.signatureHeader.length === 0) return false;
  if (!args.secret || args.secret.length === 0) return false;

  const expected = createHmac('sha256', args.secret)
    .update(typeof args.rawBody === 'string' ? Buffer.from(args.rawBody, 'utf8') : args.rawBody)
    .digest('hex');

  // Normalise (lowercase, trim, retire un éventuel préfixe "sha256=").
  const provided = args.signatureHeader
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');

  // Comparaison en temps constant nécessite des Buffers de même longueur.
  // Si tailles différentes, on compare quand même mais on sait que c'est faux —
  // on fait un compare bidon de la même taille pour ne pas leak de timing.
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  if (expectedBuf.length !== providedBuf.length) {
    // Compare expected à lui-même pour brûler le même temps CPU.
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

// ─────────────────────────────────────────────────────────────────
// Webhook · parse + map du payload Bictorys vers PaymentStatus MATA

import { PAYMENT_STATUSES, type PaymentStatus } from '@mata/shared/constants';

// Schéma défensif du webhook Bictorys. On ne valide QUE les champs MATA
// utilise — tout le reste passe sous le radar (et reste dans rawWebhookPayload).
export const BictorysWebhookPayloadSchema = z.object({
  id: z.string().min(1), // == providerIntentId
  status: z.string(), // brut Bictorys, mappé via mapBictorysStatus
  amount: z.number().int().optional(),
  currency: z.string().optional(),
  paymentMethod: z.string().nullable().optional(),
  customer: z
    .object({
      name: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type BictorysWebhookPayload = z.infer<typeof BictorysWebhookPayloadSchema>;

/**
 * Mappe un statut Bictorys brut vers PaymentStatus MATA.
 *
 * Source : MataPay-Return.html (statuts observés : opened/paid/expired)
 * + conventions PSP courantes. Bictorys peut envoyer d'autres valeurs —
 * `null` signifie « pas de mapping connu, garder le statut courant côté MATA »
 * (le service appellera typiquement un log warn pour investigation).
 */
export function mapBictorysStatus(rawStatus: string): PaymentStatus | null {
  const s = rawStatus.toLowerCase().trim();
  switch (s) {
    case 'paid':
    case 'succeeded':
    case 'success':
    case 'completed':
      return 'paid';
    case 'opened':
    case 'pending':
    case 'processing':
    case 'created':
    case 'expired': // expiré côté Bictorys → reste pending côté MATA jusqu'au cancel order
      return 'pending';
    case 'refunded':
    case 'reversed':
      return 'refunded';
    case 'disputed':
    case 'chargeback':
    case 'fraud':
      return 'disputed';
    default: {
      // Garde-fou : si Bictorys ajoute un statut, on vérifie quand même qu'il
      // n'est pas malicieux (ex: SQL injection en string). PAYMENT_STATUSES
      // est une whitelist stricte.
      const known = (PAYMENT_STATUSES as readonly string[]).includes(s);
      return known ? (s as PaymentStatus) : null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Internal · headers d'authentification Bictorys

function authHeaders(config: BictorysConfig): Record<string, string> {
  // Pattern défensif (cf. note en tête de fichier). À pivoter selon doc Bictorys :
  //  - Authorization: Bearer <SECRET>           (pattern courant Stripe-like)
  //  - X-Api-Key: <PUBLIC_KEY>                  (pattern courant pour identification)
  return {
    authorization: `Bearer ${config.apiSecret}`,
    'x-api-key': config.apiKey,
  };
}
