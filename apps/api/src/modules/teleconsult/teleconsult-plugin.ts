import { DomainError } from '@mata/shared/errors';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { sessionService } from './session-service.js';

/**
 * Plugin Fastify · résout `req.actingOnBehalfOf` depuis l'en-tête
 * `X-Teleconsult-Session-Id` côté admin / téléconseiller.
 *
 * Référence : CLAUDE.md §G8 + ARCHITECTURE.md §9.
 *
 * Comportement :
 *  - Si `X-Teleconsult-Session-Id` absent → no-op (route classique).
 *  - Si présent ET `req.user` est `teleconsultant`/`admin`/`super_admin` :
 *    - Lookup la session, vérifie validité (non expirée, non fermée,
 *      teleconsultant matche)
 *    - Injecte `req.actingOnBehalfOf = producer` (le User producer cible)
 *    - Si invalide → 401 (la session a expiré ou été fermée pendant l'usage)
 *  - Si présent SANS `req.user` valide (ou rôle non autorisé) → 403.
 *
 * Doit être enregistré APRÈS `auth-plugin` (qui pose req.user) et AVANT
 * les routes métier (pour qu'elles voient `req.actingOnBehalfOf`).
 */

const HEADER = 'x-teleconsult-session-id';

const teleconsultPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('onRequest', async (req) => {
    const headerValue = req.headers[HEADER];
    if (!headerValue || typeof headerValue !== 'string') return; // no header → no-op

    // Headers publics (webhook etc.) ne devraient pas le porter, mais
    // si jamais — refuse poliment.
    if (!req.user) {
      throw new DomainError(
        'UNAUTHORIZED',
        'X-Teleconsult-Session-Id requiert une authentification',
      );
    }

    // Seuls les rôles habilités peuvent agir au nom d'autrui.
    const role = req.user.role;
    if (role !== 'teleconsultant' && role !== 'admin' && role !== 'super_admin') {
      throw new DomainError('FORBIDDEN', 'Rôle non autorisé à utiliser une session téléconseil');
    }

    const resolved = await sessionService.resolveActiveForTeleconsultant({
      sessionId: headerValue,
      teleconsultantUserId: req.user.id,
    });

    if (!resolved) {
      // Session inexistante, expirée, fermée ou non-matching teleconsultant.
      logger.warn(
        {
          event: 'teleconsult.session.header_invalid',
          actor: req.user.id,
          sessionId: headerValue,
        },
        'teleconsult.session.header_invalid',
      );
      throw new DomainError('UNAUTHORIZED', 'Session téléconseil invalide ou expirée — recommence');
    }

    // Injecte le producteur cible dans req.actingOnBehalfOf
    // (compatible avec assertOwnership existant + audit log).
    req.actingOnBehalfOf = {
      id: resolved.producer.id,
      keycloakId: '', // pas utile ici — assert-ownership ne lit que id
      role: 'producer',
      status: resolved.producer.status,
      displayName: resolved.producer.displayName,
    };

    // Annote le request avec la sessionId pour les audits aval.
    (req as { teleconsultSessionId?: string }).teleconsultSessionId = resolved.sessionId;
  });

  // Lot 6 → Lot 7 — émet un event outbox pour chaque mutation réussie
  // pendant une session déléguée. Consommé Lot 7 par cron retry-outbox
  // qui appelle n8n → push web temps réel + email recap fin de session.
  //
  // Filtre :
  //  - méthode mutante (POST/PUT/PATCH/DELETE)
  //  - status 2xx (succès)
  //  - req.actingOnBehalfOf défini (session active utilisée)
  //  - URL exclut /v1/teleconsult/* lui-même (start/close ont leur audit propre)
  app.addHook('onResponse', async (req, reply) => {
    if (!req.actingOnBehalfOf) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;
    if (req.url.startsWith('/v1/teleconsult/')) return;
    if (!req.user) return;

    try {
      const payload: Prisma.InputJsonValue = {
        sessionId: (req as { teleconsultSessionId?: string }).teleconsultSessionId ?? null,
        teleconsultantUserId: req.user.id,
        teleconsultantDisplayName: req.user.displayName,
        producerUserId: req.actingOnBehalfOf.id,
        method: req.method,
        path: req.url,
        statusCode: reply.statusCode,
        at: new Date().toISOString(),
      };
      await prisma.outboxEvent.create({
        data: {
          eventType: 'teleconsult.action.performed',
          payload,
        },
      });
    } catch (err) {
      // Outbox insert fail ne doit pas casser la réponse — log warn.
      logger.warn(
        {
          event: 'teleconsult.outbox_insert_failed',
          err: err instanceof Error ? err.message : String(err),
        },
        'teleconsult.outbox_insert_failed',
      );
    }
  });
};

export default fp(teleconsultPlugin, {
  name: 'mata-teleconsult',
  fastify: '5.x',
  dependencies: ['mata-auth'],
});

// Type augmentation pour TypeScript.
declare module 'fastify' {
  interface FastifyRequest {
    teleconsultSessionId?: string;
  }
}
