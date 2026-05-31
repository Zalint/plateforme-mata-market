import { z } from 'zod';
import { FcfaAmountNonNegativeSchema } from './common.js';

/**
 * Schemas Dashboard · KPIs des accueils par rôle.
 *
 * Les montants sont des AGRÉGATS (`FcfaAmountNonNegativeSchema`, ≥ 0) : une
 * somme peut valoir 0 (aucune commande du jour, aucun reversement). Utiliser
 * `FcfaAmountSchema` (strictement > 0) ferait échouer la validation de réponse
 * Fastify dès qu'un total vaut 0 (→ 500).
 */

/**
 * KPIs de l'accueil ADMIN (mockup §1885 KPI grid). Agrégats temps réel exposés
 * par `GET /v1/admin/dashboard/kpis` :
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
  montantDuJourFcfa: FcfaAmountNonNegativeSchema,
  reversementsPretsCount: z.number().int().nonnegative(),
  reversementsPretsFcfa: FcfaAmountNonNegativeSchema,
});

export type AdminDashboardKpis = z.infer<typeof AdminDashboardKpisSchema>;

/**
 * KPIs de l'accueil PRODUCTEUR (`GET /v1/producer/dashboard/kpis`) :
 *  - offresActives  : offres du producteur en statut `validated`
 *  - aRecevoirFcfa  : part producteur des commandes livrées+payées non encore
 *                     reversées (= pending payout du producteur)
 *  - commandesDuMois: commandes créées ce mois-ci avec un item du producteur
 *  - ratingAvg / ratingCount : note moyenne (null si aucun avis) + nb d'avis
 */
export const ProducerDashboardKpisSchema = z.object({
  offresActives: z.number().int().nonnegative(),
  aRecevoirFcfa: FcfaAmountNonNegativeSchema,
  commandesDuMois: z.number().int().nonnegative(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int().nonnegative(),
});

export type ProducerDashboardKpis = z.infer<typeof ProducerDashboardKpisSchema>;

/**
 * KPIs de l'accueil CLIENT (`GET /v1/client/dashboard/kpis`) :
 *  - commandesEnCours  : commandes non terminées (ni livrées ni annulées)
 *  - commandesLivrees   : commandes livrées
 *  - totalDepenseFcfa   : somme des totaux des commandes payées
 *  - prochaineLivraison : date (YYYY-MM-DD) de la prochaine livraison prévue,
 *                         null si aucune commande active
 */
export const ClientDashboardKpisSchema = z.object({
  commandesEnCours: z.number().int().nonnegative(),
  commandesLivrees: z.number().int().nonnegative(),
  totalDepenseFcfa: FcfaAmountNonNegativeSchema,
  prochaineLivraison: z.string().nullable(),
});

export type ClientDashboardKpis = z.infer<typeof ClientDashboardKpisSchema>;
