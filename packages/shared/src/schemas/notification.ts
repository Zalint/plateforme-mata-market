import { z } from 'zod';
import { NOTIFICATION_CATEGORIES } from '../constants/enums.js';

/**
 * Schemas Notifications push web (Lot 7).
 *
 * Référence : CLAUDE.md §G1 (permission tardive, endpoints 410 supprimés),
 * §G8 (VAPID_PRIVATE_KEY jamais côté client). Spec Web Push : un abonnement
 * = endpoint + clés p256dh/auth produites par le navigateur.
 */

export const NotificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);

// Corps PushSubscription tel que renvoyé par le navigateur
// (PushSubscription.toJSON()). On ne garde que ce dont on a besoin pour
// `web-push` : endpoint + keys.{p256dh,auth}.
export const PushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscribe = z.infer<typeof PushSubscribeSchema>;

// Désabonnement par endpoint (le client envoie l'endpoint à retirer).
export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
export type PushUnsubscribe = z.infer<typeof PushUnsubscribeSchema>;

// Mise à jour des préférences : toggle global + par catégorie.
export const NotificationPreferencesUpdateSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  categories: z.record(NotificationCategorySchema, z.boolean()).optional(),
});
export type NotificationPreferencesUpdate = z.infer<typeof NotificationPreferencesUpdateSchema>;

export const NotificationPreferencesOutputSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  categories: z.record(NotificationCategorySchema, z.boolean()),
});
export type NotificationPreferencesOutput = z.infer<typeof NotificationPreferencesOutputSchema>;

export const PushSubscribeResponseSchema = z.object({
  subscribed: z.boolean(),
});
