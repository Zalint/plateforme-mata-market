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
 *   validated → suspended    (producteur self-service OU modération admin/téléconseiller)
 *   suspended → validated    (producteur self-service OU modération admin/téléconseiller)
 *   validated|pending|changes_requested|suspended → withdrawn  (admin.retire, unilatéral)
 *   withdrawn → draft        (admin.restore — VERROU : le producteur ne peut pas)
 *   reserved  → sold         (auto : toutes les commandes de l'offre livrées, cf. order-service)
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

/**
 * Acteur d'audit d'une mutation d'offre. `actorUserId` est TOUJOURS l'utilisateur
 * réel (jamais le producteur cible) ; `onBehalfOfUserId` porte le producteur en
 * session déléguée téléconseil/admin (CLAUDE.md §G3 + §G6).
 */
type AuditActor = {
  actorUserId: string;
  onBehalfOfUserId?: string | null;
};

type TransitionInput = AuditActor & {
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

  /**
   * Liste admin/modération. `scopeWhere` restreint le périmètre de modération
   * (portée téléconseiller) ; vide `{}` = aucune restriction (admin). Cf.
   * assignment-scope.scopeOfferWhereForModerator.
   */
  async listAdmin(
    query: OfferAdminListQuery,
    scopeWhere: Prisma.OfferWhereInput = {},
  ): Promise<OfferAdminListResponse> {
    const filters: Prisma.OfferWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.category && { categorySlug: query.category }),
      ...(query.producerUserId && { producerUserId: query.producerUserId }),
      // Recherche libre : titre de l'offre OU nom du producteur.
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { producer: { user: { displayName: { contains: query.q, mode: 'insensitive' } } } },
        ],
      }),
    };
    const where: Prisma.OfferWhereInput = { AND: [filters, scopeWhere] };
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

  /**
   * Producteurs distincts ayant au moins une offre dans le périmètre du
   * modérateur (alimente le sélecteur « Producteur » de la file de validation).
   * `scopeWhere` applique la portée de modération comme `listAdmin`.
   */
  async listAdminProducers(
    scopeWhere: Prisma.OfferWhereInput = {},
  ): Promise<{ producers: { id: string; displayName: string }[] }> {
    const rows = await prisma.offer.findMany({
      where: scopeWhere,
      select: {
        producerUserId: true,
        producer: { select: { user: { select: { displayName: true } } } },
      },
      distinct: ['producerUserId'],
    });
    const producers = rows
      .map((r) => ({ id: r.producerUserId, displayName: r.producer.user.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
    return { producers };
  },

  // ─────────────────────────────────────────────────────────────
  // Mutations CRUD

  async create(
    producerUserId: string,
    input: OfferCreate,
    actor: AuditActor,
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
    // Catégorie = slug vers product_categories : doit exister ET être active
    // (remplace l'ancienne validation z.enum, désormais dynamique).
    await assertCategoryActive(input.category);

    const created = await prisma.offer.create({
      data: {
        producerUserId,
        siteId: input.siteId,
        categorySlug: input.category,
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
      actorUserId: actor.actorUserId,
      onBehalfOfUserId: actor.onBehalfOfUserId ?? null,
      action: 'offer.create',
      targetType: 'offer',
      targetId: created.id,
      newValue: {
        title: created.title,
        category: created.categorySlug,
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
    actor: AuditActor,
    offerId: string,
    input: OfferUpdate,
    request?: FastifyRequest,
  ): Promise<OfferOutput> {
    const existing = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    if (existing.status !== 'draft' && existing.status !== 'changes_requested') {
      throw new DomainError(
        'CONFLICT',
        `PATCH refusé sur status=${existing.status} — éditable uniquement en brouillon ou à corriger.`,
      );
    }
    if (input.category !== undefined) await assertCategoryActive(input.category);

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: {
        siteId: input.siteId,
        categorySlug: input.category,
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
      actorUserId: actor.actorUserId,
      onBehalfOfUserId: actor.onBehalfOfUserId ?? null,
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
      // Soumission initiale (draft) OU re-soumission après corrections
      // (changes_requested). On efface le feedback précédent.
      from: ['draft', 'changes_requested'],
      action: 'offer.submit',
      data: { status: 'pending', submittedAt: new Date(), rejectionReason: null },
    });
  },

  /**
   * Admin/téléconseiller renvoie une offre `pending` au producteur pour
   * correction (réversible). Le message (obligatoire) est stocké dans
   * `rejectionReason` et affiché au producteur. L'offre redevient éditable.
   */
  async requestChanges(input: TransitionInput & { reason: string }): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['pending'],
      action: 'offer.request_changes',
      data: { status: 'changes_requested', rejectionReason: input.reason },
      auditExtra: { reason: input.reason },
    });
  },

  /**
   * Retour en brouillon par le producteur, TANT QUE l'offre est `pending`
   * (pas encore validée/rejetée). Permet de corriger une offre soumise :
   * l'édition (PATCH) n'est autorisée qu'en `draft`. Réinitialise `submittedAt`.
   */
  async withdraw(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['pending'],
      action: 'offer.withdraw',
      data: { status: 'draft', submittedAt: null },
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

  /**
   * MATA (admin/téléconseiller) retire une offre UNILATÉRALEMENT. Contrairement
   * à `suspend` — que le producteur peut lever lui-même — un retrait est un
   * VERROU : seul MATA peut le défaire via `restore`. La raison facultative est
   * stockée dans `rejectionReason` et affichée au producteur (lecture seule).
   * Le contrôle de rôle est fait dans la route (requireRole admin|teleconsultant).
   */
  async retire(input: TransitionInput & { reason?: string }): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['validated', 'pending', 'changes_requested', 'suspended'],
      action: 'offer.retire',
      data: { status: 'withdrawn', rejectionReason: input.reason ?? null },
      auditExtra: input.reason ? { reason: input.reason } : undefined,
    });
  },

  /** MATA rend la main au producteur : withdrawn → draft (efface le motif). */
  async restore(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['withdrawn'],
      action: 'offer.restore',
      data: { status: 'draft', rejectionReason: null },
    });
  },

  /** Archive un brouillon ou une offre refusée (la range, restaurable). */
  async archive(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['draft', 'rejected'],
      action: 'offer.archive',
      data: { status: 'archived' },
    });
  },

  /** Restaure une offre archivée en brouillon pour la retravailler. */
  async unarchive(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['archived'],
      action: 'offer.unarchive',
      data: { status: 'draft' },
    });
  },

  /**
   * Relance une offre expirée en brouillon. On efface l'ancienne date limite
   * (dépassée) : le producteur en saisira une nouvelle avant de re-soumettre,
   * sinon le cron la ré-expirerait aussitôt.
   */
  async relist(input: TransitionInput): Promise<OfferOutput> {
    return runTransition({
      ...input,
      from: ['expired'],
      action: 'offer.relist',
      data: { status: 'draft', availableUntil: null },
    });
  },

  /**
   * Cron : expire les offres dont la date limite (availableUntil) est passée.
   * Bulk updateMany (pas d'audit par offre — action système, on logue le total
   * côté job). Seules les offres `validated` (encore disponibles à la vente)
   * sont concernées : une offre `reserved` est entièrement réservée, sa date
   * d'availability n'a plus de sens et l'expirer EMPÊCHERAIT la transition
   * `reserved → sold` à la livraison. Si une réservation est annulée, l'offre
   * revient `validated` et sera expirée au prochain passage si encore en retard.
   * Retourne le nombre traité.
   */
  async expireOverdue(): Promise<{ expired: number }> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const res = await prisma.offer.updateMany({
      where: {
        status: 'validated',
        availableUntil: { lt: startOfToday },
      },
      data: { status: 'expired' },
    });
    return { expired: res.count };
  },

  // ─────────────────────────────────────────────────────────────
  // Photos (attach après upload Cloudinary signé)

  async attachPhotos(
    actor: AuditActor,
    offerId: string,
    input: OfferAttachPhotosInput,
    request?: FastifyRequest,
  ): Promise<OfferOutput> {
    const existing = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    // On autorise l'attache de photos même hors draft (pour pouvoir mettre
    // à jour les photos d'une offre validée sans repasser par validation).
    // À durcir si on observe des abus.

    // Validation publicId (CLAUDE.md §G5 « validation serveur du public_id ») :
    // le folder Cloudinary est figé serveur à `mata/offers/<owner>/<offerId>`
    // (cf. uploads-routes.buildFolder). Un public_id légitime commence donc par
    // ce préfixe. On refuse tout id hors de ce folder — empêche un producteur
    // d'attacher la photo d'une AUTRE offre / d'un autre producteur, ou un id
    // forgé pointant ailleurs dans le compte Cloudinary.
    const expectedPrefix = `mata/offers/${existing.producerUserId}/${offerId}/`;
    const invalid = input.publicIds.find((id) => !id.startsWith(expectedPrefix));
    if (invalid !== undefined) {
      throw new DomainError('VALIDATION', 'public_id hors du folder de cette offre', {
        details: { expectedPrefix },
      });
    }

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
      actorUserId: actor.actorUserId,
      onBehalfOfUserId: actor.onBehalfOfUserId ?? null,
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

/**
 * Vérifie qu'un slug de catégorie existe ET est actif (table product_categories).
 * Remplace l'ancienne validation statique z.enum : la taxonomie est dynamique.
 */
async function assertCategoryActive(slug: string): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { slug },
    select: { isActive: true },
  });
  if (!cat) throw new DomainError('VALIDATION', `Catégorie inconnue : ${slug}`);
  if (!cat.isActive) throw new DomainError('CONFLICT', `Catégorie désactivée : ${slug}`);
}

async function runTransition(input: {
  actorUserId: string;
  onBehalfOfUserId?: string | null;
  offerId: string;
  from: readonly OfferStatus[];
  action:
    | 'offer.submit'
    | 'offer.withdraw'
    | 'offer.validate'
    | 'offer.request_changes'
    | 'offer.reject'
    | 'offer.suspend'
    | 'offer.reactivate'
    | 'offer.archive'
    | 'offer.unarchive'
    | 'offer.relist'
    | 'offer.retire'
    | 'offer.restore';
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
    onBehalfOfUserId: input.onBehalfOfUserId ?? null,
    action: input.action,
    targetType: 'offer',
    targetId: input.offerId,
    oldValue: { status: current.status },
    newValue: { status: updated.status, ...input.auditExtra },
    request: input.request,
  });
  return toOfferOutput(updated);
}
