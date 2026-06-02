import {
  isValidOrderTransition,
  type OrderStatus,
  type PaymentMethod,
} from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type {
  OrderAdminListQuery,
  OrderCancelInput,
  OrderCreate,
  OrderOutput,
} from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { notificationService } from '../notifications/index.js';
import { pricingSnapshotService } from '../pricing/index.js';
import { type OrderLoaded, orderInclude, toOrderOutput } from './mappers.js';
import { generateOrderNumber } from './order-numbering.js';

/**
 * Service orders · création transactionnelle, state machine guardée,
 * cycle 4 étapes (created → confirmed → delivering → delivered) + cancelled.
 *
 * Garanties :
 *  - Création atomique : génération num + réservation stock + snapshots
 *    + insert order_items dans la MÊME transaction Prisma. Tout rollback
 *    si une étape échoue (ex: stock insuffisant en concurrence).
 *  - State machine : toute transition passe par `ORDER_TRANSITIONS` (cf.
 *    @mata/shared/constants). Refuse 409 sinon.
 *  - Cancel : libère le stock dans la même transaction (offers.quantityReserved -=
 *    item.quantity), repasse l'offer.status de `reserved` à `validated` si
 *    le stock redevient disponible.
 *  - Audit : `order.create`, `order.status_change`, `order.cancel` écrits
 *    systématiquement via `auditService` (cf. CLAUDE.md §G3).
 *
 * Référence : CLAUDE.md §G3 (audit) + §G4 (transactions Prisma pour stock).
 */

// ─────────────────────────────────────────────────────────────────
// Création

export interface CreateOrderArgs {
  /**
   * `null` = commande invité (Lot 8, guest checkout). Dans ce cas `guest` est
   * obligatoire et l'audit `order.create` est skippé (pas de row `users` →
   * FK actor impossible, même politique que le webhook payment).
   */
  clientUserId: string | null;
  input: OrderCreate;
  /** Identité de contact invité — requise ssi `clientUserId` est null. */
  guest?: { fullName: string; phoneNumber: string };
  /** Moyen de paiement choisi. Défaut `online` (flux Bictorys du Lot 5). */
  paymentMethod?: PaymentMethod;
  request?: FastifyRequest;
}

