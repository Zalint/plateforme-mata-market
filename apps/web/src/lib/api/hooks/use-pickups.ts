'use client';

import type { PickupStatus } from '@mata/shared/constants';
import type { PickupCreate, PickupListResponse, PickupOutput } from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

// ─────────────────────────────────────────────────────────────────
// Queries

export function useAdminPickups(status?: PickupStatus, zoneId?: string) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['pickups', 'admin', status ?? 'all', zoneId ?? 'all'],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (zoneId) params.set('zoneId', zoneId);
      const qs = params.toString();
      return apiClient.get<PickupListResponse>(
        qs ? `/v1/pickups?${qs}` : '/v1/pickups',
        token,
        signal,
      );
    },
    enabled: !!token,
  });
}

export function useMyPickups() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['pickups', 'mine'],
    queryFn: ({ signal }) => apiClient.get<PickupListResponse>('/v1/pickups/mine', token, signal),
    enabled: !!token,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations

export function useCreatePickup() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PickupCreate) => apiClient.post<PickupOutput>('/v1/pickups', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pickups'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useTransitionPickupStatus() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; to: PickupStatus }) =>
      apiClient.post<PickupOutput>(`/v1/pickups/${input.id}/status`, { to: input.to }, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pickups'] });
    },
  });
}

export function useCancelPickup() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      apiClient.post<PickupOutput>(
        `/v1/pickups/${input.id}/cancel`,
        { reason: input.reason },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pickups'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCheckPickupItem() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; itemId: string; collected: boolean; notes?: string }) =>
      apiClient.post<PickupOutput>(
        `/v1/pickups/${input.id}/items/${input.itemId}/check`,
        { collected: input.collected, notes: input.notes },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pickups'] });
    },
  });
}
