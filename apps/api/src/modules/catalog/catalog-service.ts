import { DomainError } from '@mata/shared/errors';
import type {
  CatalogOfferDetail,
  CatalogOfferItem,
  CatalogOfferListQuery,
  CatalogOfferListResponse,
} from '@mata/shared/schemas';
import type { Offer, OfferPhoto, ProducerProfile, ProductionSite, User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Service catalog · lecture publique des offres validées.
 *
 * Lot 2 — décision MVP : on retourne 1 carte par offre (et non agrégée par
 * produit comme dans le mockup). L'agrégation par titre/catégorie viendra
 * au Lot 3 ou 4 quand on aura le pricing normalisé. Le rendu front s'adapte.
 */

type Loaded = Offer & {
  photos: OfferPhoto[];
  producer: ProducerProfile & { user: Pick<User, 'displayName'> };
  site: Pick<ProductionSite, 'id' | 'name' | 'zoneId'>;
};

const include = {
  photos: { orderBy: { position: 'asc' } },
  producer: { include: { user: { select: { displayName: true } } } },
  site: { select: { id: true, name: true, zoneId: true } },
} as const;

export const catalogService = {
  async listValidated(
    query: CatalogOfferListQuery,
    showProducer: boolean,
  ): Promise<CatalogOfferListResponse> {
    // Effet immédiat de la date limite : on masque les offres dont availableUntil
    // est passée, même avant que le cron d'expiration ne change leur statut.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const notExpired = {
      OR: [{ availableUntil: null }, { availableUntil: { gte: startOfToday } }],
    };
    const where = {
      status: 'validated' as const,
      ...(query.category && { categorySlug: query.category }),
      ...(query.q && { title: { contains: query.q, mode: 'insensitive' as const } }),
      AND: [
        notExpired,
        ...(query.zoneId
          ? [{ OR: [{ producer: { zoneId: query.zoneId } }, { site: { zoneId: query.zoneId } }] }]
          : []),
      ],
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.offer.count({ where }),
    ]);
    return {
      offers: rows.map((r) => toItem(r, showProducer)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getValidatedById(id: string, showProducer: boolean): Promise<CatalogOfferDetail> {
    const row = await prisma.offer.findUnique({ where: { id }, include });
    if (!row) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    if (row.status !== 'validated') {
      throw new DomainError('NOT_FOUND', 'Offre non disponible au catalogue');
    }
    return toDetail(row, showProducer);
  },
};

// `showProducer` : masque l'identité producteur (+ nom du site) pour les clients
// (null) ; vrai pour le staff. Cf. catalog-routes (décision selon le rôle).
function toItem(o: Loaded, showProducer: boolean): CatalogOfferItem {
  return {
    id: o.id,
    category: o.categorySlug ?? o.category ?? '',
    title: o.title,
    unit: o.unit,
    quantity: o.quantity,
    priceFcfa: o.priceFcfa,
    availableFrom: o.availableFrom.toISOString().slice(0, 10),
    qualityNote: o.qualityNote,
    photoPublicIds: o.photos.map((p) => p.cloudinaryPublicId),
    producer: {
      userId: showProducer ? o.producer.userId : null,
      displayName: showProducer ? o.producer.user.displayName : null,
      zoneId: o.producer.zoneId,
    },
    site: { id: o.site.id, name: showProducer ? o.site.name : null, zoneId: o.site.zoneId },
  };
}

function toDetail(o: Loaded, showProducer: boolean): CatalogOfferDetail {
  return {
    ...toItem(o, showProducer),
    availableUntil: o.availableUntil ? o.availableUntil.toISOString().slice(0, 10) : null,
  };
}
