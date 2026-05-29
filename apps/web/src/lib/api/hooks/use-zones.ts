'use client';

import type { ZoneListResponse } from '@mata/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

export function useZones() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['zones'],
    queryFn: ({ signal }) => apiClient.get<ZoneListResponse>('/v1/zones', token, signal),
    enabled: !!token,
    staleTime: 5 * 60_000, // 5 min — les zones changent rarement
  });
}
