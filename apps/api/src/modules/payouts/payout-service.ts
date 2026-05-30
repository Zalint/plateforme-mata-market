import { DomainError } from '@mata/shared/errors';
import {
  BankDetailsClearSchema,
  BankDetailsEncryptedSchema,
  type PayoutAdminListQuery,
  type PayoutPendingResponse,
  type PayoutPendingSummary,
} from '@mata/shared/schemas';
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { requireBictorysConfig, triggerDisbursement } from '../../lib/bictorys.js';
import { decrypt } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { type PayoutLoaded, payoutInclude, toPayoutOutput } from './mappers.js';

/**
 * Service payouts · reversements producteurs via Bictorys disbursement.
 *
 * Référence : ARCHITECTURE.md §7 (« Reversements producteurs : disbursement
 * Bictorys via cron quotidien (6h UTC). Agrégation des order_items delivered
 * non reversés, création payouts, appel API disbursement. »),
 * CLAUDE.md §G4 (bank_details chiffré AES-256-GCM, jamais loggé),
 * mockup §2774 (boutons « Reverser (9) » et « Déclencher »).
 *
 * INVARIANTS CRITIQUES :
 *  1. Un order_item n'est JAMAIS reversé deux fois (UNIQUE order_item_id
 *     sur payout_items). Idempotence par construction du schéma.
 *  2. bank_details producteur déchiffré UNIQUEMENT en mémoire au moment
 *     du call Bictorys. Jamais loggé (pino redact bankDetails).
 *  3. Items éligibles : order.status='delivered' AND order.payment_status='paid'
 *     AND order_item PAS dans payout_items.
 *  4. Si bank_details manque → throw, refuse le payout (admin notifié via UI).
 *  5. Si dispute en cours sur un item → exclu (les payouts contenant un item
 *     d'un order disputed sont bloqués via paymentService.processWebhook).
 */

// ─────────────────────────────────────────────────────────────────
// Compute pending — agrégation par producteur

/**
 * Calcule les montants en attente de reversement, agrégés par producteur.
 *
 * Logique :
 *  1. Charge tous les order_items éligibles (delivered + paid + pas couvert)
 *  2. Agrège par producer_user_id : SUM(producer_share_fcfa × quantity)
 *  3. Joint le displayName pour affichage admin
 *
 * Pour Lot 5 on tourne en JS (findMany + reduce). Si la table grossit
 * fortement (10k+ items pending), passer à un raw SQL avec GROUP BY.
 */
async function computePendingInternal(): Promise<PayoutPendingResponse> {
  // Items éligibles : order delivered + paid + pas couvert par un payout existant.
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        status: 'delivered',
        paymentStatus: 'paid',
      },
      payoutItem: null, // 1:1 inverse — null si pas encore couvert
    },
    select: {
      id: true,
      quantity: true,
      producerUserId: true,
      producer: { select: { displayName: true } },
      pricingSnapshot: { select: { producerShareFcfa: true } },
    },
  });

  // Agrégation par producer_user_id.
  const byProducer = new Map<string, PayoutPendingSummary>();
  for (const item of items) {
    const amount = item.pricingSnapshot.producerShareFcfa * item.quantity;
    const existing = byProducer.get(item.producerUserId);
    if (existing) {
      existing.amountFcfa += amount;
      existing.orderItemIds.push(item.id);
    } else {
      byProducer.set(item.producerUserId, {
        producerUserId: item.producerUserId,
        producerDisplayName: item.producer.displayName,
        amountFcfa: amount,
        orderItemIds: [item.id],
      });
    }
  }

  const summaries = Array.from(byProducer.values()).sort((a, b) => b.amountFcfa - a.amountFcfa);
  const totalAmountFcfa = summaries.reduce((sum, s) => sum + s.amountFcfa, 0);

  return {
    totalAmountFcfa,
    producerCount: summaries.length,
    summaries,
  };
}

// ─────────────────────────────────────────────────────────────────
// Trigger payout pour un producteur

interface TriggerPayoutArgs {
  actorUserId: string;
  producerUserId: string;
  request?: FastifyRequest;
}

