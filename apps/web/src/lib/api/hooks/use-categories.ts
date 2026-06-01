'use client';

import type {
  CategoryCreate,
  CategoryListResponse,
  CategoryOutput,
  CategoryUpdate,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/**
 * Hooks Catégories produit (taxonomie data-driven, table product_categories).
 *
 * - useGuestCategories : catégories actives SANS token (catalogue invité `/`).
 * - useCategories      : catégories actives avec token (pages authentifiées).
 * - useAdminCategories : toutes (admin), inclut les désactivées.
 * - useCreateCategory / useUpdateCategory : mutations admin.
 *
 * Les catégories changent rarement → `staleTime` 5 min.
 */

const STALE = 5 * 60_000;

/** Catalogue invité (`/`) — pas de JWT. */
export function useGuestCategories() {
  return useQuery({
    queryKey: ['categories', 'guest'],
    queryFn: ({ signal }) =>
      apiClient.get<CategoryListResponse>('/v1/guest/categories', null, signal),
    staleTime: STALE,
  });
}

/** Pages authentifiées (client / producteur). */
export function useCategories() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['categories', 'active'],
    queryFn: ({ signal }) => apiClient.get<CategoryListResponse>('/v1/categories', token, signal),
    enabled: !!token,
    staleTime: STALE,
  });
}

/** Vue admin : toutes les catégories (actives + désactivées). */
export function useAdminCategories() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['categories', 'admin'],
    queryFn: ({ signal }) =>
      apiClient.get<CategoryListResponse>('/v1/admin/categories', token, signal),
    enabled: !!token,
  });
}

export function useCreateCategory() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryCreate) =>
      apiClient.post<CategoryOutput>('/v1/admin/categories', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateCategory() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; data: CategoryUpdate }) =>
      apiClient.patch<CategoryOutput>(`/v1/admin/categories/${input.slug}`, input.data, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
