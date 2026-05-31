'use client';

import type {
  NotificationPreferencesOutput,
  NotificationPreferencesUpdate,
  PushSubscribe,
} from '@mata/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeToPush, unsubscribeFromPush } from '../../push/web-push-client';
import { apiClient } from '../http-client';
import { useAuthToken } from '../use-auth-token';

// ─────────────────────────────────────────────────────────────────
// Préférences

export function useNotificationPreferences() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: ({ signal }) =>
      apiClient.get<NotificationPreferencesOutput>('/v1/notifications/preferences', token, signal),
    enabled: !!token,
  });
}

export function useUpdateNotificationPreferences() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPreferencesUpdate) =>
      apiClient.patch<NotificationPreferencesOutput>('/v1/notifications/preferences', input, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Souscription push (navigateur + API)

/**
 * Souscrit le navigateur au push PUIS enregistre l'abonnement côté API.
 * Retourne false si non supporté / permission refusée (le caller affiche un
 * message), true si l'abonnement est bien enregistré.
 */
export function useSubscribeToPush() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const subscription = await subscribeToPush();
      if (!subscription) return false;
      await apiClient.post<{ subscribed: boolean }>(
        '/v1/notifications/push/subscribe',
        subscription satisfies PushSubscribe,
        token,
      );
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useUnsubscribeFromPush() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const endpoint = await unsubscribeFromPush();
      if (!endpoint) return false;
      await apiClient.del<{ subscribed: boolean }>(
        '/v1/notifications/push/subscribe',
        { endpoint },
        token,
      );
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
