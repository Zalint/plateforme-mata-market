import { DomainError } from '@mata/shared/errors';
import type { PaymentAdminListQuery, PaymentIntentResponse } from '@mata/shared/schemas';
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { env } from '../../env.js';
import {
  BictorysWebhookPayloadSchema,
  createPaymentIntent,
  mapBictorysStatus,
  requireBictorysConfig,
  verifyWebhookSignature,
} from '../../lib/bictorys.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type { AuditAction, AuditLogInput } from '../audit/audit-service.js';
import { auditService } from '../audit/index.js';
import { type PaymentLoaded, paymentInclude, toPaymentOutput } from './mappers.js';

/**
 * Convertit un `customer` Bictorys (undefined | null | object) vers la
 * forme attendue par Prisma pour une colonne `Json?` :
 *   - undefined : ne pas toucher la colonne (skip update)
 *   - null      : Prisma.DbNull (mise à NULL en DB)
 *   - object    : value cast en InputJsonValue
 */
function toCustomerJsonInput(
  customer:
    | { name?: string | null; phone?: string | null; email?: string | null }
    | null
    | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (customer === undefined) return undefined;
  if (customer === null) return Prisma.DbNull;
  return customer as Prisma.InputJsonValue;
}

/**
 * Helper : log un audit déclenché par un webhook automatisé.
 *
 * Le webhook n'a pas de FastifyRequest authentifié (route publique), donc
 * pas d'utilisateur courant. On utilise l'utilisateur client de l'order
 * comme acteur naturel. Si l'order est guest (clientUserId null, Lot 8),
 * on skip l'écriture audit (avec warn) plutôt que d'échouer la FK.
 */
async function logWebhookAudit(
  args: Omit<AuditLogInput, 'actorUserId'> & { actorUserId: string | null; action: AuditAction },
): Promise<void> {
  if (!args.actorUserId) {
    logger.warn(
      {
        event: 'webhook.audit_skipped_no_client_user',
        action: args.action,
        targetId: args.targetId,
      },
      'webhook.audit_skipped_no_client_user',
    );
    return;
  }
  await auditService.log({
    actorUserId: args.actorUserId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    oldValue: args.oldValue,
    newValue: args.newValue,
    request: args.request,
  });
}

/**
 * Service payments · checkout Bictorys + webhook + reconciliation.
 *
 * Référence : CLAUDE.md §G5 (HMAC raw body + idempotence triple niveau),
 *             ARCHITECTURE.md §7 (flux paiement 6 étapes),
 *             mockup §2774 (ADMIN/PAYMENTS), réf MataPay-Payment.html.
 *
 * Garanties critiques :
 *  1. Webhook : signature HMAC vérifiée AVANT toute autre logique.
 *  2. Idempotence : lookup par providerIntentId. Replay = no-op + 200.
 *  3. Transaction : update payment + transition order + outbox event + audit
 *     atomiques (tout rollback si une étape échoue).
 *  4. Cancel race : si webhook 'paid' arrive APRÈS cancel order, le payment
 *     passe en 'refunded' au lieu d'échouer la transition. Audit + log warn.
 */

// ─────────────────────────────────────────────────────────────────
// Création du checkout (POST /v1/payments/intents)

interface CreateCheckoutSessionArgs {
  /** `null` = commande invité (Lot 8) → audit `payment.intent_created` skippé. */
  actorUserId: string | null;
  orderId: string;
  request?: FastifyRequest;
}

