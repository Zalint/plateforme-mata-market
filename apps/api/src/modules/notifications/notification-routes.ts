import {
  NotificationPreferencesOutputSchema,
  NotificationPreferencesUpdateSchema,
  PushSubscribeResponseSchema,
  PushSubscribeSchema,
  PushUnsubscribeSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireUser } from '../auth/index.js';
import { notificationService } from './notification-service.js';

/**
 * Routes /v1/notifications/* · push web + préférences (Lot 7).
 *
 * Toutes exigent un JWT valide (tout rôle authentifié peut gérer SES propres
 * abonnements / préférences — borné au user courant côté service).
 *
 * CLAUDE.md §G1 : la permission navigateur est demandée APRÈS une action
 * signifiante côté front (NotificationPermissionPrompt), jamais au chargement.
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // POST /v1/notifications/push/subscribe · enregistrer un abonnement

  typed.post(
    '/v1/notifications/push/subscribe',
    {
      schema: {
        body: PushSubscribeSchema,
        response: { 201: PushSubscribeResponseSchema },
      },
    },
    async (req, reply) => {
      const user = requireUser(req);
      await notificationService.subscribe({
        userId: user.id,
        subscription: req.body,
        request: req,
      });
      return reply.code(201).send({ subscribed: true });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // DELETE /v1/notifications/push/subscribe · retirer un abonnement

  typed.delete(
    '/v1/notifications/push/subscribe',
    {
      schema: {
        body: PushUnsubscribeSchema,
        response: { 200: PushSubscribeResponseSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      await notificationService.unsubscribe({
        userId: user.id,
        endpoint: req.body.endpoint,
        request: req,
      });
      return { subscribed: false };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/notifications/preferences · lire les préférences

  typed.get(
    '/v1/notifications/preferences',
    {
      schema: { response: { 200: NotificationPreferencesOutputSchema } },
    },
    async (req) => {
      const user = requireUser(req);
      return notificationService.getPreferences(user.id);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // PATCH /v1/notifications/preferences · mettre à jour les préférences

  typed.patch(
    '/v1/notifications/preferences',
    {
      schema: {
        body: NotificationPreferencesUpdateSchema,
        response: { 200: NotificationPreferencesOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      return notificationService.updatePreferences({
        userId: user.id,
        input: req.body,
        request: req,
      });
    },
  );
}
