import { HealthResponseSchema } from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

/**
 * Healthcheck endpoint utilisé par Render et le monitoring.
 *
 * Vérifie :
 *  - DB Postgres (SELECT 1)
 *  - Keycloak (Lot 1, désactivé tant que l'URL n'est pas configurée)
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/health',
    {
      schema: {
        response: { 200: HealthResponseSchema, 503: HealthResponseSchema },
      },
    },
    async (_request, reply) => {
      const checks = {
        db: 'unknown' as 'ok' | 'down' | 'unknown',
        keycloak: 'skipped' as 'ok' | 'down' | 'skipped',
      };

      // DB check
      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.db = 'ok';
      } catch (err) {
        app.log.error({ err }, 'health.db.down');
        checks.db = 'down';
      }

      // Keycloak check (Lot 1) — désactivé tant que l'URL n'est pas configurée
      // TODO Lot 1 : interroger /realms/${KEYCLOAK_REALM}/.well-known/openid-configuration

      const status = checks.db === 'ok' ? 'ok' : 'degraded';
      const httpCode = status === 'ok' ? 200 : 503;

      return reply.code(httpCode).send({
        status,
        timestamp: new Date().toISOString(),
        checks,
      });
    },
  );
}