async function createCheckoutSessionInternal(
  args: CreateCheckoutSessionArgs,
): Promise<PaymentIntentResponse> {
  const { actorUserId, orderId, request } = args;

  // Charge l'order pour valider state + récupérer montant.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalFcfa: true,
      payment: { select: { id: true, paymentUrl: true, providerIntentId: true, status: true } },
    },
  });
  if (!order) throw new DomainError('NOT_FOUND', 'Commande introuvable');

  // L'intent ne peut être créé que si :
  //  - order.status === 'created' (pas encore confirmé/annulé)
  //  - order.paymentStatus === 'pending' (pas encore payé)
  if (order.status !== 'created') {
    throw new DomainError(
      'CONFLICT',
      `Impossible de créer un paiement : commande au statut ${order.status}`,
    );
  }
  if (order.paymentStatus !== 'pending') {
    throw new DomainError('CONFLICT', `Paiement déjà ${order.paymentStatus} pour cette commande`);
  }

  // Idempotence niveau service : si un payment row existe déjà pour cet order,
  // on retourne le même paymentUrl plutôt que d'en créer un nouveau côté Bictorys.
  // (Évite de polluer le provider avec des intents orphelins en cas de retry client.)
  if (order.payment && order.payment.status === 'pending') {
    return {
      paymentId: order.payment.id,
      paymentUrl: order.payment.paymentUrl,
      providerIntentId: order.payment.providerIntentId,
    };
  }

  // Pré-réserver une row payments pour avoir un paymentId stable à inclure
  // dans le metadata Bictorys (et le returnUrl client) AVANT l'appel sortant.
  // On le finalise après le callback Bictorys.
  const paymentId = crypto.randomUUID();
  const baseUrl = env.PUBLIC_WEB_URL;
  // La page de retour est sous (chromeless)/payment/return (pas /client/payment/return).
  const returnUrl = `${baseUrl}/payment/return?paymentId=${paymentId}`;
  // callbackUrl : à exposer via tunnel (ngrok/cloudflared) pour Bictorys sandbox.
  // En MVP local on simule le webhook via POST direct sur localhost.
  const callbackUrl = `${baseUrl.replace(/:\d+$/, ':4000')}/v1/payments/webhook`;

  // S'assurer que Bictorys est configuré (refuse early si non).
  requireBictorysConfig();

  const intent = await createPaymentIntent({
    amountFcfa: order.totalFcfa,
    currency: 'XOF',
    reference: order.orderNumber,
    returnUrl,
    callbackUrl,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentId,
    },
  });

  // Création de la row + audit dans une transaction pour cohérence.
  const created = await prisma.$transaction(async (tx) => {
    // Si un payment existe déjà en non-pending (race condition rare), respecte-le.
    const existing = await tx.payment.findUnique({ where: { orderId: order.id } });
    if (existing) {
      return existing;
    }
    return tx.payment.create({
      data: {
        id: paymentId,
        orderId: order.id,
        providerIntentId: intent.id,
        amountFcfa: order.totalFcfa,
        currency: 'XOF',
        status: 'pending',
        paymentUrl: intent.paymentUrl,
      },
    });
  });

  // Audit `payment.intent_created` : seulement pour un client authentifié. Pour
  // un invité (Lot 8) il n'y a pas de row `users` → on skip avec un warn (même
  // politique que `logWebhookAudit`).
  if (actorUserId) {
    await auditService.log({
      actorUserId,
      action: 'payment.intent_created',
      targetType: 'payment',
      targetId: created.id,
      newValue: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        providerIntentId: created.providerIntentId,
        amountFcfa: created.amountFcfa,
      },
      request,
    });
  } else {
    logger.warn(
      { event: 'payment.intent_created.guest_audit_skipped', paymentId: created.id },
      'payment.intent_created.guest_audit_skipped',
    );
  }

  return {
    paymentId: created.id,
    paymentUrl: created.paymentUrl,
    providerIntentId: created.providerIntentId,
  };
}

// ─────────────────────────────────────────────────────────────────
// Webhook (POST /v1/payments/webhook)

interface ProcessWebhookArgs {
  rawBody: Buffer | string;
  signatureHeader: string | null | undefined;
  /** Optionnel : pour les tests, override de la fonction de vérif. */
  request?: FastifyRequest;
}

type WebhookOutcome =
  | { kind: 'signature_invalid' }
  | { kind: 'unknown_intent'; providerIntentId: string }
  | { kind: 'duplicate'; paymentId: string }
  | { kind: 'updated'; paymentId: string; newStatus: string }
  | { kind: 'refunded_after_cancel'; paymentId: string };

