import {
  CatalogOfferDetailSchema,
  CatalogOfferListQuerySchema,
  CatalogOfferListResponseSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { catalogService } from './catalog-service.js';

const OfferIdParamSchema = z.object({ id: UuidSchema });

// Seul le staff MATA voit l'identité producteur dans le catalogue. Les clients
// (et un producteur en tant qu'acheteur) ne la voient pas (pivot : le client ne
// voit pas le producteur). Le mode invité a son propre endpoint déjà masqué.
function canSeeProducer(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'teleconsultant';
}

/**
 * Routes catalog · lecture publique authentifiée.
 *
 * Tout JWT valide (producer, client_*, admin, teleconsultant) y a accès. Le
 * mode invité (Lot 8) aura sa propre route distincte `/v1/guest/catalog`.
 */
export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/catalog/offers',
    {
      schema: {
        querystring: CatalogOfferListQuerySchema,
        response: { 200: CatalogOfferListResponseSchema },
      },
    },
    async (req) => {
      return catalogService.listValidated(req.query, canSeeProducer(req.user?.role));
    },
  );

  typed.get(
    '/v1/catalog/offers/:id',
    {
      schema: {
        params: OfferIdParamSchema,
        response: { 200: CatalogOfferDetailSchema },
      },
    },
    async (req) => {
      return catalogService.getValidatedById(req.params.id, canSeeProducer(req.user?.role));
    },
  );
}
