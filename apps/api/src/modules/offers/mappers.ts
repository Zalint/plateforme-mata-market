import type { OfferOutput, OfferPhoto as OfferPhotoOut } from '@mata/shared/schemas';
import type {
  Offer,
  OfferPhoto as PrismaOfferPhoto,
  ProducerProfile,
  ProductionSite,
  User,
} from '@prisma/client';

type OfferLoaded = Offer & {
  photos: PrismaOfferPhoto[];
  site: Pick<ProductionSite, 'name'>;
  producer: ProducerProfile & { user: Pick<User, 'displayName'> };
};

/**
 * Convertit une date `@db.Date` Prisma (Date dont l'heure est 00:00:00 UTC)
 * en chaîne ISO `YYYY-MM-DD` attendue par `IsoDateSchema`.
 */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toOfferOutput(o: OfferLoaded): OfferOutput {
  return {
    id: o.id,
    producerUserId: o.producerUserId,
    producerDisplayName: o.producer.user.displayName,
    siteId: o.siteId,
    siteName: o.site.name,
    // Source de vérité = categorySlug (FK product_categories). Fallback sur
    // l'enum legacy le temps de la Release 1 (backfill garantit l'un des deux).
    category: o.categorySlug ?? o.category ?? '',
    status: o.status,
    title: o.title,
    unit: o.unit,
    quantity: o.quantity,
    quantityReserved: o.quantityReserved,
    priceFcfa: o.priceFcfa,
    availableFrom: toIsoDate(o.availableFrom),
    availableUntil: o.availableUntil ? toIsoDate(o.availableUntil) : null,
    qualityNote: o.qualityNote,
    submittedAt: o.submittedAt ? o.submittedAt.toISOString() : null,
    validatedAt: o.validatedAt ? o.validatedAt.toISOString() : null,
    validatedBy: o.validatedBy,
    rejectionReason: o.rejectionReason,
    suspendedAt: o.suspendedAt ? o.suspendedAt.toISOString() : null,
    suspendedBy: o.suspendedBy,
    photos: o.photos.sort((a, b) => a.position - b.position).map(toPhotoOutput),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function toPhotoOutput(p: PrismaOfferPhoto): OfferPhotoOut {
  return {
    id: p.id,
    cloudinaryPublicId: p.cloudinaryPublicId,
    position: p.position,
  };
}
