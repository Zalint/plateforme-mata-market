import { isValidPickupTransition, type PickupStatus } from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type { PickupAdminListQuery, PickupCreate, PickupOutput } from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { notificationService } from '../notifications/index.js';
import { type PickupLoaded, pickupInclude, toPickupOutput } from './mappers.js';
import { generatePickupNumber } from './pickup-numbering.js';

// Pivot 4 états : les tournées sont DÉCOUPLÉES du statut commande. Une tournée
// ne transitionne plus l'order (collecting / collected / revert) ; elle reste un
// outil de planification logistique interne. Cf. ORDER_TRANSITIONS.

// Producteurs distincts concernés par les items d'une tournée.
function distinctProducerIds(pickup: PickupLoaded): string[] {
  return [...new Set(pickup.items.map((i) => i.orderItem.producerUserId))];
}

/**
 * Service pickups · tournées de collecte chez les producteurs (Lot 7).
 *
 * Garanties :
 *  - Création atomique : génération num + insert pickup + pickup_items dans
 *    la MÊME transaction Prisma. L'UNIQUE order_item_id sur pickup_items
 *    garantit qu'un item n'est rattaché qu'à une tournée à la fois.
 *  - Items éligibles : order.status='confirmed' (notifié + stock réservé)
 *    ET pas déjà rattaché à une tournée (pickupItem null).
 *  - State machine : toute transition passe par `PICKUP_TRANSITIONS`. 409 sinon.
 *  - Cancel : libère les items (delete pickup_items) pour ré-affectation,
 *    conserve la row pickup en `cancelled` pour l'historique/audit.
 *  - Outbox : `pickup.scheduled` à la création, `pickup.confirmed` au passage
 *    en `collecting` (CLAUDE.md §G3, dispatch async vers n8n par le cron Lot 7).
 *  - Audit : pickup.create / status_change / cancel / item_check.
 *
 * Référence : CLAUDE.md §G3 (audit + outbox), mockup §admin/pickup.
 */

// ─────────────────────────────────────────────────────────────────
// Création

interface CreatePickupArgs {
  actorUserId: string;
  input: PickupCreate;
  request?: FastifyRequest;
}

