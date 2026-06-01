import { DomainError } from '@mata/shared/errors';
import type { CategoryCreate, CategoryOutput, CategoryUpdate } from '@mata/shared/schemas';
import type { Category } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';

/**
 * Service Catégories produit (taxonomie data-driven, table product_categories).
 *
 * - Lecture publique authentifiée : `listActive` (catalogue, formulaires).
 * - Admin : `listAll` + `create` + `update` (label/emoji/ordre/actif).
 *
 * On ne SUPPRIME jamais une catégorie (FK offers/pricing_rules) : on la
 * désactive (`isActive=false`) — elle disparaît des listes mais les offres
 * existantes restent cohérentes. Audit_log à chaque mutation (§G3).
 */

function toOutput(c: Category): CategoryOutput {
  return {
    slug: c.slug,
    labelFr: c.labelFr,
    emoji: c.emoji,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const orderBy = [{ sortOrder: 'asc' as const }, { slug: 'asc' as const }];

export const categoryService = {
  /** Catégories actives uniquement (catalogue + sélecteurs d'offre). */
  async listActive(): Promise<CategoryOutput[]> {
    const rows = await prisma.category.findMany({ where: { isActive: true }, orderBy });
    return rows.map(toOutput);
  },

  /** Toutes les catégories (vue admin, inclut les désactivées). */
  async listAll(): Promise<CategoryOutput[]> {
    const rows = await prisma.category.findMany({ orderBy });
    return rows.map(toOutput);
  },

  async create(args: {
    actorUserId: string;
    input: CategoryCreate;
    request?: FastifyRequest;
  }): Promise<CategoryOutput> {
    const exists = await prisma.category.findUnique({
      where: { slug: args.input.slug },
      select: { slug: true },
    });
    if (exists) {
      throw new DomainError('CONFLICT', `Catégorie déjà existante : ${args.input.slug}`);
    }
    const created = await prisma.category.create({
      data: {
        slug: args.input.slug,
        labelFr: args.input.labelFr,
        emoji: args.input.emoji,
        sortOrder: args.input.sortOrder ?? 0,
      },
    });
    await auditService.log({
      actorUserId: args.actorUserId,
      action: 'category.create',
      targetType: 'category',
      targetId: created.slug,
      newValue: { slug: created.slug, labelFr: created.labelFr, emoji: created.emoji },
      request: args.request,
    });
    return toOutput(created);
  },

  async update(args: {
    actorUserId: string;
    slug: string;
    input: CategoryUpdate;
    request?: FastifyRequest;
  }): Promise<CategoryOutput> {
    const existing = await prisma.category.findUnique({ where: { slug: args.slug } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Catégorie introuvable');

    const updated = await prisma.category.update({
      where: { slug: args.slug },
      data: {
        labelFr: args.input.labelFr,
        emoji: args.input.emoji,
        sortOrder: args.input.sortOrder,
        isActive: args.input.isActive,
      },
    });
    await auditService.log({
      actorUserId: args.actorUserId,
      action: 'category.update',
      targetType: 'category',
      targetId: args.slug,
      oldValue: {
        labelFr: existing.labelFr,
        emoji: existing.emoji,
        sortOrder: existing.sortOrder,
        isActive: existing.isActive,
      },
      newValue: {
        labelFr: updated.labelFr,
        emoji: updated.emoji,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
      },
      request: args.request,
    });
    return toOutput(updated);
  },
};
