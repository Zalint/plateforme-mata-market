import type { SiteOutput } from '@mata/shared/schemas';
import type { ProductionSite } from '@prisma/client';

export function toSiteOutput(s: ProductionSite): SiteOutput {
  return {
    id: s.id,
    producerUserId: s.producerUserId,
    name: s.name,
    type: s.type,
    status: s.status,
    zoneId: s.zoneId,
    addressLine: s.addressLine,
    geoLat: s.geoLat,
    geoLng: s.geoLng,
    vehicleAccess: s.vehicleAccess,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    pickupHours: s.pickupHours,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