async function createOrderInternal(args: CreateOrderArgs): Promise<OrderOutput> {
  const { clientUserId, input, guest, paymentMethod = 'online', request } = args;

  // Invariant Lot 8 : une commande invité DOIT porter une identité de contact ;
  // une commande authentifiée NE DOIT PAS en porter (l'identité vient du compte).
  if (clientUserId === null && !guest) {
    throw new DomainError('VALIDATION', 'Commande invité : identité de contact requise');
  }

  // Vérifie en amont (hors transaction) que la zone existe — erreur 404
  // plus lisible qu'une violation FK SQL.
  const zone = await prisma.zone.findUnique({
    where: { id: input.delivery.zoneId },
    select: { id: true, active: true },
  });
  if (!zone || !zone.active)
    throw new DomainError('NOT_FOUND', 'Zone livraison introuvable ou inactive');

  // Transaction : verrouille les offres, vérifie stock, crée snapshots,
  // décrément stock, génère num, crée order + items.
  const created = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(tx);

    // Pour chaque item : charge l'offre, vérifie status validated, vérifie stock,
    // crée le snapshot pricing, prépare les payloads order_items.
    type ItemPrepared = {
      offerId: string;
      producerUserId: string;
      quantity: number;
      unitPriceAtOrder: number;
      pricingSnapshotId: string;
      lineFcfa: number;
    };
    const prepared: ItemPrepared[] = [];

    for (const item of input.items) {
      const offer = await tx.offer.findUnique({
        where: { id: item.offerId },
        select: {
          id: true,
          producerUserId: true,
          status: true,
          quantity: true,
          quantityReserved: true,
          priceFcfa: true,
          category: true,
          availableUntil: true,
        },
      });
      if (!offer) {
        throw new DomainError('NOT_FOUND', `Offre ${item.offerId} introuvable`);
      }
      if (offer.status !== 'validated' && offer.status !== 'reserved') {
        throw new DomainError(
          'CONFLICT',
          `Offre ${item.offerId} indisponible (statut ${offer.status})`,
        );
      }
      // Date limite passée : on refuse même si le cron d'expiration n'a pas
      // encore basculé le statut (fenêtre entre l'expiration et le cron).
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      if (offer.availableUntil && offer.availableUntil < startOfToday) {
        throw new DomainError('CONFLICT', `Offre ${item.offerId} expirée (date limite dépassée)`);
      }
      const available = offer.quantity - offer.quantityReserved;
      if (item.quantity > available) {
        throw new DomainError('CONFLICT', `Stock insuffisant sur l'offre ${item.offerId}`, {
          details: { requested: item.quantity, available },
        });
      }

      // Snapshot Lot 3 — fige les 7 composantes.
      const snapshot = await pricingSnapshotService.createForOrderItem({
        offerId: offer.id,
        quantity: item.quantity,
        tx,
      });

      prepared.push({
        offerId: offer.id,
        producerUserId: offer.producerUserId,
        quantity: item.quantity,
        unitPriceAtOrder: offer.priceFcfa,
        pricingSnapshotId: snapshot.id,
        lineFcfa: snapshot.finalPriceFcfa * item.quantity,
      });

      // Réserve le stock + transition offer.status si épuisé.
      const newReserved = offer.quantityReserved + item.quantity;
      const newStatus = newReserved === offer.quantity ? 'reserved' : offer.status;
      await tx.offer.update({
        where: { id: offer.id },
        data: { quantityReserved: newReserved, status: newStatus },
      });
    }

    const totalFcfa = prepared.reduce((sum, p) => sum + p.lineFcfa, 0);

    const order = await tx.order.create({
      data: {
        orderNumber,
        clientUserId,
        // Lot 8 : identité de contact invité (null pour un client authentifié).
        guestFullName: guest?.fullName ?? null,
        guestPhoneNumber: guest?.phoneNumber ?? null,
        paymentMethod,
        status: 'created',
        deliveryZoneId: input.delivery.zoneId,
        deliveryAddressLine: input.delivery.addressLine,
        deliverySlotDate: new Date(input.delivery.slotDate),
        deliverySlotPeriod: input.delivery.slotPeriod,
        totalFcfa,
        items: {
          create: prepared.map((p) => ({
            offerId: p.offerId,
            producerUserId: p.producerUserId,
            quantity: p.quantity,
            unitPriceAtOrder: p.unitPriceAtOrder,
            pricingSnapshotId: p.pricingSnapshotId,
          })),
        },
      },
      include: orderInclude,
    });

    // Outbox : order.created (dispatch async vers n8n par le cron Lot 7).
    await tx.outboxEvent.create({
      data: {
        eventType: 'order.created',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          clientUserId,
          totalFcfa: order.totalFcfa,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return order as OrderLoaded;
  });

  // Audit `order.create` écrit systématiquement (Lot 9). Pour un invité,
  // `actorUserId` est null (pas de row `users`) et l'identité de contact est
  // tracée via `guestPhoneNumber` — colonne nullable ajoutée Lot 9.
  await auditService.log({
    actorUserId: clientUserId,
    guestPhoneNumber: clientUserId ? null : (guest?.phoneNumber ?? null),
    action: 'order.create',
    targetType: 'order',
    targetId: created.id,
    newValue: {
      orderNumber: created.orderNumber,
      totalFcfa: created.totalFcfa,
      itemsCount: created.items.length,
    },
    request,
  });

  // Masque le producteur : le créateur (client/invité) n'a pas à le voir.
  return toOrderOutput(created, false);
}

// ─────────────────────────────────────────────────────────────────
// Transitions

interface TransitionArgs {
  actorUserId: string;
  orderId: string;
  to: OrderStatus;
  /** Vrai si l'acteur est admin (peut confirmer sans être l'assigné). */
  isAdmin?: boolean;
  request?: FastifyRequest;
}

async function transitionStatusInternal(args: TransitionArgs): Promise<OrderOutput> {
  const { actorUserId, orderId, to, isAdmin = false, request } = args;

  // Verrouille l'ordre pour éviter les courses de transition.
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        assignedTeleconsultantUserId: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });
    if (!current) throw new DomainError('NOT_FOUND', 'Commande introuvable');
    if (!isValidOrderTransition(current.status, to)) {
      throw new DomainError('CONFLICT', `Transition impossible : ${current.status} → ${to}`, {
        details: { from: current.status, to },
      });
    }

    // Cancel a sa propre méthode dédiée — refus si appelé via transition générique.
    if (to === 'cancelled') {
      throw new DomainError(
        'VALIDATION',
        'Annulation : utiliser POST /v1/orders/:id/cancel (raison obligatoire)',
      );
    }

    // Pivot : on ne confirme pas une commande qu'un AUTRE téléconseiller a prise.
    // Libre / à soi / admin → OK (le téléconseiller « Prend » puis confirme).
    if (
      to === 'confirmed' &&
      !isAdmin &&
      current.assignedTeleconsultantUserId &&
      current.assignedTeleconsultantUserId !== actorUserId
    ) {
      throw new DomainError(
        'FORBIDDEN',
        'Commande assignée à un autre téléconseiller — il doit la confirmer (ou la relâcher)',
      );
    }

    // Garde-fou paiement (pivot, option a) : on ne part en livraison qu'une fois
    // payée pour le paiement EN LIGNE ; le paiement à la livraison (cash) passe.
    if (
      to === 'delivering' &&
      current.paymentMethod === 'online' &&
      current.paymentStatus !== 'paid'
    ) {
      throw new DomainError(
        'CONFLICT',
        'Commande non payée : le paiement en ligne doit être réglé avant la livraison',
      );
    }

    const data: Prisma.OrderUpdateManyMutationInput = { status: to };
    if (to === 'confirmed') data.confirmedAt = new Date();
    if (to === 'delivered') data.deliveredAt = new Date();

    // Compare-and-swap : on conditionne l'update au statut LU (current.status).
    // Si une transition concurrente a déjà changé le statut entre le findUnique
    // et ici, `count` vaut 0 → on échoue déterministe (pas d'écrasement silencieux).
    const swapped = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data,
    });
    if (swapped.count === 0) {
      throw new DomainError(
        'CONFLICT',
        `Transition concurrente détectée depuis ${current.status}`,
        {
          details: { from: current.status, to },
        },
      );
    }
    const result = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });

    // Offres entièrement écoulées → `sold` (Lot 4). Accumulées ici, auditées
    // après le commit (une entrée audit par offre vendue).
    const soldOfferIds: string[] = [];

    // Outbox : order.delivered (notif client « commande livrée », dispatch n8n).
    if (to === 'delivered') {
      await tx.outboxEvent.create({
        data: {
          eventType: 'order.delivered',
          payload: {
            orderId: result.id,
            orderNumber: result.orderNumber,
            clientUserId: result.clientUserId,
          } satisfies Prisma.InputJsonValue,
        },
      });

      // Une offre `reserved` (stock 100% réservé) dont TOUTES les commandes la
      // référençant sont livrées ne peut plus libérer de stock : une commande
      // livrée est terminale, non annulable. → vente définitive : reserved →
      // sold, retrait du catalogue (pas de retour `validated`). La commande
      // courante vient de passer `delivered` ci-dessus, donc déjà comptée.
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { offerId: true },
      });
      for (const offerId of [...new Set(items.map((i) => i.offerId))]) {
        const offer = await tx.offer.findUnique({
          where: { id: offerId },
          select: { status: true },
        });
        if (offer?.status !== 'reserved') continue;
        const liveItems = await tx.orderItem.count({
          where: { offerId, order: { status: { notIn: ['delivered', 'cancelled'] } } },
        });
        if (liveItems === 0) {
          await tx.offer.update({ where: { id: offerId }, data: { status: 'sold' } });
          soldOfferIds.push(offerId);
        }
      }
    }

    return { result, from: current.status, soldOfferIds };
  });

  await auditService.log({
    actorUserId,
    action: 'order.status_change',
    targetType: 'order',
    targetId: orderId,
    oldValue: { status: updated.from },
    newValue: { status: to },
    request,
  });

  // Audit `offer.sold` pour chaque offre écoulée par cette livraison (§G3/§G4).
  for (const offerId of updated.soldOfferIds) {
    await auditService.log({
      actorUserId,
      action: 'offer.sold',
      targetType: 'offer',
      targetId: offerId,
      oldValue: { status: 'reserved' },
      newValue: { status: 'sold', trigger: 'order.delivered', orderId },
      request,
    });
  }

  // Push web (Lot 7, hors chemin critique) : prévient le client à la livraison.
  // `sendToUser` ne throw jamais (§G5) → await sûr après le commit. Mode invité :
  // clientUserId null → pas de push (l'invité n'a pas de souscription liée).
  if (to === 'delivered' && updated.result.clientUserId) {
    await notificationService.sendToUser(updated.result.clientUserId, {
      title: 'Commande livrée',
      body: `Votre commande ${updated.result.orderNumber} a été livrée.`,
      url: '/orders',
      category: 'order',
    });
  }

  return toOrderOutput(updated.result as OrderLoaded);
}

