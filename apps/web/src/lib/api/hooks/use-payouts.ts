'use client';

import type { PayoutStatus } from '@mata/shared/constants';
import type { PayoutListResponse, PayoutOutput, PayoutPendingResponse } from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/**
 * Hooks TanStack pour les reversements producteurs Lot 5.
 */

// ─────────────────────────────────────────────────────────────────
// Queries

export function usePayoutsPending() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['payouts', 'pending'],
    queryFn: ({ signal }) =>
      apiClient.get<PayoutPendingResponse>('/v1/payouts/pending', token, signal),
    enabled: !!token,
  });
}

export function useAdminPayouts(status?: PayoutStatus) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['payouts', 'admin', status ?? 'all'],
    queryFn: ({ signal }) => {
      const path = status ? `/v1/payouts?status=${status}` : '/v1/payouts';
      return apiClient.get<PayoutListResponse>(path, token, signal);
    },
    enabled: !!token,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations

export function useTriggerPayout() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { producerUserId: string }) =>
      apiClient.post<PayoutOutput>(`/v1/payouts/${input.producerUserId}/trigger`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payouts'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useBlockPayout() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      apiClient.post<{ blocked: boolean }>(
        `/v1/payouts/${input.id}/block`,
        { reason: input.reason },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payouts'] });
    },
  });
}
