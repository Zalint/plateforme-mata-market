import { DomainError } from '@mata/shared/errors';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { assignmentService } from './assignment-service.js';

/**
 * Gardes de PORTÉE DE MODÉRATION (CLAUDE.md §G8 « permissions explicites »).
 *
 * Politique :
 *  - admin / super_admin       → toutes les offres
 *  - téléconseiller            → uniquement ses producteurs affectés
 *                                (allProducers = portée globale ; aucune
 *                                affectation = aucune offre)
 *  - autre rôle                → rien (les routes posent requireRole en amont)
 *
 * La délégation n'est PAS concernée (un producteur peut déléguer à n'importe
 * quel téléconseiller — cf. schema.prisma, bloc TeleconsultantAssignment).
 */

/** Clause `where` Prisma restreignant les offres modérables par l'utilisateur courant. */
export async function scopeOfferWhereForModerator(
  req: FastifyRequest,
): Promise<Prisma.OfferWhereInput> {
  const user = req.user;
  if (!user) throw new DomainError('UNAUTHORIZED', 'Authentification requise');
  if (user.role === 'admin' || user.role === 'super_admin') return {};
  if (user.role === 'teleconsultant') {
    const scope = await assignmentService.getScopeForTeleconsultant(user.id);
    if (scope.allProducers) return {};
    // Liste vide → `in: []` ne matche aucune offre (file vide), comportement voulu.
    return { producerUserId: { in: scope.producerUserIds } };
  }
  return { producerUserId: { in: [] } };
}

/**
 * Autorise la modération d'une offre selon le producteur propriétaire. Lance
 * `FORBIDDEN` (message explicite) si le téléconseiller n'a pas ce producteur
 * dans son périmètre.
 */
export async function assertModeratorForProducer(
  req: FastifyRequest,
  producerUserId: string,
): Promise<void> {
  const user = req.user;
  if (!user) throw new DomainError('UNAUTHORIZED', 'Authentification requise');
  if (user.role === 'admin' || user.role === 'super_admin') return;
  if (user.role === 'teleconsultant') {
    const scope = await assignmentService.getScopeForTeleconsultant(user.id);
    if (scope.allProducers || scope.producerUserIds.includes(producerUserId)) return;
    throw new DomainError(
      'FORBIDDEN',
      'Ce producteur ne vous est pas affecté — vous ne pouvez pas modérer ses offres',
      { details: { producerUserId } },
    );
  }
  throw new DomainError('FORBIDDEN', 'Rôle modérateur requis (admin ou téléconseiller)');
}
