'use client';

import type { SiteCreate, SiteListResponse, SiteOutput, SiteUpdate } from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

export function useMySites() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['sites', 'me'],
    queryFn: ({ signal }) => apiClient.get<SiteListResponse>('/v1/sites/me', token, signal),
    enabled: !!token,
  });
}

export function useCreateSite() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteCreate) => apiClient.post<SiteOutput>('/v1/sites/me', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useUpdateSite() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; data: SiteUpdate }) =>
      apiClient.patch<SiteOutput>(`/v1/sites/${input.id}`, input.data, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useArchiveSite() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<SiteOutput>(`/v1/sites/${id}/archive`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
