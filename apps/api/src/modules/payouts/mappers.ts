import type { PayoutOutput } from '@mata/shared/schemas';
import type { Payout, PayoutItem, User } from '@prisma/client';

/**
 * Mappers Prisma → Zod PayoutOutput.
 */

export type PayoutLoaded = Payout & {
  producer: Pick<User, 'displayName'>;
  items: Pick<PayoutItem, 'orderItemId'>[];
};

export function toPayoutOutput(p: PayoutLoaded): PayoutOutput {
  return {
    id: p.id,
    producerUserId: p.producerUserId,
    producerDisplayName: p.producer.displayName,
    amountFcfa: p.amountFcfa,
    status: p.status,
    providerDisbursementId: p.providerDisbursementId,
    coveredOrderItemIds: p.items.map((i) => i.orderItemId),
    sentAt: p.sentAt?.toISOString() ?? null,
    failedAt: p.failedAt?.toISOString() ?? null,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
  };
}

export const payoutInclude = {
  producer: { select: { displayName: true } },
  items: { select: { orderItemId: true } },
} as const;
