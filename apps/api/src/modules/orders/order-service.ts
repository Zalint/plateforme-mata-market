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
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { notificationService } from '../notifications/index.js';
import { pricingSnapshotService } from '../pricing/index.js';
import { type OrderLoaded, orderInclude, toOrderOutput } from './mappers.js';
import { generateOrderNumber } from './order-numbering.js';

/**
 * Service orders · création transactionnelle, state machine guardée,
 * cycle 8 étapes + cancelled.
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

  // Audit `order.create` : seulement pour un client authentifié. Un invité n'a
  // pas de row `users` → FK actor impossible. On log un warn pour la traçabilité
  // (même politique que le webhook payment, cf. payment-service `logWebhookAudit`).
  if (clientUserId) {
    await auditService.log({
      actorUserId: clientUserId,
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
  } else {
    logger.warn(
      { event: 'order.create.guest_audit_skipped', orderId: created.id },
      'order.create.guest_audit_skipped',
    );
  }

  return toOrderOutput(created);
}

// ─────────────────────────────────────────────────────────────────
// Transitions

interface TransitionArgs {
  actorUserId: string;
  orderId: string;
  to: OrderStatus;
  request?: FastifyRequest;
}

async function transitionStatusInternal(args: TransitionArgs): Promise<OrderOutput> {
  const { actorUserId, orderId, to, request } = args;

  // Verrouille l'ordre pour éviter les courses de transition.
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
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

    const data: Prisma.OrderUpdateInput = { status: to };
    if (to === 'confirmed') data.confirmedAt = new Date();
    if (to === 'collected') data.collectedAt = new Date();
    if (to === 'stored') data.storedAt = new Date();
    if (to === 'delivered') data.deliveredAt = new Date();

    const result = await tx.order.update({
      where: { id: orderId },
      data,
      include: orderInclude,
    });

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
    }

    return { result, from: current.status };
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

  return toOrderOutput(cancelled.result as OrderLoaded);
}

// ─────────────────────────────────────────────────────────────────
// Lectures

async function getByIdInternal(orderId: string): Promise<OrderOutput> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!row) throw new DomainError('NOT_FOUND', 'Commande introuvable');
  return toOrderOutput(row as OrderLoaded);
}

async function listMineInternal(clientUserId: string): Promise<OrderOutput[]> {
  const rows = await prisma.order.findMany({
    where: { clientUserId },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => toOrderOutput(r as OrderLoaded));
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
// Service exporté

export const orderService = {
  create: createOrderInternal,
  transitionStatus: transitionStatusInternal,
  cancel: cancelOrderInternal,
  getById: getByIdInternal,
  listMine: listMineInternal,
  listReceived: listReceivedInternal,
  listAdmin: listAdminInternal,
};
