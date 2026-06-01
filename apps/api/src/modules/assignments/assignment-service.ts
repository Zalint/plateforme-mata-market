import { DomainError } from '@mata/shared/errors';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';

/**
 * Service affectations producteur ↔ téléconseiller — PORTÉE DE MODÉRATION.
 *
 * Un téléconseiller modère (valider/refuser/retirer/suspendre…) uniquement les
 * offres des producteurs qui lui sont affectés. `allProducers = true` lui donne
 * la portée globale (comme un admin). Défaut (aucune affectation +
 * allProducers false) ⇒ aucune offre visible.
 *
 * N'affecte PAS la délégation (cf. schema.prisma, bloc TeleconsultantAssignment).
 *
 * Référence : CLAUDE.md §G3 (audit), §G8 (permissions explicites).
 */

export type TeleconsultantScopeView = {
  allProducers: boolean;
  producerUserIds: string[];
};

export const assignmentService = {
  /** Portée d'un téléconseiller : drapeau global + liste de producteurs affectés. */
  async getScopeForTeleconsultant(teleconsultantUserId: string): Promise<TeleconsultantScopeView> {
    const [scope, assignments] = await Promise.all([
      prisma.teleconsultantScope.findUnique({ where: { teleconsultantUserId } }),
      prisma.teleconsultantAssignment.findMany({
        where: { teleconsultantUserId },
        select: { producerUserId: true },
      }),
    ]);
    return {
      allProducers: scope?.allProducers ?? false,
      producerUserIds: assignments.map((a) => a.producerUserId),
    };
  },

  /**
   * Remplace la portée d'un téléconseiller (toggle `allProducers` + liste de
   * producteurs cochés). Transactionnel : upsert scope + delete/recreate des
   * affectations. Audité.
   */
  async setScopeForTeleconsultant(input: {
    teleconsultantUserId: string;
    allProducers: boolean;
    producerUserIds: string[];
    actorUserId: string;
    request?: FastifyRequest;
  }): Promise<TeleconsultantScopeView> {
    const tc = await prisma.user.findUnique({
      where: { id: input.teleconsultantUserId },
      select: { role: true },
    });
    if (!tc || tc.role !== 'teleconsultant') {
      throw new DomainError('VALIDATION', 'La cible doit être un téléconseiller');
    }

    const producerIds = [...new Set(input.producerUserIds)];
    if (producerIds.length > 0) {
      const validProducers = await prisma.user.count({
        where: { id: { in: producerIds }, role: 'producer' },
      });
      if (validProducers !== producerIds.length) {
        throw new DomainError(
          'VALIDATION',
          'Un ou plusieurs identifiants ne sont pas des producteurs',
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.teleconsultantScope.upsert({
        where: { teleconsultantUserId: input.teleconsultantUserId },
        update: { allProducers: input.allProducers, updatedByUserId: input.actorUserId },
        create: {
          teleconsultantUserId: input.teleconsultantUserId,
          allProducers: input.allProducers,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.teleconsultantAssignment.deleteMany({
        where: { teleconsultantUserId: input.teleconsultantUserId },
      });
      if (producerIds.length > 0) {
        await tx.teleconsultantAssignment.createMany({
          data: producerIds.map((producerUserId) => ({
            teleconsultantUserId: input.teleconsultantUserId,
            producerUserId,
            assignedByUserId: input.actorUserId,
          })),
        });
      }
    });

    await auditService.log({
      actorUserId: input.actorUserId,
      action: 'teleconsultant.assignment.set',
      targetType: 'user',
      targetId: input.teleconsultantUserId,
      newValue: { allProducers: input.allProducers, producerUserIds: producerIds },
      request: input.request,
    });

    return this.getScopeForTeleconsultant(input.teleconsultantUserId);
  },

  /**
   * Contexte complet de l'écran admin « Affectations » en un appel :
   *  - téléconseillers (avec leur drapeau `allProducers`)
   *  - producteurs (avec zone + la liste des téléconseillers qui les couvrent,
   *    pour visualiser le M:N / les chevauchements)
   */
  async getAssignmentContext(): Promise<{
    teleconsultants: { id: string; displayName: string; allProducers: boolean }[];
    producers: {
      id: string;
      displayName: string;
      zoneName: string | null;
      teleconsultantUserIds: string[];
    }[];
  }> {
    const [teleconsultants, scopes, producers, assignments] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'teleconsultant' },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
      }),
      prisma.teleconsultantScope.findMany({
        select: { teleconsultantUserId: true, allProducers: true },
      }),
      prisma.user.findMany({
        where: { role: 'producer' },
        select: {
          id: true,
          displayName: true,
          producerProfile: { select: { zone: { select: { name: true } } } },
        },
        orderBy: { displayName: 'asc' },
      }),
      prisma.teleconsultantAssignment.findMany({
        select: { teleconsultantUserId: true, producerUserId: true },
      }),
    ]);

    const allFlag = new Map(scopes.map((s) => [s.teleconsultantUserId, s.allProducers]));
    const coverage = new Map<string, string[]>();
    for (const a of assignments) {
      const list = coverage.get(a.producerUserId) ?? [];
      list.push(a.teleconsultantUserId);
      coverage.set(a.producerUserId, list);
    }

    return {
      teleconsultants: teleconsultants.map((t) => ({
        id: t.id,
        displayName: t.displayName,
        allProducers: allFlag.get(t.id) ?? false,
      })),
      producers: producers.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        zoneName: p.producerProfile?.zone?.name ?? null,
        teleconsultantUserIds: coverage.get(p.id) ?? [],
      })),
    };
  },
};
