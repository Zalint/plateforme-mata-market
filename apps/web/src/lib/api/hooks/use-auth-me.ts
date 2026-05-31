'use client';

import type { AuthMeResponse } from '@mata/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/**
 * Identité de l'utilisateur connecté (`GET /v1/auth/me`) : displayName, rôle,
 * et éventuelle session déléguée téléconseil (`actingOnBehalfOf`).
 */
export function useMe() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: ({ signal }) => apiClient.get<AuthMeResponse>('/v1/auth/me', token, signal),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
}
