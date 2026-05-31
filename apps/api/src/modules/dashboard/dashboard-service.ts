import type { AdminDashboardKpis } from '@mata/shared/schemas';
import { prisma } from '../../lib/prisma.js';

/**
 * Service Dashboard admin (Lot 9) · agrégats temps réel de l'accueil ADMIN.
 *
 * Lecture Prisma directe multi-tables (même approche que
 * `paymentService.getMonthlyKpis`) : ce sont des compteurs/sommes de
 * reporting, pas une mutation métier. Aucune écriture, aucun audit.
 */
async function getKpisInternal(now: Date = new Date()): Promise<AdminDashboardKpis> {
  // Bornes du jour courant en UTC [dayStart, nextDayStart).
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextDayStart = new Date(dayStart);
  nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);

  const [
    producteursActifs,
    pendingProducteurs,
    offresEnAttente,
    commandesDuJourAgg,
    reversementsPretsAgg,
  ] = await Promise.all([
    prisma.producerProfile.count({ where: { status: 'validated' } }),
    prisma.producerProfile.count({ where: { status: 'pending' } }),
    prisma.offer.count({ where: { status: 'pending' } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: dayStart, lt: nextDayStart } },
      _count: { _all: true },
      _sum: { totalFcfa: true },
    }),
    prisma.payout.aggregate({
      where: { status: 'pending' },
      _count: { _all: true },
      _sum: { amountFcfa: true },
    }),
  ]);

  return {
    producteursActifs,
    pendingProducteurs,
    offresEnAttente,
    commandesDuJour: commandesDuJourAgg._count._all,
    montantDuJourFcfa: commandesDuJourAgg._sum.totalFcfa ?? 0,
    reversementsPretsCount: reversementsPretsAgg._count._all,
    reversementsPretsFcfa: reversementsPretsAgg._sum.amountFcfa ?? 0,
  };
}

export const dashboardService = {
  getKpis: getKpisInternal,
};
