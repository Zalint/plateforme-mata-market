import { DomainError } from '@mata/shared/errors';
import type {
  ProducerAdminListQuery,
  ProducerAdminListResponse,
  ProducerProfileAdmin,
  ProducerProfileCreate,
  ProducerProfilePublic,
  ProducerProfileUpdate,
} from '@mata/shared/schemas';
import type { Prisma, ProducerStatus } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { toProducerAdmin, toProducerPublic } from './mappers.js';

/**
 * Service producteurs · CRUD profil + transitions de statut.
 *
 * Transitions autorisées (Lot 2) :
 *  - validate    : pending      → validated   (admin)
 *  - suspend     : validated    → suspended   (admin)
 *  - blacklist   : *            → blacklisted (admin) — terminal
 *  - reactivate  : suspended    → validated   (admin) — non exposé au Lot 2,
 *                                                       admin peut juste re-validate
 *
 * Toute transition écrit un audit_log (cf. CLAUDE.md §G3).
 */

const userInclude = {
  user: { select: { displayName: true, phone: true, email: true } },
} as const;

type TransitionInput = {
  actorUserId: string;
  targetUserId: string;
  request?: FastifyRequest;
};

export const producerService = {
  /**
   * Profile du producteur courant. Retourne `null` si aucun profil n'a encore
   * été créé (cas du producer fraîchement provisionné Keycloak).
   */
  async getMyProfile(userId: string): Promise<ProducerProfilePublic | null> {
    const row = await prisma.producerProfile.findUnique({
      where: { userId },
      include: userInclude,
    });
    return row ? toProducerPublic(row) : null;
  },

  /**
   * Création du profil par le producteur lui-même. Statut initial : `pending`.
   * Audit `producer.create`.
   */
  async createMyProfile(
    userId: string,
    input: ProducerProfileCreate,
    request?: FastifyRequest,
  ): Promise<ProducerProfilePublic> {
    const existing = await prisma.producerProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new DomainError('CONFLICT', 'Un profil producteur existe déjà pour cet utilisateur');
    }
    const created = await prisma.producerProfile.create({
      data: {
        userId,
        type: input.type,
        zoneId: input.zoneId,
        whatsappPhone: input.whatsappPhone,
        photoPublicId: input.photoPublicId,
        bio: input.bio,
      },
      include: userInclude,
    });
    await auditService.log({
      actorUserId: userId,
      action: 'producer.create',
      targetType: 'producer',
      targetId: userId,
      newValue: { type: input.type, zoneId: input.zoneId },
      request,
    });
    return toProducerPublic(created);
  },

  /**
   * Update partiel des champs autorisés (type, zone, whatsapp, photo, bio).
   * NE TOUCHE PAS status / validatedAt / bankDetails / documents — ceux-ci
   * passent par leurs endpoints dédiés. Audit `producer.update`.
   */
  async updateMyProfile(
    userId: string,
    input: ProducerProfileUpdate,
    request?: FastifyRequest,
  ): Promise<ProducerProfilePublic> {
    const existing = await prisma.producerProfile.findUnique({ where: { userId } });
    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Aucun profil producteur pour cet utilisateur');
    }
    const updated = await prisma.producerProfile.update({
      where: { userId },
      data: {
        type: input.type,
        zoneId: input.zoneId,
        whatsappPhone: input.whatsappPhone,
        photoPublicId: input.photoPublicId,
        bio: input.bio,
      },
      include: userInclude,
    });
    await auditService.log({
      actorUserId: userId,
      action: 'producer.update',
      targetType: 'producer',
      targetId: userId,
      oldValue: { type: existing.type, zoneId: existing.zoneId },
      newValue: { type: updated.type, zoneId: updated.zoneId },
      request,
    });
    return toProducerPublic(updated);
  },

  /**
   * Liste paginée + filtres (admin only).
   */
  async listAdmin(query: ProducerAdminListQuery): Promise<ProducerAdminListResponse> {
    const where: Prisma.ProducerProfileWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.zoneId && { zoneId: query.zoneId }),
      ...(query.q && {
        user: {
          OR: [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
          ],
        },
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      prisma.producerProfile.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: userInclude,
      }),
      prisma.producerProfile.count({ where }),
    ]);
    return {
      producers: rows.map(toProducerAdmin),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  /**
   * Détail admin avec documents + flag hasBankDetails.
   */
  async getByIdAdmin(userId: string): Promise<ProducerProfileAdmin> {
    const row = await prisma.producerProfile.findUnique({
      where: { userId },
      include: userInclude,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Producteur introuvable');
    return toProducerAdmin(row);
  },

  /**
   * Validation admin : pending → validated. Pose validatedAt / validatedBy.
   * Refus 409 si statut ≠ pending.
   */
  async validate(input: TransitionInput): Promise<ProducerProfilePublic> {
    return runTransition({
      ...input,
      from: ['pending'],
      action: 'producer.validate',
      data: { status: 'validated', validatedAt: new Date(), validatedBy: input.actorUserId },
    });
  },

  /**
   * Suspension admin : validated → suspended. Reason loggée dans audit
   * (pas de colonne dédiée au Lot 2).
   */
  async suspend(input: TransitionInput & { reason: string }): Promise<ProducerProfilePublic> {
    return runTransition({
      ...input,
      from: ['validated'],
      action: 'producer.suspend',
      data: { status: 'suspended' },
      auditExtra: { reason: input.reason },
    });
  },

  /**
   * Blacklist admin : depuis n'importe quel statut (terminal).
   */
  async blacklist(input: TransitionInput & { reason: string }): Promise<ProducerProfilePublic> {
    return runTransition({
      ...input,
      from: ['pending', 'validated', 'suspended'],
      action: 'producer.blacklist',
      data: { status: 'blacklisted' },
      auditExtra: { reason: input.reason },
    });
  },
};

// ─────────────────────────────────────────────────────────────────
// Helper interne : encapsule lecture / vérification statut / update / audit.

async function runTransition(input: {
  actorUserId: string;
  targetUserId: string;
  from: readonly ProducerStatus[];
  action: 'producer.validate' | 'producer.suspend' | 'producer.blacklist';
  data: Prisma.ProducerProfileUpdateInput;
  auditExtra?: Record<string, unknown>;
  request?: FastifyRequest;
}): Promise<ProducerProfilePublic> {
  const current = await prisma.producerProfile.findUnique({
    where: { userId: input.targetUserId },
  });
  if (!current) throw new DomainError('NOT_FOUND', 'Producteur introuvable');
  if (!input.from.includes(current.status)) {
    throw new DomainError(
      'CONFLICT',
      `Transition impossible depuis status=${current.status} (attendu : ${input.from.join('|')})`,
    );
  }
  const updated = await prisma.producerProfile.update({
    where: { userId: input.targetUserId },
    data: input.data,
    include: userInclude,
  });
  await auditService.log({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: 'producer',
    targetId: input.targetUserId,
    oldValue: { status: current.status },
    newValue: { status: updated.status, ...input.auditExtra },
    request: input.request,
  });
  return toProducerPublic(updated);
}
