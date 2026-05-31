import { DomainError } from '@mata/shared/errors';
import type { AdminCreateUserInput, AdminCreateUserResponse } from '@mata/shared/schemas';
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { generateTempPassword, keycloakAdmin } from '../../lib/keycloak-admin.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { producerService } from '../producers/index.js';

/**
 * Service utilisateurs · création de comptes par un admin (Lot 9).
 *
 * Même mécanique que l'onboarding producteur : compte Keycloak provisionné
 * (username = téléphone, mot de passe temporaire forcé à changer) + ligne
 * `users` avec le rôle choisi. Le mot de passe est renvoyé UNE SEULE FOIS.
 *
 * Pour le rôle `producer`, on délègue à `producerService.onboardByStaff`
 * (interface publique §G3) qui crée AUSSI le profil producteur `pending` —
 * évite de dupliquer la création de profil hors du module producteurs.
 */
async function createByAdminInternal(args: {
  actorUserId: string;
  input: AdminCreateUserInput;
  request?: FastifyRequest;
}): Promise<AdminCreateUserResponse> {
  const { actorUserId, input, request } = args;

  if (input.role === 'producer') {
    if (!input.type || !input.zoneId) {
      throw new DomainError('VALIDATION', 'Type et zone requis pour créer un producteur');
    }
    const { profile, tempPassword } = await producerService.onboardByStaff({
      actorUserId,
      input: {
        displayName: input.displayName,
        phone: input.phone,
        type: input.type,
        zoneId: input.zoneId,
      },
      request,
    });
    return { role: 'producer', displayName: profile.displayName, tempPassword };
  }

  // Autres rôles : compte Keycloak + ligne users, sans profil métier.
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    throw new DomainError('CONFLICT', 'Un utilisateur avec ce téléphone existe déjà');
  }

  const tempPassword = generateTempPassword();
  const keycloakId = await keycloakAdmin.createUser({
    phone: input.phone,
    displayName: input.displayName,
    tempPassword,
    realmRole: input.role,
  });

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        keycloakId,
        username: input.phone,
        phone: input.phone,
        displayName: input.displayName,
        role: input.role,
      },
    });
    userId = user.id;
  } catch (err) {
    // Rollback best-effort du compte Keycloak si l'insert DB échoue.
    await keycloakAdmin.deleteUser(keycloakId).catch((rollbackErr: unknown) => {
      logger.error(
        {
          keycloakId,
          err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        },
        'user.create.rollback_failed',
      );
    });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new DomainError('CONFLICT', 'Téléphone ou compte déjà utilisé');
    }
    throw err;
  }

  await auditService.log({
    actorUserId,
    action: 'user.create',
    targetType: 'user',
    targetId: userId,
    newValue: { role: input.role, phone: input.phone },
    request,
  });

  return { role: input.role, displayName: input.displayName, tempPassword };
}

export const userService = {
  createByAdmin: createByAdminInternal,
};
