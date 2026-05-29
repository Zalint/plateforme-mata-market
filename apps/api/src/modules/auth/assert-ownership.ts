import { DomainError } from '@mata/shared/errors';
import type { FastifyRequest } from 'fastify';

/**
 * Vérifie que l'utilisateur courant a le droit d'accéder à une ressource
 * appartenant à `resourceUserId`.
 *
 * Autorisé si :
 *  - L'utilisateur est le propriétaire de la ressource
 *  - L'utilisateur a le rôle `admin` ou `super_admin`
 *  - L'utilisateur agit pour le compte du propriétaire (session téléconseil)
 *
 * Lance `DomainError('FORBIDDEN')` sinon.
 *
 * Référence : ARCHITECTURE.md §9 « Anti-IDOR ».
 */
export function assertOwnership(req: FastifyRequest, resourceUserId: string): void {
  const user = req.user;
  if (!user) {
    throw new DomainError('UNAUTHORIZED', 'Authentication required');
  }
  if (user.id === resourceUserId) return;
  if (user.role === 'admin' || user.role === 'super_admin') return;
  if (req.actingOnBehalfOf && req.actingOnBehalfOf.id === resourceUserId) return;

  throw new DomainError('FORBIDDEN', 'You do not have access to this resource', {
    details: { resourceUserId },
  });
}
