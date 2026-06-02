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
  // Utilisateurs (création par un admin, tous rôles)
  | 'user.create'
  // Producteurs
  | 'producer.create'
  | 'producer.onboard'
  | 'producer.update'
  | 'producer.suspend'
  | 'producer.blacklist'
  | 'producer.validate'
  | 'producer.rating.create'
  // Catégories produit (taxonomie data-driven)
  | 'category.create'
  | 'category.update'
  // Affectations producteur ↔ téléconseiller (portée de modération)
  | 'teleconsultant.assignment.set'
  // Offres
  | 'offer.create'
  | 'offer.update'
  | 'offer.validate'
  | 'offer.request_changes'
  | 'offer.reject'
  | 'offer.suspend'
  | 'offer.reactivate'
  | 'offer.submit'
  | 'offer.withdraw'
  | 'offer.archive'
  | 'offer.unarchive'
  | 'offer.relist'
  | 'offer.retire'
  | 'offer.restore'
  | 'offer.sold'
  // Sites
  | 'site.create'
  | 'site.update'
  | 'site.archive'
  // Commandes
  | 'order.create'
  | 'order.confirm'
  | 'order.cancel'
  | 'order.status_change'
  | 'order.assign'
  | 'order.unassign'
  | 'order.price_adjust'
  | 'order.idempotent_replay'
  // Paiements
  | 'payment.intent_created'
  | 'payment.received'
  | 'payment.refunded'
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
  | 'producer.bank_details.reveal'
  // Tournées de collecte (Lot 7)
  | 'pickup.create'
  | 'pickup.status_change'
  | 'pickup.cancel'
  | 'pickup.item_check'
  // Notifications push (Lot 7)
  | 'notification.subscribe'
  | 'notification.unsubscribe'
  | 'notification.preferences_update';

export type AuditLogInput = {
  /** `null` = acteur invité (sans row `users`). Renseigner alors `guestPhoneNumber`. */
  actorUserId: string | null;
  onBehalfOfUserId?: string | null;
  /** Téléphone de contact invité — à fournir quand `actorUserId` est null. */
  guestPhoneNumber?: string | null;
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
        guestPhoneNumber: input.guestPhoneNumber ?? null,
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
