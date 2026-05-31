'use client';

import type { TeleconsultCodeGenerateOutput, TeleconsultSessionOutput } from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../http-client';
import { setActiveTeleconsultSessionId } from '../teleconsult-session-storage';
import { useAuthToken } from '../use-auth-token';
import { useMe } from './use-auth-me';

/**
 * Hooks TanStack pour le teleconseil (Lot 6).
 *
 * - useGenerateTeleconsultCode : producteur demande un code
 * - useStartTeleconsultSession : teleconseiller / admin saisit code -> session
 * - useCloseTeleconsultSession : close manuel (par teleconsultant ou producer)
 * - useActiveTeleconsultSession : poll session active du teleconseiller
 *   (poll 30s + maintient automatiquement le storage singleton qui injecte
 *   le header X-Teleconsult-Session-Id sur tous les calls http-client)
 */

// ─────────────────────────────────────────────────────────────────
// Producer side

export function useGenerateTeleconsultCode() {
  const token = useAuthToken();
  return useMutation({
    mutationFn: () =>
      apiClient.post<TeleconsultCodeGenerateOutput>('/v1/teleconsult/codes', {}, token),
  });
}

/**
 * Session d'assistance active dont le PRODUCTEUR courant est la cible (ou null).
 * Sert à désactiver « Me faire aider » quand un conseiller assiste déjà le
 * producteur (générer un nouveau code serait inutile — le démarrage serait en
 * conflit). Gatée au rôle producer.
 */
export function useMyAssistanceSession() {
  const token = useAuthToken();
  const { data: me } = useMe();
  return useQuery({
    queryKey: ['teleconsult', 'active-as-producer'],
    queryFn: ({ signal }) =>
      apiClient.get<TeleconsultSessionOutput | null>(
        '/v1/teleconsult/sessions/active-as-producer',
        token,
        signal,
      ),
    enabled: !!token && me?.role === 'producer',
    refetchInterval: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────
// Teleconsultant / admin side

export function useStartTeleconsultSession() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { producerUsername: string; code: string }) =>
      apiClient.post<TeleconsultSessionOutput>('/v1/teleconsult/sessions', input, token),
    onSuccess: (data) => {
      setActiveTeleconsultSessionId(data.id);
      void qc.invalidateQueries({ queryKey: ['teleconsult'] });
    },
  });
}

export function useCloseTeleconsultSession() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; reason?: string }) =>
      apiClient.post<TeleconsultSessionOutput>(
        `/v1/teleconsult/sessions/${input.sessionId}/close`,
        input.reason ? { reason: input.reason } : {},
        token,
      ),
    // onSettled (succès OU erreur) : on nettoie TOUJOURS l'état local. Sinon une
    // session déjà fermée/expirée côté serveur resterait dans le singleton mémoire
    // et continuerait d'injecter X-Teleconsult-Session-Id sur tous les appels.
    onSettled: () => {
      setActiveTeleconsultSessionId(null);
      void qc.invalidateQueries({ queryKey: ['teleconsult'] });
    },
  });
}

/**
 * Poll la session active du teleconseiller toutes les 30s + maintient
 * le storage singleton sync. A monter dans AppShell pour les roles
 * teleconsultant / admin.
 */
export function useActiveTeleconsultSession() {
  const token = useAuthToken();
  const { data: me } = useMe();
  // L'endpoint exige le rôle teleconsultant / admin (teleconsult-routes.ts).
  // Sans ce gate, un client/producteur déclenche un 403 inutile à chaque page.
  const canPoll =
    me?.role === 'teleconsultant' || me?.role === 'admin' || me?.role === 'super_admin';
  const q = useQuery({
    queryKey: ['teleconsult', 'active'],
    queryFn: ({ signal }) =>
      apiClient.get<TeleconsultSessionOutput | null>(
        '/v1/teleconsult/sessions/active',
        token,
        signal,
      ),
    enabled: !!token && canPoll,
    refetchInterval: 30_000,
  });

  // Sync storage singleton + auto-clear si la session a expire cote serveur.
  useEffect(() => {
    if (q.data) {
      setActiveTeleconsultSessionId(q.data.id);
    } else if (q.isSuccess) {
      setActiveTeleconsultSessionId(null);
    }
  }, [q.data, q.isSuccess]);

  return q;
}
