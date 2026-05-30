import { DomainError } from '@mata/shared/errors';
import type { SiteCreate, SiteOutput, SiteUpdate } from '@mata/shared/schemas';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { toSiteOutput } from './mappers.js';

/**
 * Service sites · CRUD producer self + lecture admin.
 *
 * Soft-delete interdit (CLAUDE.md §G4). On utilise `status='archived'` pour
 * masquer un site sans casser les FK des offres déjà rattachées (cf.
 * `production_sites.status` enum et `offers.site_id ON DELETE RESTRICT`).
 */

export const siteService = {
  async listMine(producerUserId: string): Promise<SiteOutput[]> {
    const rows = await prisma.productionSite.findMany({
      where: { producerUserId, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSiteOutput);
  },

  async listForProducerAdmin(producerUserId: string): Promise<SiteOutput[]> {
    // Admin voit aussi les sites archivés (pour audit / réactivation manuelle).
    const rows = await prisma.productionSite.findMany({
      where: { producerUserId },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toSiteOutput);
  },

  async getById(id: string): Promise<SiteOutput> {
    const row = await prisma.productionSite.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 'Site introuvable');
    return toSiteOutput(row);
  },

  async create(
    producerUserId: string,
    input: SiteCreate,
    request?: FastifyRequest,
  ): Promise<SiteOutput> {
    // Vérifie l'existence du profil producteur (FK) — message clair plutôt
    // que P2003 brut.
    const profile = await prisma.producerProfile.findUnique({
      where: { userId: producerUserId },
      select: { userId: true },
    });
    if (!profile) {
      throw new DomainError('NOT_FOUND', 'Aucun profil producteur — créez-le avant un site');
    }
    const created = await prisma.productionSite.create({
      data: {
        producerUserId,
        name: input.name,
        type: input.type,
        zoneId: input.zoneId,
        addressLine: input.addressLine,
        geoLat: input.geoLat,
        geoLng: input.geoLng,
        vehicleAccess: input.vehicleAccess,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        pickupHours: input.pickupHours,
      },
    });
    await auditService.log({
      actorUserId: producerUserId,
      action: 'site.create',
      targetType: 'site',
      targetId: created.id,
      newValue: { name: created.name, type: created.type, zoneId: created.zoneId },
      request,
    });
    return toSiteOutput(created);
  },

  /**
   * Update partiel. Le service vérifie l'existence + l'ownership doit avoir
   * été vérifié côté route (assertOwnership).
   */
  async update(
    actorUserId: string,
    siteId: string,
    input: SiteUpdate,
    request?: FastifyRequest,
  ): Promise<SiteOutput> {
    const existing = await prisma.productionSite.findUnique({ where: { id: siteId } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Site introuvable');

    const updated = await prisma.productionSite.update({
      where: { id: siteId },
      data: {
        name: input.name,
        type: input.type,
        zoneId: input.zoneId,
        addressLine: input.addressLine,
        geoLat: input.geoLat,
        geoLng: input.geoLng,
        vehicleAccess: input.vehicleAccess,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        pickupHours: input.pickupHours,
      },
    });
    await auditService.log({
      actorUserId,
      action: 'site.update',
      targetType: 'site',
      targetId: siteId,
      oldValue: { name: existing.name, zoneId: existing.zoneId, type: existing.type },
      newValue: { name: updated.name, zoneId: updated.zoneId, type: updated.type },
      request,
    });
    return toSiteOutput(updated);
  },

  /**
   * Archive un site (status active → archived). Préserve les FK des offres.
   * Refuse 409 si déjà archivé.
   */
  async archive(
    actorUserId: string,
    siteId: string,
    request?: FastifyRequest,
  ): Promise<SiteOutput> {
    const existing = await prisma.productionSite.findUnique({ where: { id: siteId } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Site introuvable');
    if (existing.status === 'archived') {
      throw new DomainError('CONFLICT', 'Site déjà archivé');
    }
    const updated = await prisma.productionSite.update({
      where: { id: siteId },
      data: { status: 'archived' },
    });
    await auditService.log({
      actorUserId,
      action: 'site.archive',
      targetType: 'site',
      targetId: siteId,
      oldValue: { status: 'active' },
      newValue: { status: 'archived' },
      request,
    });
    return toSiteOutput(updated);
  },
};