async function createPickupInternal(args: CreatePickupArgs): Promise<PickupOutput> {
  const { actorUserId, input, request } = args;

  // Vérifie en amont (hors transaction) que la zone existe — 404 plus lisible.
  const zone = await prisma.zone.findUnique({
    where: { id: input.zoneId },
    select: { id: true, active: true },
  });
  if (!zone || !zone.active) {
    throw new DomainError('NOT_FOUND', 'Zone de collecte introuvable ou inactive');
  }

  const txResult = await prisma.$transaction(async (tx) => {
    // Valide chaque order_item : existe, commande confirmée, pas déjà collecté.
    for (const orderItemId of input.orderItemIds) {
      const item = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        select: {
          id: true,
          orderId: true,
          order: { select: { status: true } },
          pickupItem: { select: { id: true } },
        },
      });
      if (!item) {
        throw new DomainError('NOT_FOUND', `Item ${orderItemId} introuvable`);
      }
      // « Déjà rattaché » vérifié AVANT le statut : message plus précis.
      if (item.pickupItem) {
        throw new DomainError('CONFLICT', `Item ${orderItemId} déjà rattaché à une tournée`);
      }
      if (item.order.status !== 'confirmed') {
        throw new DomainError(
          'CONFLICT',
          `Item ${orderItemId} non collectable (commande ${item.order.status}, attendu confirmed)`,
        );
      }
    }

    const pickupNumber = await generatePickupNumber(tx);

    const pickup = await tx.pickup.create({
      data: {
        pickupNumber,
        zoneId: input.zoneId,
        scheduledFor: new Date(input.scheduledFor),
        scheduledPeriod: input.scheduledPeriod,
        vehicleType: input.vehicleType ?? null,
        driverDisplayName: input.driverDisplayName ?? null,
        status: 'scheduled',
        items: {
          create: input.orderItemIds.map((orderItemId) => ({ orderItemId })),
        },
      },
      include: pickupInclude,
    });

    // Outbox : pickup.scheduled (dispatch async vers n8n par le cron Lot 7).
    await tx.outboxEvent.create({
      data: {
        eventType: 'pickup.scheduled',
        payload: {
          pickupId: pickup.id,
          pickupNumber: pickup.pickupNumber,
          zoneId: pickup.zoneId,
          scheduledFor: pickup.scheduledFor.toISOString(),
          scheduledPeriod: pickup.scheduledPeriod,
          orderItemIds: input.orderItemIds,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { pickup: pickup as PickupLoaded };
  });

  const created = txResult.pickup;

  await auditService.log({
    actorUserId,
    action: 'pickup.create',
    targetType: 'pickup',
    targetId: created.id,
    newValue: {
      pickupNumber: created.pickupNumber,
      zoneId: created.zoneId,
      itemCount: created.items.length,
    },
    request,
  });
  logger.info(
    { pickupId: created.id, pickupNumber: created.pickupNumber, itemCount: created.items.length },
    'pickup.created',
  );

  // Push web (Lot 7) HORS chemin critique : prévient chaque producteur concerné.
  // `sendToUser` ne throw jamais (§G5) → await sûr après le commit de la transaction.
  await Promise.all(
    distinctProducerIds(created).map((id) =>
      notificationService.sendToUser(id, {
        title: 'Tournée de collecte planifiée',
        body: `Une collecte est prévue dans la zone ${created.zone.name} (${created.pickupNumber}).`,
        url: '/producer/pickups',
        category: 'pickup',
      }),
    ),
  );

  return toPickupOutput(created);
}

// ─────────────────────────────────────────────────────────────────
// Transition de statut

interface TransitionArgs {
  actorUserId: string;
  pickupId: string;
  to: PickupStatus;
  request?: FastifyRequest;
}

async function transitionStatusInternal(args: TransitionArgs): Promise<PickupOutput> {
  const { actorUserId, pickupId, to, request } = args;

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.pickup.findUnique({
      where: { id: pickupId },
      select: { id: true, status: true },
    });
    if (!current) throw new DomainError('NOT_FOUND', 'Tournée introuvable');

    // Cancel a sa propre route dédiée (raison obligatoire + release items).
    if (to === 'cancelled') {
      throw new DomainError(
        'VALIDATION',
        'Annulation : utiliser POST /v1/pickups/:id/cancel (raison obligatoire)',
      );
    }
    if (!isValidPickupTransition(current.status, to)) {
      throw new DomainError('CONFLICT', `Transition impossible : ${current.status} → ${to}`, {
        details: { from: current.status, to },
      });
    }

    const data: Prisma.PickupUpdateInput = { status: to };
    if (to === 'collected') data.completedAt = new Date();

    const result = await tx.pickup.update({
      where: { id: pickupId },
      data,
      include: pickupInclude,
    });

    // Outbox : pickup.confirmed au démarrage effectif de la tournée.
    if (to === 'collecting') {
      await tx.outboxEvent.create({
        data: {
          eventType: 'pickup.confirmed',
          payload: {
            pickupId: result.id,
            pickupNumber: result.pickupNumber,
            zoneId: result.zoneId,
            orderItemIds: result.items.map((i) => i.orderItemId),
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    return { result: result as PickupLoaded, from: current.status };
  });

  await auditService.log({
    actorUserId,
    action: 'pickup.status_change',
    targetType: 'pickup',
    targetId: pickupId,
    oldValue: { status: updated.from },
    newValue: { status: to },
    request,
  });
  // Push web (Lot 7, hors chemin critique) au démarrage effectif de la collecte.
  if (to === 'collecting') {
    await Promise.all(
      distinctProducerIds(updated.result).map((id) =>
        notificationService.sendToUser(id, {
          title: 'Tournée de collecte en cours',
          body: `Le collecteur est en route (${updated.result.pickupNumber}).`,
          url: '/producer/pickups',
          category: 'pickup',
        }),
      ),
    );
  }

  return toPickupOutput(updated.result);
}

// ─────────────────────────────────────────────────────────────────
// Cancel

interface CancelArgs {
  actorUserId: string;
  pickupId: string;
  reason: string;
  request?: FastifyRequest;
}

async function cancelPickupInternal(args: CancelArgs): Promise<PickupOutput> {
  const { actorUserId, pickupId, reason, request } = args;

  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await tx.pickup.findUnique({
      where: { id: pickupId },
      select: { id: true, status: true },
    });
    if (!current) throw new DomainError('NOT_FOUND', 'Tournée introuvable');
    if (!isValidPickupTransition(current.status, 'cancelled')) {
      throw new DomainError('CONFLICT', `Annulation impossible depuis status=${current.status}`);
    }

    // Libère les items : delete pickup_items (l'UNIQUE order_item_id se libère,
    // les items redeviennent affectables à une nouvelle tournée).
    await tx.pickupItem.deleteMany({ where: { pickupId } });

    const result = await tx.pickup.update({
      where: { id: pickupId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
      include: pickupInclude,
    });

    return { result: result as PickupLoaded, from: current.status };
  });

  await auditService.log({
    actorUserId,
    action: 'pickup.cancel',
    targetType: 'pickup',
    targetId: pickupId,
    oldValue: { status: cancelled.from },
    newValue: { status: 'cancelled', reason },
    request,
  });
  return toPickupOutput(cancelled.result);
}

// ─────────────────────────────────────────────────────────────────
// Cochage d'un item pendant la collecte

interface CheckItemArgs {
  actorUserId: string;
  pickupId: string;
  itemId: string;
  collected: boolean;
  notes?: string;
  request?: FastifyRequest;
}

async function checkItemInternal(args: CheckItemArgs): Promise<PickupOutput> {
  const { actorUserId, pickupId, itemId, collected, notes, request } = args;

  const updated = await prisma.$transaction(async (tx) => {
    const pickup = await tx.pickup.findUnique({
      where: { id: pickupId },
      select: { id: true, status: true },
    });
    if (!pickup) throw new DomainError('NOT_FOUND', 'Tournée introuvable');
    if (pickup.status !== 'collecting') {
      throw new DomainError(
        'CONFLICT',
        'Cochage possible uniquement quand la tournée est en cours (collecting)',
      );
    }

    const item = await tx.pickupItem.findUnique({
      where: { id: itemId },
      select: { id: true, pickupId: true },
    });
    if (!item || item.pickupId !== pickupId) {
      throw new DomainError('NOT_FOUND', 'Item de tournée introuvable');
    }

    await tx.pickupItem.update({
      where: { id: itemId },
      data: { collected, notes: notes ?? null },
    });

    return tx.pickup.findUniqueOrThrow({
      where: { id: pickupId },
      include: pickupInclude,
    }) as Promise<PickupLoaded>;
  });

  await auditService.log({
    actorUserId,
    action: 'pickup.item_check',
    targetType: 'pickup_item',
    targetId: itemId,
    newValue: { pickupId, collected },
    request,
  });

  return toPickupOutput(updated);
}

// ─────────────────────────────────────────────────────────────────
// Lectures

async function listAdminInternal(query: PickupAdminListQuery): Promise<PickupOutput[]> {
  const rows = await prisma.pickup.findMany({
    where: {
      ...(query.status && { status: query.status }),
      ...(query.zoneId && { zoneId: query.zoneId }),
    },
    include: pickupInclude,
    orderBy: { scheduledFor: 'asc' },
    take: 200,
  });
  return rows.map((r) => toPickupOutput(r as PickupLoaded));
}

async function listForProducerInternal(producerUserId: string): Promise<PickupOutput[]> {
  // Une tournée concerne un producteur si elle contient ≥ 1 item dont il
  // est le producteur. On exclut les tournées annulées de la vue producteur.
  const rows = await prisma.pickup.findMany({
    where: {
      status: { not: 'cancelled' },
      items: { some: { orderItem: { producerUserId } } },
    },
    include: pickupInclude,
    orderBy: { scheduledFor: 'asc' },
    take: 200,
  });
  return rows.map((r) => toPickupOutput(r as PickupLoaded));
}

// ─────────────────────────────────────────────────────────────────
// Service exporté

export const pickupService = {
  createPickup: createPickupInternal,
  transitionStatus: transitionStatusInternal,
  cancelPickup: cancelPickupInternal,
  checkItem: checkItemInternal,
  listAdmin: listAdminInternal,
  listForProducer: listForProducerInternal,
};
