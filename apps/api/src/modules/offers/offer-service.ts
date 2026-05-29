import type { OfferStatus } from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type {
  OfferAdminListQuery,
  OfferAdminListResponse,
  OfferAttachPhotosInput,
  OfferCreate,
  OfferOutput,
  OfferUpdate,
} from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { toOfferOutput } from './mappers.js';

/**
 * Service offres · CRUD + state machine + photos.
 *
 * State machine (cf. schema.prisma OfferStatus) :
 *   draft     → pending      (producer.submit)
 *   pending   → validated    (admin.validate)
 *   pending   → rejected     (admin.reject, rejection_reason)
 *   validated → suspended    (admin OU producer.suspend)
 *   suspended → validated    (admin OU producer.reactivate)
 *
 * PATCH (édition champs) autorisé uniquement en `draft`. Pour modifier
 * une offre publiée, le producteur doit créer une nouvelle offre.
 *
 * Audit_log écrit à CHAQUE transition (CLAUDE.md §G3 + §G6).
 */

const offerInclude = {
  photos: true,
  site: { select: { name: true } },
  producer: { include: { user: { select: { displayName: true } } } },
} as const;

type TransitionInput = {
  actorUserId: string;
  offerId: string;
  request?: FastifyRequest;
};

export const offerService = {
  // ─────────────────────────────────────────────────────────────
  // Lectures

  async listMine(producerUserId: string, status?: OfferStatus): Promise<OfferOutput[]> {
    const rows = await prisma.offer.findMany({
      where: { producerUserId, ...(status && { status }) },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toOfferOutput);
  },

  async getById(offerId: string): Promise<OfferOutput> {
    const row = await prisma.offer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    return toOfferOutput(row);
  },

  async listAdmin(query: OfferAdminListQuery): Promise<OfferAdminListResponse> {
    const where: Prisma.OfferWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.q && { title: { contains: query.q, mode: 'insensitive' } }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: offerInclude,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.offer.count({ where }),
    ]);
    return {
      offers: rows.map(toOfferOutput),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Mutations CRUD

  async create(
    producerUserId: string,
    input: OfferCreate,
    request?: FastifyRequest,
  ): Promise<OfferOutput> {
    // Vérifie que le site appartient bien à ce producteur (pas un site d'un autre).
    const site = await prisma.productionSite.findUnique({
      where: { id: input.siteId },
      select: { producerUserId: true, status: true },
    });
    if (!site) throw new DomainError('NOT_FOUND', 'Site introuvable');
    if (site.producerUserId !== producerUserId) {
      throw new DomainError('FORBIDDEN', 'Site appartenant à un autre producteur');
    }
    if (site.status !== 'active') {
      throw new DomainError('CONFLICT', 'Impossible de créer une offre sur un site archivé');
    }

    const created = await prisma.offer.create({
      data: {
        producerUserId,
        siteId: input.siteId,
        category: input.category,
        title: input.title,
        unit: input.unit,
        quantity: input.quantity,
        priceFcfa: input.priceFcfa,
        availableFrom: new Date(input.availableFrom),
        availableUntil: input.availableUntil ? new Date(input.availableUntil) : null,
        qualityNote: input.qualityNote,
      },
      include: offerInclude,
    });
    await auditService.log({
      actorUserId: producerUserId,
      action: 'offer.create',
      targetType: 'offer',
      targetId: created.id,
      newValue: {
        title: created.title,
        category: created.category,
        quantity: created.quantity,
        priceFcfa: created.priceFcfa,
      },
      request,
    });
    return toOfferOutput(created);
  },

  /**
   * Update partiel. Refuse 409 si statut ≠ draft.
   */
  async update(
    actorUserId: string,
    offerId: string,
    input: OfferUpdate,
    request?: FastifyRequest,
  ): Promise<OfferOutput> {
    const existing = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    if (existing.status !== 'draft') {
      throw new DomainError(
        'CONFLICT',
        `PATCH refusé sur status=${existing.status} — créer une nouvelle offre.`,
      );
    }

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: {
        siteId: input.siteId,
        category: input.category,
        title: input.title,
        unit: input.unit,
        quantity: input.quantity,
        priceFcfa: input.priceFcfa,
        availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
        availableUntil:
          input.availableUntil === null
            ? null
            : input.availableUntil
              ? new Date(input.availableUntil)
              : undefined,
        qualityNote: input.qualityNote,
      },
      include: offerInclude,
    });
    await auditService.log({
      actorUserId,
      action: 'offer.update',
      targetType: 'offer',
      targetId: offerId,
      oldValue: {
        title: existing.title,
        quantity: existing.quantity,
        priceFcfa: existing.priceFcfa,
      },
      newValue: {
        title: updated.title,
        quantity: updated.quantity,
        priceFcfa: updated.priceFcfa,
      },
      request,
    });
    return toOfferOutput(updated);
  },

  // ─────────────────────────────────────────────────────────────
  // State machine

  async submit(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['draft'],
      action: 'offer.submit',
      data: { status: 'pending', submittedAt: new Date() },
    });
  },

  async validate(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['pending'],
      action: 'offer.validate',
      data: {
        status: 'validated',
        validatedAt: new Date(),
        validatedBy: input.actorUserId,
        rejectionReason: null,
      },
    });
  },

  async reject(input: TransitionInput & { reason: string }): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['pending'],
      action: 'offer.reject',
      data: {
        status: 'rejected',
        validatedAt: null,
        validatedBy: input.actorUserId,
        rejectionReason: input.reason,
      },
      auditExtra: { reason: input.reason },
    });
  },

  async suspend(input: TransitionInput & { reason?: string }): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['validated'],
      action: 'offer.suspend',
      data: { status: 'suspended', suspendedAt: new Date(), suspendedBy: input.actorUserId },
      auditExtra: input.reason ? { reason: input.reason } : undefined,
    });
  },

  async reactivate(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['suspended'],
      action: 'offer.reactivate',
      data: { status: 'validated', suspendedAt: null, suspendedBy: null },
    });
  },

  // ─────────────────────────────────────────────────────────────
  // Photos (attach après upload Cloudinary signé)

  async attachPhotos(
    actorUserId: string,
    offerId: string,
    input: OfferAttachPhotosInput,
    request?: FastifyRequest,
  ): Promise<OfferOutput> {
    const existing = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    // On autorise l'attache de photos même hors draft (pour pouvoir mettre
    // à jour les photos d'une offre validée sans repasser par validation).
    // À durcir si on observe des abus.

    await prisma.$transaction(async (tx) => {
      await tx.offerPhoto.deleteMany({ where: { offerId } });
      await tx.offerPhoto.createMany({
        data: input.publicIds.map((publicId, position) => ({
          offerId,
          cloudinaryPublicId: publicId,
          position,
        })),
      });
    });

    const updated = await prisma.offer.findUniqueOrThrow({
      where: { id: offerId },
      include: offerInclude,
    });
    await auditService.log({
      actorUserId,
      action: 'offer.update',
      targetType: 'offer',
      targetId: offerId,
      newValue: { photosCount: input.publicIds.length },
      request,
    });
    return toOfferOutput(updated);
  },
};

// ─────────────────────────────────────────────────────────────────

async function runTransition(input: {
  actorUserId: string;
  offerId: string;
  from: readonly OfferStatus[];
  action: 'offer.submit' | 'offer.validate' | 'offer.reject' | 'offer.suspend' | 'offer.reactivate';
  data: Prisma.OfferUpdateInput;
  auditExtra?: Record<string, unknown>;
  request?: FastifyRequest;
}): Promise<OfferOutput> {
  const current = await prisma.offer.findUnique({ where: { id: input.offerId } });
  if (!current) throw new DomainError('NOT_FOUND', 'Offre introuvable');
  if (!input.from.includes(current.status)) {
    throw new DomainError(
      'CONFLICT',
      `Transition impossible depuis status=${current.status} (attendu : ${input.from.join('|')})`,
    );
  }
  const updated = await prisma.offer.update({
    where: { id: input.offerId },
    data: input.data,
    include: offerInclude,
  });
  await auditService.log({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: 'offer',
    targetId: input.offerId,
    oldValue: { status: current.status },
    newValue: { status: updated.status, ...input.auditExtra },
    request: input.request,
  });
  return toOfferOutput(updated);
}
