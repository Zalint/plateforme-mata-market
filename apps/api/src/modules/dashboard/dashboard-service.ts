import type {
  AdminDashboardKpis,
  ClientDashboardKpis,
  ProducerDashboardKpis,
} from '@mata/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { payoutService } from '../payouts/index.js';

/** Bornes [début, fin) du mois courant en UTC. */
function monthBounds(now: Date): { start: Date; next: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, next };
}

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

/**
 * KPIs de l'accueil PRODUCTEUR. « À recevoir » réutilise `payoutService`
 * (interface publique §G3) : part producteur des commandes livrées+payées non
 * encore reversées. Lecture seule, pas d'audit.
 */
async function getProducerKpisInternal(
  producerUserId: string,
  now: Date = new Date(),
): Promise<ProducerDashboardKpis> {
  const { start, next } = monthBounds(now);

  const [offresActives, commandesDuMois, ratingAgg, pending] = await Promise.all([
    prisma.offer.count({ where: { producerUserId, status: 'validated' } }),
    prisma.order.count({
      where: {
        createdAt: { gte: start, lt: next },
        items: { some: { producerUserId } },
      },
    }),
    prisma.producerRating.aggregate({
      where: { producerUserId },
      _avg: { stars: true },
      _count: { _all: true },
    }),
    payoutService.computePending(),
  ]);

  const summary = pending.summaries.find((s) => s.producerUserId === producerUserId);

  return {
    offresActives,
    aRecevoirFcfa: summary?.amountFcfa ?? 0,
    commandesDuMois,
    ratingAvg: ratingAgg._avg.stars === null ? null : Math.round(ratingAgg._avg.stars * 10) / 10,
    ratingCount: ratingAgg._count._all,
  };
}

/**
 * KPIs de l'accueil CLIENT. Compte les commandes en cours / livrées, le total
 * dépensé (commandes payées) et la date de la prochaine livraison prévue.
 */
async function getClientKpisInternal(clientUserId: string): Promise<ClientDashboardKpis> {
  const [commandesEnCours, commandesLivrees, depenseAgg, nextDelivery] = await Promise.all([
    prisma.order.count({
      where: { clientUserId, status: { notIn: ['delivered', 'cancelled'] } },
    }),
    prisma.order.count({ where: { clientUserId, status: 'delivered' } }),
    prisma.order.aggregate({
      where: { clientUserId, paymentStatus: 'paid' },
      _sum: { totalFcfa: true },
    }),
    prisma.order.findFirst({
      where: { clientUserId, status: { notIn: ['delivered', 'cancelled'] } },
      orderBy: { deliverySlotDate: 'asc' },
      select: { deliverySlotDate: true },
    }),
  ]);

  return {
    commandesEnCours,
    commandesLivrees,
    totalDepenseFcfa: depenseAgg._sum.totalFcfa ?? 0,
    prochaineLivraison: nextDelivery
      ? nextDelivery.deliverySlotDate.toISOString().slice(0, 10)
      : null,
  };
}

export const dashboardService = {
  getKpis: getKpisInternal,
  getProducerKpis: getProducerKpisInternal,
  getClientKpis: getClientKpisInternal,
};
