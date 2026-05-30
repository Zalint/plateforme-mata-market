import type { FastifyRequest } from 'fastify';
import { requireUser } from './auth-plugin.js';

/**
 * Résout l'acteur d'audit d'une requête authentifiée.
 *
 * Invariant (CLAUDE.md §G3 + §G6) : l'`actorUserId` est TOUJOURS l'utilisateur
 * réel qui a émis la requête (`req.user`), jamais le producteur cible. En
 * session déléguée (téléconseiller/admin agissant pour un producteur via
 * `req.actingOnBehalfOf`), `onBehalfOfUserId` porte le producteur cible.
 *
 * Sans délégation, `onBehalfOfUserId` est null.
 */
export function resolveAuditActor(req: FastifyRequest): {
  actorUserId: string;
  onBehalfOfUserId: string | null;
} {
  const user = requireUser(req);
  return {
    actorUserId: user.id,
    onBehalfOfUserId: req.actingOnBehalfOf?.id ?? null,
  };
}
