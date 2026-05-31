import { z } from 'zod';
import { FcfaAmountSchema } from './common.js';

/**
 * Schemas Dashboard admin · KPIs de l'accueil ADMIN (mockup §1885 KPI grid).
 *
 * Agrégats temps réel exposés par `GET /v1/admin/dashboard/kpis` :
 *  - producteursActifs / pendingProducteurs : profils validés / en attente
 *  - offresEnAttente                        : offres status=pending
 *  - commandesDuJour / montantDuJourFcfa    : orders créées aujourd'hui (UTC)
 *  - reversementsPretsCount / *Fcfa         : payouts status=pending (à envoyer)
 */
export const AdminDashboardKpisSchema = z.object({
  producteursActifs: z.number().int().nonnegative(),
  pendingProducteurs: z.number().int().nonnegative(),
  offresEnAttente: z.number().int().nonnegative(),
  commandesDuJour: z.number().int().nonnegative(),
  montantDuJourFcfa: FcfaAmountSchema,
  reversementsPretsCount: z.number().int().nonnegative(),
  reversementsPretsFcfa: FcfaAmountSchema,
});

export type AdminDashboardKpis = z.infer<typeof AdminDashboardKpisSchema>;
