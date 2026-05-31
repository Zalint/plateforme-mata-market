'use client';

import type {
  AdminDashboardKpis,
  ClientDashboardKpis,
  ProducerDashboardKpis,
} from '@mata/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/** KPIs de l'accueil ADMIN (producteurs actifs, offres en attente, etc.). */
export function useAdminDashboardKpis() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['admin', 'dashboard', 'kpis'],
    queryFn: ({ signal }) =>
      apiClient.get<AdminDashboardKpis>('/v1/admin/dashboard/kpis', token, signal),
    enabled: !!token,
  });
}

/** KPIs de l'accueil PRODUCTEUR (offres actives, à recevoir, etc.). */
export function useMyProducerDashboardKpis() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['producer', 'dashboard', 'kpis'],
    queryFn: ({ signal }) =>
      apiClient.get<ProducerDashboardKpis>('/v1/producer/dashboard/kpis', token, signal),
    enabled: !!token,
  });
}

/** KPIs de l'accueil CLIENT (commandes en cours, total dépensé, etc.). */
export function useMyClientDashboardKpis() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['client', 'dashboard', 'kpis'],
    queryFn: ({ signal }) =>
      apiClient.get<ClientDashboardKpis>('/v1/client/dashboard/kpis', token, signal),
    enabled: !!token,
  });
}
