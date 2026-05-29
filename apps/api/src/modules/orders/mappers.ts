import type { OrderItemOutput, OrderOutput } from '@mata/shared/schemas';
import type { Offer, Order, OrderItem, PricingSnapshot, User, Zone } from '@prisma/client';
import { toPricingSnapshotOutput } from '../pricing/mappers.js';

/**
 * Mappers Prisma → Zod OrderOutput. Toutes les jointures attendues sont
 * incluses dans le type `OrderLoaded` ci-dessous (le service les fournit
 * via `include`).
 */

type OrderItemLoaded = OrderItem & {
  offer: Pick<Offer, 'title'>;
  producer: { displayName: string }; // via User on producer relation
  pricingSnapshot: PricingSnapshot;
};

export type OrderLoaded = Order & {
  client: Pick<User, 'displayName'> | null;
  zone: Pick<Zone, 'name'>;
  items: OrderItemLoaded[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toOrderOutput(o: OrderLoaded): OrderOutput {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    clientUserId: o.clientUserId,
    clientDisplayName: o.client?.displayName ?? null,
    status: o.status,
    deliveryZoneId: o.deliveryZoneId,
    deliveryZoneName: o.zone.name,
    deliveryAddressLine: o.deliveryAddressLine,
    deliverySlotDate: toIsoDate(o.deliverySlotDate),
    deliverySlotPeriod: o.deliverySlotPeriod,
    totalFcfa: o.totalFcfa,
    paymentStatus: o.paymentStatus,
    items: o.items.map(toOrderItemOutput),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    collectedAt: o.collectedAt?.toISOString() ?? null,
    storedAt: o.storedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function toOrderItemOutput(i: OrderItemLoaded): OrderItemOutput {
  return {
    id: i.id,
    offerId: i.offerId,
    offerTitle: i.offer.title,
    producerUserId: i.producerUserId,
    producerDisplayName: i.producer.displayName,
    quantity: i.quantity,
    unitPriceAtOrder: i.unitPriceAtOrder,
    pricingSnapshot: toPricingSnapshotOutput(i.pricingSnapshot),
    createdAt: i.createdAt.toISOString(),
  };
}

/**
 * Include partagé entre toutes les requêtes orders pour garantir que
 * `toOrderOutput` ait toutes les relations attendues.
 *
 * `producer` est mappé depuis la relation `OrderItem.producer` (User)
 * mais on n'a besoin que de displayName, donc on sélectionne.
 */
export const orderInclude = {
  client: { select: { displayName: true } },
  zone: { select: { name: true } },
  items: {
    include: {
      offer: { select: { title: true } },
      producer: { select: { displayName: true } },
      pricingSnapshot: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;
