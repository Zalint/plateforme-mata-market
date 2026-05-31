import type { PaymentOutput } from '@mata/shared/schemas';
import type { Order, Payment } from '@prisma/client';

/**
 * Mappers Prisma → Zod PaymentOutput.
 */

export type PaymentLoaded = Payment & {
  order: Pick<Order, 'orderNumber'>;
};

export function toPaymentOutput(p: PaymentLoaded): PaymentOutput {
  return {
    id: p.id,
    orderId: p.orderId,
    orderNumber: p.order.orderNumber,
    providerIntentId: p.providerIntentId,
    amountFcfa: p.amountFcfa,
    currency: p.currency,
    status: p.status,
    paymentUrl: p.paymentUrl,
    paymentMethod: p.paymentMethod,
    paidAt: p.paidAt?.toISOString() ?? null,
    refundedAt: p.refundedAt?.toISOString() ?? null,
    disputedAt: p.disputedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export const paymentInclude = {
  order: { select: { orderNumber: true } },
} as const;
