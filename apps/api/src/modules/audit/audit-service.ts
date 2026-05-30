import { type AuditLog, Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';

/**
 * Service d'audit central. Toutes les actions métier sensibles passent par ici.
 *
 * Référence : ARCHITECTURE.md §9 + CLAUDE.md §G3 « audit_log écrit pour
 * toute action métier sensible ».
 */

export type AuditAction =
  // Producteurs
  | 'producer.create'
  | 'producer.update'
  | 'producer.suspend'
  | 'producer.blacklist'
  | 'producer.validate'
  // Offres
  | 'offer.create'
  | 'offer.update'
  | 'offer.validate'
  | 'offer.reject'
  | 'offer.suspend'
  | 'offer.reactivate'
  | 'offer.submit'
  // Sites
  | 'site.create'
  | 'site.update'
  | 'site.archive'
  // Commandes
  | 'order.create'
  | 'order.confirm'
  | 'order.cancel'
  | 'order.status_change'
  | 'order.idempotent_replay'
  // Paiements
  | 'payment.received'
  | 'payment.disputed'
  | 'payout.trigger'
  | 'payout.block'
  // Téléconseil
  | 'teleconsult.code.generate'
  | 'teleconsult.session.start'
  | 'teleconsult.session.end'
  | 'teleconsult.session.action_forbidden'
  // Pricing
  | 'pricing.rule.create'
  | 'pricing.rule.update'
  // Coordonnées bancaires
  | 'producer.bank_details.update'
  | 'producer.bank_details.reveal';

export type AuditLogInput = {
  actorUserId: string;
  onBehalfOfUserId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  request?: FastifyRequest;
};

export const auditService = {
  async log(input: AuditLogInput): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        onBehalfOfUserId: input.onBehalfOfUserId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        oldValue: input.oldValue ?? Prisma.DbNull,
        newValue: input.newValue ?? Prisma.DbNull,
        ipAddress: input.request?.ip ?? null,
        userAgent: (input.request?.headers['user-agent'] as string | undefined) ?? null,
        requestId: input.request?.id ?? null,
      },
    });
  },
};
