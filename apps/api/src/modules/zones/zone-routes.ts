import { ZoneListResponseSchema } from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { zoneService } from './zone-service.js';

/**
 * Routes zones · `GET /v1/zones` (lecture publique authentifiée).
 *
 * Tout JWT valide y a accès (producer, client_*, admin, teleconsultant).
 * Le mode invité (Lot 8) aura sa propre route s'il en a besoin.
 */
export async function zoneRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/zones',
    {
      schema: { response: { 200: ZoneListResponseSchema } },
    },
    async () => {
      const zones = await zoneService.listActive();
      return { zones };
    },
  );
}
