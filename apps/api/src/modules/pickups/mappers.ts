import type { PickupItemOutput, PickupOutput } from '@mata/shared/schemas';
import type { Offer, Order, OrderItem, Pickup, PickupItem, User, Zone } from '@prisma/client';

/**
 * Mappers Prisma → Zod PickupOutput (Lot 7).
 */

type PickupItemLoaded = PickupItem & {
  orderItem: Pick<OrderItem, 'quantity' | 'producerUserId'> & {
    order: Pick<Order, 'orderNumber'>;
    offer: Pick<Offer, 'title'>;
    producer: Pick<User, 'displayName'>;
  };
};

export type PickupLoaded = Pickup & {
  zone: Pick<Zone, 'name'>;
  items: PickupItemLoaded[];
};

function toPickupItemOutput(i: PickupItemLoaded): PickupItemOutput {
  return {
    id: i.id,
    orderItemId: i.orderItemId,
    collected: i.collected,
    notes: i.notes,
    orderNumber: i.orderItem.order.orderNumber,
    offerTitle: i.orderItem.offer.title,
    quantity: i.orderItem.quantity,
    producerUserId: i.orderItem.producerUserId,
    producerDisplayName: i.orderItem.producer.displayName,
  };
}

export function toPickupOutput(p: PickupLoaded): PickupOutput {
  return {
    id: p.id,
    pickupNumber: p.pickupNumber,
    zoneId: p.zoneId,
    zoneName: p.zone.name,
    scheduledFor: p.scheduledFor.toISOString(),
    scheduledPeriod: p.scheduledPeriod,
    vehicleType: p.vehicleType,
    driverDisplayName: p.driverDisplayName,
    status: p.status,
    completedAt: p.completedAt?.toISOString() ?? null,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    cancelReason: p.cancelReason,
    items: p.items.map(toPickupItemOutput),
    createdAt: p.createdAt.toISOString(),
  };
}

export const pickupInclude = {
  zone: { select: { name: true } },
  items: {
    include: {
      orderItem: {
        select: {
          quantity: true,
          producerUserId: true,
          order: { select: { orderNumber: true } },
          offer: { select: { title: true } },
          producer: { select: { displayName: true } },
        },
      },
    },
  },
} as const;
