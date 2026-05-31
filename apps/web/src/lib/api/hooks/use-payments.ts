'use client';

import type { PaymentStatus } from '@mata/shared/constants';
import type {
  PaymentIntentResponse,
  PaymentKpisOutput,
  PaymentListResponse,
  PaymentOutput,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/**
 * Hooks TanStack pour les paiements Lot 5.
 *
 * Référence : ARCHITECTURE.md §7 + mockup §2774 (ADMIN/PAYMENTS).
 */

// ─────────────────────────────────────────────────────────────────
// Queries

export function useAdminPayments(status?: PaymentStatus) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['payments', 'admin', status ?? 'all'],
    queryFn: ({ signal }) => {
      const path = status ? `/v1/payments?status=${status}` : '/v1/payments';
      return apiClient.get<PaymentListResponse>(path, token, signal);
    },
    enabled: !!token,
  });
}

/** KPIs admin du mois (encaissé / commission exacte / frais logistique). */
export function usePaymentKpis() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['payments', 'kpis'],
    queryFn: ({ signal }) => apiClient.get<PaymentKpisOutput>('/v1/payments/kpis', token, signal),
    enabled: !!token,
  });
}

export function usePayment(id: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['payments', id],
    queryFn: ({ signal }) => apiClient.get<PaymentOutput>(`/v1/payments/${id}`, token, signal),
    enabled: !!token && !!id,
  });
}

/**
 * Récupère le payment associé à un order. `null` si pas de payment encore créé.
 * Utilisé par client/orders/[id] pour décider d'afficher le bouton « Payer maintenant ».
 */
export function useOrderPayment(orderId: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['orders', orderId, 'payment'],
    queryFn: ({ signal }) =>
      apiClient.get<PaymentOutput | null>(`/v1/orders/${orderId}/payment`, token, signal),
    enabled: !!token && !!orderId,
  });
}

/**
 * Polling actif sur le status d'un payment — utilisé par la page de retour
 * Bictorys (`/client/payment/return`). `refetchInterval: 2000` jusqu'à ce que
 * le status quitte 'pending'.
 */
export function usePaymentPolling(id: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['payments', id, 'polling'],
    queryFn: ({ signal }) => apiClient.get<PaymentOutput>(`/v1/payments/${id}`, token, signal),
    enabled: !!token && !!id,
    refetchInterval: (query) => {
      const data = query.state.data as PaymentOutput | undefined;
      if (!data) return 2000;
      return data.status === 'pending' ? 2000 : false;
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations

export function useCreatePaymentIntent() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string }) =>
      apiClient.post<PaymentIntentResponse>('/v1/payments/intents', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
