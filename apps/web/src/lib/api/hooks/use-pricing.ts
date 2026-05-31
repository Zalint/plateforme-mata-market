'use client';

import type {
  PricingRuleCreate,
  PricingRuleListQuery,
  PricingRuleListResponse,
  PricingRuleOutput,
  PricingRuleUpdate,
  PricingSimulateInput,
  PricingSimulateOutput,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

// ─────────────────────────────────────────────────────────────────
// Queries

export function usePricingRules(query: PricingRuleListQuery = {}) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['pricing', 'rules', query],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      return apiClient.get<PricingRuleListResponse>(
        `/v1/pricing/rules${qs ? `?${qs}` : ''}`,
        token,
        signal,
      );
    },
    enabled: !!token,
  });
}

export function usePricingRule(id: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['pricing', 'rule', id],
    queryFn: ({ signal }) =>
      apiClient.get<PricingRuleOutput>(`/v1/pricing/rules/${id}`, token, signal),
    enabled: !!token && !!id,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations

export function useCreatePricingRule() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PricingRuleCreate) =>
      apiClient.post<PricingRuleOutput>('/v1/pricing/rules', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pricing'] });
    },
  });
}

export function useUpdatePricingRule() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; data: PricingRuleUpdate }) =>
      apiClient.patch<PricingRuleOutput>(`/v1/pricing/rules/${input.id}`, input.data, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pricing'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Simulate (POST, mais utilisé comme une lecture — TanStack useQuery
// avec body sérialisé en clé de cache pour debounce naturel).

export function useSimulatePricing(input: PricingSimulateInput | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['pricing', 'simulate', input],
    queryFn: ({ signal }) =>
      apiClient.post<PricingSimulateOutput>('/v1/pricing/simulate', input, token, signal),
    enabled: !!token && !!input,
    // Évite les re-fetches en boucle pendant que l'admin tape.
    staleTime: 1_000,
  });
}
