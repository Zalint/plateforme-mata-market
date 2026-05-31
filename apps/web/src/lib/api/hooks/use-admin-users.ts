'use client';

import type { AdminCreateUserInput, AdminCreateUserResponse } from '@mata/shared/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

/**
 * Création d'un utilisateur par un admin (tous rôles sauf super_admin).
 * Provisionne un compte Keycloak + renvoie le mot de passe temporaire UNE
 * SEULE FOIS (à communiquer à l'utilisateur, jamais re-consultable).
 */
export function useCreateUser() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminCreateUserInput) =>
      apiClient.post<AdminCreateUserResponse>('/v1/admin/users', input, token),
    onSuccess: (_res, input) => {
      if (input.role === 'producer') {
        void qc.invalidateQueries({ queryKey: ['producers', 'admin'] });
      }
    },
  });
}
