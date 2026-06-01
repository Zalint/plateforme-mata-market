'use client';

import type { OfferStatus } from '@mata/shared/constants';
import type {
  OfferAdminListQuery,
  OfferAdminListResponse,
  OfferAttachPhotosInput,
  OfferCreate,
  OfferListResponse,
  OfferOutput,
  OfferUpdate,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

// ─────────────────────────────────────────────────────────────────
// Producer self

export function useMyOffers(status?: OfferStatus) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['offers', 'me', status ?? 'all'],
    queryFn: ({ signal }) => {
      const path = status ? `/v1/offers/me?status=${status}` : '/v1/offers/me';
      return apiClient.get<OfferListResponse>(path, token, signal);
    },
    enabled: !!token,
  });
}

export function useOffer(id: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['offers', id],
    queryFn: ({ signal }) => apiClient.get<OfferOutput>(`/v1/offers/${id}`, token, signal),
    enabled: !!token && !!id,
  });
}

export function useCreateOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OfferCreate) => apiClient.post<OfferOutput>('/v1/offers', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useUpdateOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; data: OfferUpdate }) =>
      apiClient.patch<OfferOutput>(`/v1/offers/${input.id}`, input.data, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useSubmitOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<OfferOutput>(`/v1/offers/${id}/submit`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useWithdrawOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<OfferOutput>(`/v1/offers/${id}/withdraw`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useSuspendOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason?: string }) =>
      apiClient.post<OfferOutput>(
        `/v1/offers/${input.id}/suspend`,
        { reason: input.reason },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useReactivateOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<OfferOutput>(`/v1/offers/${id}/reactivate`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useAttachOfferPhotos() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; publicIds: OfferAttachPhotosInput['publicIds'] }) =>
      apiClient.put<OfferOutput>(
        `/v1/offers/${input.id}/photos`,
        { publicIds: input.publicIds },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Admin

export function useAdminOffers(query: OfferAdminListQuery) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['offers', 'admin', query],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return apiClient.get<OfferAdminListResponse>(
        `/v1/offers?${params.toString()}`,
        token,
        signal,
      );
    },
    enabled: !!token,
  });
}

export function useValidateOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<OfferOutput>(`/v1/offers/${id}/validate`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useRejectOffer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      apiClient.post<OfferOutput>(`/v1/offers/${input.id}/reject`, { reason: input.reason }, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}
