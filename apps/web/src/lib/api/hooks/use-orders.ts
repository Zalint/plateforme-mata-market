'use client';

import type { OrderStatus } from '@mata/shared/constants';
import type {
  OrderCancelInput,
  OrderCreate,
  OrderListResponse,
  OrderOutput,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

// ─────────────────────────────────────────────────────────────────
// Queries

export function useMyOrders() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['orders', 'me'],
    queryFn: ({ signal }) => apiClient.get<OrderListResponse>('/v1/orders/me', token, signal),
    enabled: !!token,
  });
}

export function useReceivedOrders() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['orders', 'received'],
    queryFn: ({ signal }) => apiClient.get<OrderListResponse>('/v1/orders/received', token, signal),
    enabled: !!token,
  });
}

export function useAdminOrders(status?: OrderStatus) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['orders', 'admin', status ?? 'all'],
    queryFn: ({ signal }) => {
      const path = status ? `/v1/orders?status=${status}` : '/v1/orders';
      return apiClient.get<OrderListResponse>(path, token, signal);
    },
    enabled: !!token,
  });
}

export function useOrder(id: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['orders', id],
    queryFn: ({ signal }) => apiClient.get<OrderOutput>(`/v1/orders/${id}`, token, signal),
    enabled: !!token && !!id,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations

/**
 * Crée une commande. L'`idempotencyKey` (UUID v4) est passée par le caller —
 * le hook ne génère PAS de key automatiquement pour ne pas masquer les
 * doubles soumissions involontaires (un click rapide doit produire le
 * même order, donc même key).
 */
export function useCreateOrder() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { idempotencyKey: string; body: OrderCreate }) => {
      const headers = {
        'X-Idempotency-Key': input.idempotencyKey,
      };
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
      const res = await fetch(`${API_BASE}/v1/orders`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...headers,
        },
        body: JSON.stringify(input.body),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          `Échec création commande (${res.status}) — ${(body as { message?: string } | null)?.message ?? 'erreur'}`,
        );
      }
      return body as OrderOutput;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

export function useTransitionOrderStatus() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; to: OrderStatus }) =>
      apiClient.post<OrderOutput>(`/v1/orders/${input.id}/status`, { to: input.to }, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCancelOrder() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: OrderCancelInput['reason'] }) =>
      apiClient.post<OrderOutput>(`/v1/orders/${input.id}/cancel`, { reason: input.reason }, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}
