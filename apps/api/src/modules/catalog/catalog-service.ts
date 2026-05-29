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
  async listValidated(query: CatalogOfferListQuery): Promise<CatalogOfferListResponse> {
    const where = {
      status: 'validated' as const,
      ...(query.category && { category: query.category }),
      ...(query.zoneId && {
        OR: [{ producer: { zoneId: query.zoneId } }, { site: { zoneId: query.zoneId } }],
      }),
      ...(query.q && { title: { contains: query.q, mode: 'insensitive' as const } }),
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
      offers: rows.map(toItem),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getValidatedById(id: string): Promise<CatalogOfferDetail> {
    const row = await prisma.offer.findUnique({ where: { id }, include });
    if (!row) throw new DomainError('NOT_FOUND', 'Offre introuvable');
    if (row.status !== 'validated') {
      throw new DomainError('NOT_FOUND', 'Offre non disponible au catalogue');
    }
    return toDetail(row);
  },
};

function toItem(o: Loaded): CatalogOfferItem {
  return {
    id: o.id,
    category: o.category,
    title: o.title,
    unit: o.unit,
    quantity: o.quantity,
    priceFcfa: o.priceFcfa,
    availableFrom: o.availableFrom.toISOString().slice(0, 10),
    qualityNote: o.qualityNote,
    photoPublicIds: o.photos.map((p) => p.cloudinaryPublicId),
    producer: {
      userId: o.producer.userId,
      displayName: o.producer.user.displayName,
      zoneId: o.producer.zoneId,
    },
    site: { id: o.site.id, name: o.site.name, zoneId: o.site.zoneId },
  };
}

function toDetail(o: Loaded): CatalogOfferDetail {
  return {
    ...toItem(o),
    availableUntil: o.availableUntil ? o.availableUntil.toISOString().slice(0, 10) : null,
  };
}
