'use client';

import type {
  AssignmentContextResponse,
  AssignmentScopeInput,
  AssignmentScopeOutput,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/**
 * Hooks Affectations producteur ↔ téléconseiller (portée de modération, admin).
 *
 * - useAssignmentContext : données de l'écran (téléconseillers + producteurs + couverture).
 * - useUpdateAssignmentScope : remplace la portée d'un téléconseiller.
 */

export function useAssignmentContext() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['assignments', 'context'],
    queryFn: ({ signal }) =>
      apiClient.get<AssignmentContextResponse>('/v1/assignments/context', token, signal),
    enabled: !!token,
  });
}

export function useUpdateAssignmentScope() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { teleconsultantUserId: string; data: AssignmentScopeInput }) =>
      apiClient.put<AssignmentScopeOutput>(
        `/v1/assignments/${input.teleconsultantUserId}`,
        input.data,
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}
