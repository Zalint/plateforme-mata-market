import { AdminDashboardKpisSchema } from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireRole } from '../auth/index.js';
import { dashboardService } from './dashboard-service.js';

/**
 * Routes Dashboard admin (Lot 9) · KPIs de l'accueil ADMIN.
 *
 *  - GET /v1/admin/dashboard/kpis : admin only.
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
}