// ─────────────────────────────────────────────────────────────────
// Cancel

interface CancelArgs {
  actorUserId: string;
  orderId: string;
  input: OrderCancelInput;
  /** Masque l'identité producteur dans la réponse pour le client (défaut: visible). */
  showProducer?: boolean;
  request?: FastifyRequest;
}

async function cancelOrderInternal(args: CancelArgs): Promise<OrderOutput> {
  const { actorUserId, orderId, input, request } = args;

  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { offerId: true, quantity: true } } },
    });
    if (!current) throw new DomainError('NOT_FOUND', 'Commande introuvable');
    if (!isValidOrderTransition(current.status, 'cancelled')) {
      throw new DomainError('CONFLICT', `Annulation impossible depuis status=${current.status}`);
    }

    // Libère le stock + remet offer.status à validated si applicable.
    for (const item of current.items) {
      const offer = await tx.offer.findUnique({
        where: { id: item.offerId },
        select: { quantityReserved: true, quantity: true, status: true },
      });
      if (!offer) continue;
      const newReserved = Math.max(0, offer.quantityReserved - item.quantity);
      const newStatus =
        offer.status === 'reserved' && newReserved < offer.quantity ? 'validated' : offer.status;
      await tx.offer.update({
        where: { id: item.offerId },
        data: { quantityReserved: newReserved, status: newStatus },
      });
    }

    const result = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: input.reason,
      },
      include: orderInclude,
    });

    return { result, from: current.status };
  });

  await auditService.log({
    actorUserId,
    action: 'order.cancel',
    targetType: 'order',
    targetId: orderId,
    oldValue: { status: cancelled.from },
    newValue: { status: 'cancelled', reason: input.reason },
    request,
  });

  return toOrderOutput(cancelled.result as OrderLoaded, args.showProducer ?? true);
}