async function triggerPayoutInternal(args: TriggerPayoutArgs) {
  const { actorUserId, producerUserId, request } = args;

  // 1. Recompute le pending pour ce producteur. Race condition-safe : si un
  //    autre admin trigger en même temps, la contrainte UNIQUE order_item_id
  //    sur payout_items fera échouer la 2e tentative au commit.
  const all = await computePendingInternal();
  const summary = all.summaries.find((s) => s.producerUserId === producerUserId);
  if (!summary || summary.amountFcfa === 0) {
    throw new DomainError('CONFLICT', 'Aucun montant à reverser pour ce producteur');
  }

  // 2. Récupère bank_details (chiffré → en mémoire seulement).
  const producer = await prisma.producerProfile.findUnique({
    where: { userId: producerUserId },
    select: { bankDetails: true },
  });
  if (!producer) throw new DomainError('NOT_FOUND', 'Producteur introuvable');
  if (!producer.bankDetails) {
    throw new DomainError(
      'CONFLICT',
      'Coordonnées bancaires manquantes — invitez le producteur à les renseigner',
    );
  }

  // Déchiffrement en mémoire (jamais loggé — pino redact `bankDetails`).
  const encrypted = BankDetailsEncryptedSchema.parse(producer.bankDetails);
  const clearJson = decrypt(encrypted);
  const beneficiary = BankDetailsClearSchema.parse(JSON.parse(clearJson));

  // 3. S'assure Bictorys configuré.
  requireBictorysConfig();

  // 4. Pré-réserve un payoutId pour l'utiliser en idempotency-key côté Bictorys.
  const payoutId = crypto.randomUUID();
  const reference = `PAY-${new Date().getFullYear()}-${payoutId.slice(0, 8)}`;

  // 5. Appel Bictorys (sortant). Si fail → row payout avec status='failed' + audit.
  let providerDisbursementId: string;
  let providerStatus: string;
  try {
    const result = await triggerDisbursement({
      amountFcfa: summary.amountFcfa,
      currency: 'XOF',
      reference,
      idempotencyKey: payoutId,
      beneficiary: {
        holder: beneficiary.holder,
        iban: beneficiary.iban,
        bic: beneficiary.bic,
        bankName: beneficiary.bankName,
      },
    });
    providerDisbursementId = result.id;
    providerStatus = result.status;
  } catch (err) {
    // Persist le failure côté MATA pour traçabilité.
    const failureReason = err instanceof Error ? err.message : String(err);
    const failed = await prisma.payout.create({
      data: {
        id: payoutId,
        producerUserId,
        amountFcfa: summary.amountFcfa,
        currency: 'XOF',
        status: 'failed',
        failedAt: new Date(),
        failureReason,
      },
    });
    await auditService.log({
      actorUserId,
      action: 'payout.trigger',
      targetType: 'payout',
      targetId: failed.id,
      newValue: { producerUserId, amountFcfa: summary.amountFcfa, status: 'failed', failureReason },
      request,
    });
    throw new DomainError('EXTERNAL_FAILURE', `Disbursement Bictorys échoué : ${failureReason}`);
  }

  // 6. Crée la row payout + payout_items dans une transaction.
  //    L'UNIQUE order_item_id garantit qu'on ne double-paie pas si race condition.
  let created: PayoutLoaded;
  try {
    created = await prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: {
          id: payoutId,
          producerUserId,
          amountFcfa: summary.amountFcfa,
          currency: 'XOF',
          status: providerStatusToMata(providerStatus),
          providerDisbursementId,
          sentAt: providerStatusToMata(providerStatus) === 'sent' ? new Date() : null,
        },
      });
      // Insert payout_items (un par order_item couvert).
      // En cas de race, l'UNIQUE order_item_id fait throw P2002 → catch en dehors.
      await tx.payoutItem.createMany({
        data: await Promise.all(
          summary.orderItemIds.map(async (orderItemId) => {
            // Re-fetch amount par item (pour stocker en snapshot anti-drift).
            const item = await tx.orderItem.findUniqueOrThrow({
              where: { id: orderItemId },
              select: {
                quantity: true,
                pricingSnapshot: { select: { producerShareFcfa: true } },
              },
            });
            return {
              payoutId: payout.id,
              orderItemId,
              amountFcfa: item.pricingSnapshot.producerShareFcfa * item.quantity,
            };
          }),
        ),
      });
      return tx.payout.findUniqueOrThrow({
        where: { id: payout.id },
        include: payoutInclude,
      }) as Promise<PayoutLoaded>;
    });
  } catch (err) {
    // P2002 = race condition unique constraint (un autre admin a trigger entre-temps).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new DomainError(
        'CONFLICT',
        'Un reversement concurrent a déjà couvert ces items. Recharge la page.',
        { cause: err },
      );
    }
    throw err;
  }

  // 7. Audit (sans bank_details — pino redact + intentionnel).
  await auditService.log({
    actorUserId,
    action: 'payout.trigger',
    targetType: 'payout',
    targetId: created.id,
    newValue: {
      producerUserId,
      amountFcfa: summary.amountFcfa,
      coveredOrderItemCount: summary.orderItemIds.length,
      providerDisbursementId,
      status: created.status,
    },
    request,
  });

  logger.info(
    {
      payoutId: created.id,
      producerUserId,
      amountFcfa: summary.amountFcfa,
      itemCount: summary.orderItemIds.length,
    },
    'payout.created',
  );

  return toPayoutOutput(created);
}

