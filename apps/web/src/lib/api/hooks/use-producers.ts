'use client';

import type {
  BankDetailsClear,
  BankDetailsRevealResponse,
  ProducerAdminListQuery,
  ProducerAdminListResponse,
  ProducerOnboardInput,
  ProducerOnboardResponse,
  ProducerProfileAdmin,
  ProducerProfileCreate,
  ProducerProfilePublic,
  ProducerProfileUpdate,
  ProducerRatingCreate,
  ProducerRatingListResponse,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

type MyProfileResponse = { profile: ProducerProfilePublic | null };

// ─────────────────────────────────────────────────────────────────
// Producer self

export function useMyProducerProfile() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['producer', 'me'],
    queryFn: ({ signal }) => apiClient.get<MyProfileResponse>('/v1/producers/me', token, signal),
    enabled: !!token,
  });
}

export function useCreateMyProducerProfile() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProducerProfileCreate) =>
      apiClient.post<ProducerProfilePublic>('/v1/producers/me', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['producer', 'me'] });
    },
  });
}

export function useUpdateMyProducerProfile() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProducerProfileUpdate) =>
      apiClient.patch<ProducerProfilePublic>('/v1/producers/me', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['producer', 'me'] });
    },
  });
}

export function useUpdateMyBankDetails() {
  const token = useAuthToken();
  return useMutation({
    mutationFn: (input: BankDetailsClear) =>
      apiClient.put<void>('/v1/producers/me/bank-details', input, token),
  });
}

// ─────────────────────────────────────────────────────────────────
// Onboarding par le staff (téléconseiller / admin)

/**
 * Crée un producteur pour le compte d'un tiers (téléconseiller ou admin).
 * Provisionne un compte Keycloak + profil `pending` et renvoie le mot de passe
 * temporaire UNE SEULE FOIS (à communiquer au producteur, jamais re-consultable).
 */
export function useOnboardProducer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProducerOnboardInput) =>
      apiClient.post<ProducerOnboardResponse>('/v1/producers', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['producers', 'admin'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Admin

export function useAdminProducers(query: ProducerAdminListQuery) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['producers', 'admin', query],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return apiClient.get<ProducerAdminListResponse>(
        `/v1/producers?${params.toString()}`,
        token,
        signal,
      );
    },
    enabled: !!token,
  });
}

export function useAdminProducer(userId: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['producers', 'admin', userId],
    queryFn: ({ signal }) =>
      apiClient.get<ProducerProfileAdmin>(`/v1/producers/${userId}`, token, signal),
    enabled: !!token && !!userId,
  });
}

/** Avis individuels d'un producteur (admin · détail). */
export function useProducerRatings(userId: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['producers', 'admin', userId, 'ratings'],
    queryFn: ({ signal }) =>
      apiClient.get<ProducerRatingListResponse>(`/v1/producers/${userId}/ratings`, token, signal),
    enabled: !!token && !!userId,
  });
}

export function useValidateProducer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post<ProducerProfilePublic>(`/v1/producers/${userId}/validate`, {}, token),
    onSuccess: (_, userId) => {
      void qc.invalidateQueries({ queryKey: ['producers', 'admin'] });
      void qc.invalidateQueries({ queryKey: ['producers', 'admin', userId] });
    },
  });
}

export function useSuspendProducer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; reason: string }) =>
      apiClient.post<ProducerProfilePublic>(
        `/v1/producers/${input.userId}/suspend`,
        { reason: input.reason },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['producers', 'admin'] });
    },
  });
}

export function useBlacklistProducer() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; reason: string }) =>
      apiClient.post<ProducerProfilePublic>(
        `/v1/producers/${input.userId}/blacklist`,
        { reason: input.reason },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['producers', 'admin'] });
    },
  });
}

/** Notation d'un producteur (client authentifié, commande livrée). */
export function useRateProducer() {
  const token = useAuthToken();
  return useMutation({
    mutationFn: (input: { producerUserId: string; data: ProducerRatingCreate }) =>
      apiClient.post<void>(`/v1/producers/${input.producerUserId}/ratings`, input.data, token),
  });
}

/** Notation au niveau commande (le client note sa commande, pas le producteur). */
export function useRateOrder() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string; stars: number; comment?: string }) =>
      apiClient.post<void>(
        `/v1/orders/${input.orderId}/rate`,
        { stars: input.stars, comment: input.comment },
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useRevealBankDetails() {
  const token = useAuthToken();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post<BankDetailsRevealResponse>(
        `/v1/producers/${userId}/bank-details/reveal`,
        {},
        token,
      ),
  });
}