// ─────────────────────────────────────────────────────────────────
// Lectures

async function getByIdInternal(orderId: string, showProducer = true): Promise<OrderOutput> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!row) throw new DomainError('NOT_FOUND', 'Commande introuvable');
  return toOrderOutput(row as OrderLoaded, showProducer);
}

async function listMineInternal(clientUserId: string): Promise<OrderOutput[]> {
  const rows = await prisma.order.findMany({
    where: { clientUserId },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });
  // Vue client : identité producteur masquée.
  return rows.map((r) => toOrderOutput(r as OrderLoaded, false));
}

async function listReceivedInternal(producerUserId: string): Promise<OrderOutput[]> {
  // Une commande est "reçue" par un producteur si elle contient au moins
  // un order_item où producer_user_id = X. On charge les orders distincts
  // via les items.
  const rows = await prisma.order.findMany({
    where: { items: { some: { producerUserId } } },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => toOrderOutput(r as OrderLoaded));
}

async function listAdminInternal(query: OrderAdminListQuery): Promise<OrderOutput[]> {
  const where: Prisma.OrderWhereInput = {
    ...(query.status && { status: query.status }),
  };
  const rows = await prisma.order.findMany({
    where,
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 200, // borne MVP, pagination Lot 9
  });
  return rows.map((r) => toOrderOutput(r as OrderLoaded));
}

// ─────────────────────────────────────────────────────────────────
// Transition pilotée par un autre module DANS sa transaction (couplage tournée).
//
// Le module pickups appelle ceci (via l'interface publique, §G3) pour faire
// suivre le statut commande à la tournée, SANS casser l'atomicité (§G4) : on
// reçoit le `tx` de l'appelant. Périmètre volontairement restreint aux
// transitions de collecte (collecting / collected / confirmed-revert) ; l'outbox
// `order.delivered` et les push restent dans `transitionStatus` (chemin admin).
// L'audit est écrit par l'appelant APRÈS commit (même pattern que les services).
async function transitionWithinTxInternal(
  tx: Prisma.TransactionClient,
  args: { orderId: string; to: OrderStatus },
): Promise<{ orderId: string; from: OrderStatus; to: OrderStatus }> {
  const current = await tx.order.findUnique({
    where: { id: args.orderId },
    select: { id: true, status: true },
  });
  if (!current) throw new DomainError('NOT_FOUND', 'Commande introuvable');
  if (!isValidOrderTransition(current.status, args.to)) {
    throw new DomainError('CONFLICT', `Transition impossible : ${current.status} → ${args.to}`, {
      details: { from: current.status, to: args.to },
    });
  }
  const data: Prisma.OrderUpdateInput = { status: args.to };
  if (args.to === 'collected') data.collectedAt = new Date();
  await tx.order.update({ where: { id: args.orderId }, data });
  return { orderId: args.orderId, from: current.status, to: args.to };
}

// ─────────────────────────────────────────────────────────────────
// Self-assignation (Lot B) : un téléconseiller « prend » une commande libre.

async function claimOrderInternal(args: {
  actorUserId: string;
  orderId: string;
  request?: FastifyRequest;
}): Promise<OrderOutput> {
  const { actorUserId, orderId, request } = args;
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, assignedTeleconsultantUserId: true },
    });
    if (!current) throw new DomainError('NOT_FOUND', 'Commande introuvable');
    if (
      current.assignedTeleconsultantUserId &&
      current.assignedTeleconsultantUserId !== actorUserId
    ) {
      throw new DomainError('CONFLICT', 'Commande déjà prise par un autre téléconseiller');
    }
    // Compare-and-swap : assigne seulement si encore libre (ou déjà à soi) →
    // évite qu'une prise concurrente écrase l'autre.
    const swapped = await tx.order.updateMany({
      where: {
        id: orderId,
        OR: [{ assignedTeleconsultantUserId: null }, { assignedTeleconsultantUserId: actorUserId }],
      },
      data: { assignedTeleconsultantUserId: actorUserId, assignedAt: new Date() },
    });
    if (swapped.count === 0) throw new DomainError('CONFLICT', 'Commande déjà prise');
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });
  await auditService.log({
    actorUserId,
    action: 'order.assign',
    targetType: 'order',
    targetId: orderId,
    newValue: { assignedTeleconsultantUserId: actorUserId },
    request,
  });
  return toOrderOutput(updated as OrderLoaded);
}

