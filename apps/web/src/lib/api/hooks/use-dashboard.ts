'use client';

import type { AdminDashboardKpis } from '@mata/shared/schemas';
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
