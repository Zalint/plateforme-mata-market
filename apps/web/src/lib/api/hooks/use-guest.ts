'use client';

import type {
  CreateGuestOrder,
  CreateGuestPaymentIntent,
  GuestCatalogOfferListQuery,
  GuestCatalogOfferListResponse,
  OrderOutput,
  PaymentIntentResponse,
  ZoneListResponse,
} from '@mata/shared/schemas';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../http-client';

/**
 * Hooks TanStack pour le mode invité (Lot 8) — routes publiques `/v1/guest/*`.
 *
 * Aucune de ces routes n'exige de JWT : on passe donc `null` comme token à
 * `apiClient`. Le catalogue invité est MASQUÉ (identité producteur cachée côté
 * serveur, cf. CLAUDE.md §G3).
 *
 * Référence : ARCHITECTURE.md §3, mockup §guest/checkout.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────
// Queries (lecture publique)

export function useGuestZones() {
  return useQuery({
    queryKey: ['guest', 'zones'],
    queryFn: ({ signal }) => apiClient.get<ZoneListResponse>('/v1/guest/zones', null, signal),
    staleTime: 5 * 60_000, // 5 min — les zones changent rarement
  });
}

export function useGuestCatalog(query: GuestCatalogOfferListQuery) {
  return useQuery({
    queryKey: ['guest', 'catalog', query],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return apiClient.get<GuestCatalogOfferListResponse>(
        `/v1/guest/catalog/offers?${params.toString()}`,
        null,
        signal,
      );
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations (écriture, rate-limit strict côté serveur)

/**
 * Crée une commande invité. L'`idempotencyKey` (UUID v4) est fournie par le
 * caller — même politique que `useCreateOrder` : un double-click doit produire
 * la même commande (donc la même clé), pas un doublon.
 */
export function useCreateGuestOrder() {
  return useMutation({
    mutationFn: async (input: {
      idempotencyKey: string;
      body: CreateGuestOrder;
    }): Promise<OrderOutput> => {
      const res = await fetch(`${API_BASE}/v1/guest/orders`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.idempotencyKey,
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
  });
}

/**
 * Crée un payment intent Bictorys pour une commande invité `online` déjà créée.
 * L'ownership est vérifié serveur-side via (orderId + guestPhoneNumber).
 */
export function useCreateGuestPaymentIntent() {
  return useMutation({
    mutationFn: (input: CreateGuestPaymentIntent) =>
      apiClient.post<PaymentIntentResponse>('/v1/guest/payments/intents', input, null),
  });
}
