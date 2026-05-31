import {
  AdminDashboardKpisSchema,
  ClientDashboardKpisSchema,
  ProducerDashboardKpisSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireRole, requireUser } from '../auth/index.js';
import { dashboardService } from './dashboard-service.js';

/**
 * Routes Dashboard (Lot 9) · KPIs des accueils par rôle.
 *
 *  - GET /v1/admin/dashboard/kpis    : admin only.
 *  - GET /v1/producer/dashboard/kpis : producteur (sur ses propres données).
 *  - GET /v1/client/dashboard/kpis   : client (sur ses propres commandes).
 */
export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/admin/dashboard/kpis',
    { schema: { response: { 200: AdminDashboardKpisSchema } } },
    async (req) => {
      requireRole(req, 'admin');
      return dashboardService.getKpis();
    },
  );

  typed.get(
    '/v1/producer/dashboard/kpis',
    { schema: { response: { 200: ProducerDashboardKpisSchema } } },
    async (req) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      return dashboardService.getProducerKpis(user.id);
    },
  );

  typed.get(
    '/v1/client/dashboard/kpis',
    { schema: { response: { 200: ClientDashboardKpisSchema } } },
    async (req) => {
      requireRole(req, 'client_pro', 'client_particulier');
      const user = requireUser(req);
      return dashboardService.getClientKpis(user.id);
    },
  );
}
