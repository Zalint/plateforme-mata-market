import { DomainError } from '@mata/shared/errors';
import type { UserRole } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { requireUser } from './auth-plugin.js';

/**
 * Vérifie que l'utilisateur courant a l'un des rôles attendus.
 *
 * Le rôle `super_admin` est implicitement autorisé pour toute vérification
 * incluant `admin` (super_admin = admin + privilèges étendus, MVP).
 *
 * Lance `DomainError('FORBIDDEN')` sinon.
 *
 * Référence : CLAUDE.md §G8 « Permissions par rôle vérifiées EXPLICITEMENT
 * à chaque endpoint. Lisibles dans la route, pas dans un middleware caché. »
 */
export function requireRole(req: FastifyRequest, ...allowed: readonly UserRole[]): void {
  const user = requireUser(req);
  if (allowed.includes(user.role)) return;
  // super_admin escalade automatiquement les permissions admin
  if (user.role === 'super_admin' && allowed.includes('admin')) return;
  throw new DomainError('FORBIDDEN', `Rôle requis : ${allowed.join(' | ')}`, {
    details: { requiredAnyOf: allowed, current: user.role },
  });
}