async function releaseOrderInternal(args: {
  actorUserId: string;
  isAdmin: boolean;
  orderId: string;
  request?: FastifyRequest;
}): Promise<OrderOutput> {
  const { actorUserId, isAdmin, orderId, request } = args;
  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, assignedTeleconsultantUserId: true },
  });
  if (!current) throw new DomainError('NOT_FOUND', 'Commande introuvable');
  if (!current.assignedTeleconsultantUserId) {
    throw new DomainError('CONFLICT', 'Commande non assignée');
  }
  if (!isAdmin && current.assignedTeleconsultantUserId !== actorUserId) {
    throw new DomainError(
      'FORBIDDEN',
      'Seul le téléconseiller assigné (ou un admin) peut relâcher cette commande',
    );
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { assignedTeleconsultantUserId: null, assignedAt: null },
    include: orderInclude,
  });
  await auditService.log({
    actorUserId,
    action: 'order.unassign',
    targetType: 'order',
    targetId: orderId,
    oldValue: { assignedTeleconsultantUserId: current.assignedTeleconsultantUserId },
    request,
  });
  return toOrderOutput(updated as OrderLoaded);
}

// ─────────────────────────────────────────────────────────────────
// Ajustement de prix (Lot D) : le téléconseiller fixe un nouveau total après
// que le producteur a annoncé un prix différent. Snapshots IMMUABLES préservés.

async function adjustPriceInternal(args: {
  actorUserId: string;
  orderId: string;
  input: { newTotalFcfa: number; reason: string };
  request?: FastifyRequest;
}): Promise<OrderOutput> {
  const { actorUserId, orderId, input, request } = args;
  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      totalFcfa: true,
      adjustedTotalFcfa: true,
    },
  });
  if (!current) throw new DomainError('NOT_FOUND', 'Commande introuvable');
  // Ajustable seulement avant la livraison et avant paiement (le client doit
  // re-confirmer le nouveau prix, puis payer).
  if (current.status !== 'created' && current.status !== 'confirmed') {
    throw new DomainError(
      'CONFLICT',
      `Ajustement impossible au statut ${current.status} (avant livraison uniquement)`,
    );
  }
  if (current.paymentStatus === 'paid') {
    throw new DomainError('CONFLICT', 'Commande déjà payée : ajustement impossible');
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      adjustedTotalFcfa: input.newTotalFcfa,
      priceAdjustmentReason: input.reason,
      priceAdjustedAt: new Date(),
    },
    include: orderInclude,
  });
  await auditService.log({
    actorUserId,
    action: 'order.price_adjust',
    targetType: 'order',
    targetId: orderId,
    oldValue: { effectiveTotalFcfa: current.adjustedTotalFcfa ?? current.totalFcfa },
    newValue: { adjustedTotalFcfa: input.newTotalFcfa, reason: input.reason },
    request,
  });
  return toOrderOutput(updated as OrderLoaded);
}

// ─────────────────────────────────────────────────────────────────
// Service exporté

export const orderService = {
  create: createOrderInternal,
  transitionStatus: transitionStatusInternal,
  transitionWithinTx: transitionWithinTxInternal,
  cancel: cancelOrderInternal,
  claim: claimOrderInternal,
  release: releaseOrderInternal,
  adjustPrice: adjustPriceInternal,
  getById: getByIdInternal,
  listMine: listMineInternal,
  listReceived: listReceivedInternal,
  listAdmin: listAdminInternal,
};