async function processWebhookInternal(args: ProcessWebhookArgs): Promise<WebhookOutcome> {
  // SÉCURITÉ : vérification HMAC AVANT tout autre traitement.
  const config = requireBictorysConfig();
  const valid = verifyWebhookSignature({
    rawBody: args.rawBody,
    signatureHeader: args.signatureHeader,
    secret: config.webhookSecret,
  });
  if (!valid) {
    logger.warn(
      { event: 'webhook.signature_invalid', provider: 'bictorys' },
      'webhook.signature_invalid',
    );
    return { kind: 'signature_invalid' };
  }

  // Parse Zod du payload (raw body devenu string JSON-parsable).
  const bodyText = typeof args.rawBody === 'string' ? args.rawBody : args.rawBody.toString('utf8');
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(bodyText);
  } catch {
    logger.warn({ event: 'webhook.payload_not_json' }, 'webhook.payload_not_json');
    return { kind: 'signature_invalid' }; // côté caller, on renvoie 401 pour ne pas leak
  }
  const payloadParsed = BictorysWebhookPayloadSchema.safeParse(parsedPayload);
  if (!payloadParsed.success) {
    logger.warn(
      { event: 'webhook.payload_invalid', issues: payloadParsed.error.issues },
      'webhook.payload_invalid',
    );
    return { kind: 'signature_invalid' };
  }
  const payload = payloadParsed.data;

  // Lookup par providerIntentId (clé d'idempotence).
  const payment = await prisma.payment.findUnique({
    where: { providerIntentId: payload.id },
    include: {
      order: { select: { id: true, status: true, paymentStatus: true, clientUserId: true } },
    },
  });
  if (!payment) {
    // Intent inconnu : on retourne quand même 200 vers Bictorys (sinon
    // boucle de retry infinie). Log warn pour investigation.
    logger.warn(
      { event: 'webhook.unknown_intent', providerIntentId: payload.id },
      'webhook.unknown_intent',
    );
    return { kind: 'unknown_intent', providerIntentId: payload.id };
  }

  // Mappe le statut Bictorys brut vers PaymentStatus MATA.
  const newStatus = mapBictorysStatus(payload.status);
  if (newStatus === null) {
    // Statut inconnu côté Bictorys → on garde le statut courant, log + stocke
    // le raw payload pour investigation.
    logger.warn(
      { event: 'webhook.unknown_status', rawStatus: payload.status },
      'webhook.unknown_status',
    );
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        rawWebhookPayload: parsedPayload as Prisma.InputJsonValue,
        providerCustomer: toCustomerJsonInput(payload.customer),
      },
    });
    return { kind: 'duplicate', paymentId: payment.id }; // pas un duplicate stricto sensu mais le caller traite comme 200 no-op
  }

  // Idempotence : si le statut n'a pas bougé, no-op (Bictorys peut renvoyer le même webhook).
  if (payment.status === newStatus) {
    // On met quand même à jour le raw payload (audit post-mortem du dernier reçu).
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        rawWebhookPayload: parsedPayload as Prisma.InputJsonValue,
        providerCustomer: toCustomerJsonInput(payload.customer),
      },
    });
    return { kind: 'duplicate', paymentId: payment.id };
  }

  // Pour les actions automatisées (webhook), audit_log.actorUserId est rempli
  // avec le client de l'order (acteur naturel du checkout). Guest (Lot 8) à
  // gérer là-bas (clientUserId null → audit skip avec warn). Garde-fou ici.
  const webhookActorUserId = payment.order.clientUserId;
  if (!webhookActorUserId) {
    logger.warn(
      { event: 'webhook.no_client_user', paymentId: payment.id, orderId: payment.order.id },
      'webhook.no_client_user',
    );
  }

  // CAS PARTICULIER · cancel race : webhook 'paid' après order cancellé.
  // Cf. décision Lot 5 (option « Laisser expirer + handler webhook ») —
  // on bascule le payment en 'refunded' au lieu de tenter la transition order.
  if (newStatus === 'paid' && payment.order.status === 'cancelled') {
    logger.warn(
      {
        event: 'webhook.paid_after_cancel',
        paymentId: payment.id,
        orderId: payment.order.id,
      },
      'webhook.paid_after_cancel',
    );
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'refunded',
          refundedAt: new Date(),
          paymentMethod: payload.paymentMethod ?? null,
          rawWebhookPayload: parsedPayload as Prisma.InputJsonValue,
          providerCustomer: toCustomerJsonInput(payload.customer),
        },
      });
      // L'order reste 'cancelled' avec paymentStatus 'refunded'.
      await tx.order.update({
        where: { id: payment.order.id },
        data: { paymentStatus: 'refunded' },
      });
    });
    await logWebhookAudit({
      actorUserId: webhookActorUserId,
      action: 'payment.refunded',
      targetType: 'payment',
      targetId: payment.id,
      newValue: { reason: 'paid_after_cancel', providerIntentId: payment.providerIntentId },
      request: args.request,
    });
    return { kind: 'refunded_after_cancel', paymentId: payment.id };
  }

  // CAS NORMAL · update payment + transition order + outbox event + audit.
  await prisma.$transaction(async (tx) => {
    const updateData: Prisma.PaymentUpdateInput = {
      status: newStatus,
      rawWebhookPayload: parsedPayload as Prisma.InputJsonValue,
      providerCustomer: toCustomerJsonInput(payload.customer),
    };
    if (newStatus === 'paid') updateData.paidAt = new Date();
    if (newStatus === 'refunded') updateData.refundedAt = new Date();
    if (newStatus === 'disputed') updateData.disputedAt = new Date();
    if (payload.paymentMethod) updateData.paymentMethod = payload.paymentMethod;
    await tx.payment.update({ where: { id: payment.id }, data: updateData });

    // Si nouveau status === 'paid' : transition order created → confirmed.
    if (newStatus === 'paid' && payment.order.status === 'created') {
      await tx.order.update({
        where: { id: payment.order.id },
        data: {
          status: 'confirmed',
          paymentStatus: 'paid',
          confirmedAt: new Date(),
        },
      });
      // Outbox event pour dispatch n8n au Lot 7 (push producteur + email client).
      await tx.outboxEvent.create({
        data: {
          eventType: 'order.confirmed',
          payload: { orderId: payment.order.id, paymentId: payment.id } as Prisma.InputJsonValue,
        },
      });
    } else if (newStatus !== 'paid') {
      // Synchronise paymentStatus sur orders sans toucher au cycle status.
      await tx.order.update({
        where: { id: payment.order.id },
        data: { paymentStatus: newStatus },
      });

      // Si 'disputed' : bloque les payouts pending qui contiennent un item
      // de cette commande (cf. CLAUDE.md §G5 « bloque les payouts liés »).
      if (newStatus === 'disputed') {
        const itemIds = await tx.orderItem.findMany({
          where: { orderId: payment.order.id },
          select: { id: true },
        });
        await tx.payout.updateMany({
          where: {
            status: 'pending',
            items: { some: { orderItemId: { in: itemIds.map((i) => i.id) } } },
          },
          data: {
            status: 'blocked',
            blockedAt: new Date(),
            blockedReason: `Dispute payment ${payment.providerIntentId}`,
          },
        });
      }
    }
  });

  // Audit hors transaction (audit log = INSERT atomic, pas besoin d'être joint).
  if (newStatus === 'paid') {
    await logWebhookAudit({
      actorUserId: webhookActorUserId,
      action: 'payment.received',
      targetType: 'payment',
      targetId: payment.id,
      oldValue: { status: payment.status },
      newValue: {
        status: newStatus,
        providerIntentId: payment.providerIntentId,
        paymentMethod: payload.paymentMethod,
      },
      request: args.request,
    });
  } else if (newStatus === 'disputed') {
    await logWebhookAudit({
      actorUserId: webhookActorUserId,
      action: 'payment.disputed',
      targetType: 'payment',
      targetId: payment.id,
      oldValue: { status: payment.status },
      newValue: { status: newStatus, providerIntentId: payment.providerIntentId },
      request: args.request,
    });
  } else if (newStatus === 'refunded') {
    await logWebhookAudit({
      actorUserId: webhookActorUserId,
      action: 'payment.refunded',
      targetType: 'payment',
      targetId: payment.id,
      oldValue: { status: payment.status },
      newValue: { status: newStatus, providerIntentId: payment.providerIntentId },
      request: args.request,
    });
  }

  return { kind: 'updated', paymentId: payment.id, newStatus };
}

// ─────────────────────────────────────────────────────────────────
// Lectures

async function getByIdInternal(id: string) {
  const row = await prisma.payment.findUnique({
    where: { id },
    include: paymentInclude,
  });
  if (!row) throw new DomainError('NOT_FOUND', 'Paiement introuvable');
  return toPaymentOutput(row as PaymentLoaded);
}

async function getByOrderIdInternal(orderId: string) {
  const row = await prisma.payment.findUnique({
    where: { orderId },
    include: paymentInclude,
  });
  if (!row) return null;
  return toPaymentOutput(row as PaymentLoaded);
}

async function listAdminInternal(query: PaymentAdminListQuery) {
  const rows = await prisma.payment.findMany({
    where: {
      ...(query.status && { status: query.status }),
    },
    include: paymentInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((r) => toPaymentOutput(r as PaymentLoaded));
}

// ─────────────────────────────────────────────────────────────────
// Export

export const paymentService = {
  createCheckoutSession: createCheckoutSessionInternal,
  processWebhook: processWebhookInternal,
  getById: getByIdInternal,
  getByOrderId: getByOrderIdInternal,
  listAdmin: listAdminInternal,
};

export type { WebhookOutcome };
