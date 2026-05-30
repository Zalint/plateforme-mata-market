import {
  SiteCreateSchema,
  SiteListResponseSchema,
  SiteOutputSchema,
  SiteUpdateSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { assertOwnership, requireRole, requireUser } from '../auth/index.js';
import { siteService } from './site-service.js';

const SiteIdParamSchema = z.object({ id: UuidSchema });
const UserIdParamSchema = z.object({ userId: UuidSchema });

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // /me — sites du producteur courant

  typed.get(
    '/v1/sites/me',
    { schema: { response: { 200: SiteListResponseSchema } } },
    async (req) => {
      const user = requireUser(req);
      const sites = await siteService.listMine(user.id);
      return { sites };
    },
  );

  typed.post(
    '/v1/sites/me',
    {
      schema: {
        body: SiteCreateSchema,
        response: { 201: SiteOutputSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      const created = await siteService.create(user.id, req.body, req);
      return reply.code(201).send(created);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // /:id — update / archive (owner ou admin)

  typed.patch(
    '/v1/sites/:id',
    {
      schema: {
        params: SiteIdParamSchema,
        body: SiteUpdateSchema,
        response: { 200: SiteOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      // Ownership check : on charge juste producerUserId pour vérifier
      const owner = await prisma.productionSite.findUnique({
        where: { id: req.params.id },
        select: { producerUserId: true },
      });
      if (!owner) {
        // 404 ici plutôt qu'au service pour avoir un message clair côté route.
        throw new (await import('@mata/shared/errors')).DomainError(
          'NOT_FOUND',
          'Site introuvable',
        );
      }
      assertOwnership(req, owner.producerUserId);
      return siteService.update(user.id, req.params.id, req.body, req);
    },
  );

  typed.post(
    '/v1/sites/:id/archive',
    {
      schema: {
        params: SiteIdParamSchema,
        response: { 200: SiteOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const owner = await prisma.productionSite.findUnique({
        where: { id: req.params.id },
        select: { producerUserId: true },
      });
      if (!owner) {
        throw new (await import('@mata/shared/errors')).DomainError(
          'NOT_FOUND',
          'Site introuvable',
        );
      }
      assertOwnership(req, owner.producerUserId);
      return siteService.archive(user.id, req.params.id, req);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Admin : sites d'un producteur précis (avec archivés)

  typed.get(
    '/v1/producers/:userId/sites',
    {
      schema: {
        params: UserIdParamSchema,
        response: { 200: SiteListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const sites = await siteService.listForProducerAdmin(req.params.userId);
      return { sites };
    },
  );
}
