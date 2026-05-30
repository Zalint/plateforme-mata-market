'use client';

import type {
  CatalogOfferDetail,
  CatalogOfferListQuery,
  CatalogOfferListResponse,
} from '@mata/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

export function useCatalogOffers(query: CatalogOfferListQuery) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['catalog', 'offers', query],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return apiClient.get<CatalogOfferListResponse>(
        `/v1/catalog/offers?${params.toString()}`,
        token,
        signal,
      );
    },
    enabled: !!token,
  });
}

export function useCatalogOffer(id: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['catalog', 'offers', id],
    queryFn: ({ signal }) =>
      apiClient.get<CatalogOfferDetail>(`/v1/catalog/offers/${id}`, token, signal),
    enabled: !!token && !!id,
  });
}
