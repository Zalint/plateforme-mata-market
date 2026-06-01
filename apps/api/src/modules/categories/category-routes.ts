import {
  CategoryCreateSchema,
  CategoryListResponseSchema,
  CategoryOutputSchema,
  CategoryUpdateSchema,
  ProductCategorySchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { categoryService } from './category-service.js';

/**
 * Routes Catégories produit (taxonomie data-driven).
 *
 *  - GET   /v1/categories         : catégories ACTIVES (tout JWT valide), comme /v1/zones.
 *  - GET   /v1/admin/categories   : toutes (admin), inclut les désactivées.
 *  - POST  /v1/admin/categories   : créer (admin).
 *  - PATCH /v1/admin/categories/:slug : éditer label/emoji/ordre/actif (admin).
 */
export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/categories',
    { schema: { response: { 200: CategoryListResponseSchema } } },
    async () => {
      const categories = await categoryService.listActive();
      return { categories };
    },
  );

  typed.get(
    '/v1/admin/categories',
    { schema: { response: { 200: CategoryListResponseSchema } } },
    async (req) => {
      requireRole(req, 'admin', 'super_admin');
      const categories = await categoryService.listAll();
      return { categories };
    },
  );

  typed.post(
    '/v1/admin/categories',
    { schema: { body: CategoryCreateSchema, response: { 201: CategoryOutputSchema } } },
    async (req, reply) => {
      requireRole(req, 'admin', 'super_admin');
      const user = requireUser(req);
      const created = await categoryService.create({
        actorUserId: user.id,
        input: req.body,
        request: req,
      });
      return reply.code(201).send(created);
    },
  );

  typed.patch(
    '/v1/admin/categories/:slug',
    {
      schema: {
        params: z.object({ slug: ProductCategorySchema }),
        body: CategoryUpdateSchema,
        response: { 200: CategoryOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin', 'super_admin');
      const user = requireUser(req);
      return categoryService.update({
        actorUserId: user.id,
        slug: req.params.slug,
        input: req.body,
        request: req,
      });
    },
  );
}