/**
 * Mappe le statut Bictorys disbursement vers PayoutStatus MATA.
 * Conventions PSP courantes : 'sent', 'success', 'completed' → sent ;
 * 'pending', 'processing' → pending ; 'failed', 'error' → failed.
 */
function providerStatusToMata(rawStatus: string): 'pending' | 'sent' | 'failed' {
  const s = rawStatus.toLowerCase().trim();
  if (['sent', 'success', 'completed', 'paid', 'succeeded'].includes(s)) return 'sent';
  if (['failed', 'error', 'rejected'].includes(s)) return 'failed';
  return 'pending';
}

// ─────────────────────────────────────────────────────────────────
// Trigger all pending — pour le cron quotidien

interface TriggerAllPendingArgs {
  actorUserId: string;
}

/**
 * Itère sur tous les producteurs avec montant pending et trigger un payout
 * pour chacun. Échec d'un producteur n'arrête PAS la boucle (log + continue).
 *
 * Idempotent par construction : si le cron est ré-exécuté avant le précédent,
 * les payout_items déjà créés excluent leurs order_items du compute pending.
 */
async function triggerAllPendingInternal(
  args: TriggerAllPendingArgs,
): Promise<{ triggered: number; failed: number }> {
  const all = await computePendingInternal();
  let triggered = 0;
  let failed = 0;

  for (const summary of all.summaries) {
    try {
      await triggerPayoutInternal({
        actorUserId: args.actorUserId,
        producerUserId: summary.producerUserId,
      });
      triggered++;
    } catch (err) {
      failed++;
      logger.error(
        {
          producerUserId: summary.producerUserId,
          amountFcfa: summary.amountFcfa,
          err: err instanceof Error ? err.message : String(err),
        },
        'payout.trigger.failed',
      );
    }
  }

  logger.info({ triggered, failed, total: all.summaries.length }, 'payout.cron.summary');
  return { triggered, failed };
}

// ─────────────────────────────────────────────────────────────────
// Lectures admin

async function listAdminInternal(query: PayoutAdminListQuery) {
  const rows = await prisma.payout.findMany({
    where: {
      ...(query.status && { status: query.status }),
      ...(query.producerUserId && { producerUserId: query.producerUserId }),
    },
    include: payoutInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((r) => toPayoutOutput(r as PayoutLoaded));
}

// ─────────────────────────────────────────────────────────────────
// Block / unblock (cas dispute manuel)

interface BlockPayoutArgs {
  actorUserId: string;
  payoutId: string;
  reason: string;
  request?: FastifyRequest;
}

async function blockPayoutInternal(args: BlockPayoutArgs) {
  const current = await prisma.payout.findUnique({
    where: { id: args.payoutId },
    select: { id: true, status: true },
  });
  if (!current) throw new DomainError('NOT_FOUND', 'Payout introuvable');
  if (current.status !== 'pending') {
    throw new DomainError('CONFLICT', `Impossible de bloquer un payout déjà ${current.status}`);
  }

  await prisma.payout.update({
    where: { id: args.payoutId },
    data: {
      status: 'blocked',
      blockedAt: new Date(),
      blockedReason: args.reason,
    },
  });

  await auditService.log({
    actorUserId: args.actorUserId,
    action: 'payout.block',
    targetType: 'payout',
    targetId: args.payoutId,
    newValue: { reason: args.reason },
    request: args.request,
  });
}

// ─────────────────────────────────────────────────────────────────
// Export

export const payoutService = {
  computePending: computePendingInternal,
  triggerPayout: triggerPayoutInternal,
  triggerAllPending: triggerAllPendingInternal,
  listAdmin: listAdminInternal,
  blockPayout: blockPayoutInternal,
};
