import { DomainError } from '@mata/shared/errors';
import type { FastifyRequest } from 'fastify';
import { requireUser } from './auth-plugin.js';

/**
 * Helper · accepte le rôle `producer` directement, OU un téléconseiller/admin
 * agissant via une session déléguée pour un producteur.
 *
 * Utilisé sur les routes /v1/offers/* (création, modification, suspension)
 * et /v1/sites/* (Lot 7) qui doivent accepter à la fois le producteur en
 * direct ET le téléconseiller/admin via session active (mockup §2934 :
 * "Créer/modifier/suspendre offre · Mettre à jour stock et prix").
 *
 * Retourne le `userId` à utiliser comme "owner" de l'action :
 *  - en direct producer : son propre `user.id`
 *  - en délégation : `req.actingOnBehalfOf.id` (le producteur cible)
 *
 * Référence : ARCHITECTURE.md §9, CLAUDE.md §G8.
 */
export function requireProducerOrDelegate(req: FastifyRequest): {
  actorUserId: string;
  ownerUserId: string;
  onBehalfOf: boolean;
} {
  const user = requireUser(req);

  // Cas 1 : producteur direct.
  if (user.role === 'producer') {
    return { actorUserId: user.id, ownerUserId: user.id, onBehalfOf: false };
  }

  // Cas 2 : délégation active (téléconseiller / admin / super_admin).
  if (
    (user.role === 'teleconsultant' || user.role === 'admin' || user.role === 'super_admin') &&
    req.actingOnBehalfOf &&
    req.actingOnBehalfOf.role === 'producer'
  ) {
    return {
      actorUserId: user.id,
      ownerUserId: req.actingOnBehalfOf.id,
      onBehalfOf: true,
    };
  }

  throw new DomainError(
    'FORBIDDEN',
    'Rôle producer requis (direct ou via session téléconseil déléguée)',
    { details: { currentRole: user.role, hasDelegation: !!req.actingOnBehalfOf } },
  );
}
