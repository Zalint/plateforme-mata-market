import type { ZoneOutput } from '@mata/shared/schemas';
import type { Zone as PrismaZone } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Service zones · lecture seule (Lot 2).
 *
 * Pas de CRUD admin au Lot 2 (YAGNI). Ajout de zone via seed ou SQL jusqu'à
 * ce qu'un vrai workflow d'éditeur soit demandé (Lot 9 probable).
 */

export const zoneService = {
  async listActive(): Promise<ZoneOutput[]> {
    const rows = await prisma.zone.findMany({
      where: { active: true },
      orderBy: [{ region: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toOutput);
  },
};

function toOutput(z: PrismaZone): ZoneOutput {
  return {
    id: z.id,
    slug: z.slug,
    name: z.name,
    region: z.region,
    centroidLat: z.centroidLat,
    centroidLng: z.centroidLng,
    active: z.active,
    createdAt: z.createdAt.toISOString(),
  };
}
