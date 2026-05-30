import {
  ProducerDocumentsSchema,
  type ProducerProfileAdmin,
  type ProducerProfilePublic,
} from '@mata/shared/schemas';
import type { ProducerProfile as PrismaProducerProfile, User } from '@prisma/client';

/**
 * Mappers Prisma → schemas API.
 *
 * `Public`  : pas de bank_details, pas de documents (vue producteur self ou catalogue).
 *             Inclut `displayName` joint depuis users.
 * `Admin`   : ajoute documents (parsé Zod) + flag `hasBankDetails` + phone/email
 *             user (PII admin-only).
 *
 * `bank_details` en clair ne PASSE JAMAIS par un mapper : le reveal admin a son
 * propre helper qui déchiffre, journalise un audit, et retourne directement le
 * payload typé `BankDetailsClear` (cf. bank-details-service.ts).
 */

type ProfileWithUser = PrismaProducerProfile & {
  user: Pick<User, 'displayName' | 'phone' | 'email'>;
};

export function toProducerPublic(p: ProfileWithUser): ProducerProfilePublic {
  return {
    userId: p.userId,
    displayName: p.user.displayName,
    type: p.type,
    status: p.status,
    zoneId: p.zoneId,
    whatsappPhone: p.whatsappPhone,
    photoPublicId: p.photoPublicId,
    bio: p.bio,
    validatedAt: p.validatedAt ? p.validatedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toProducerAdmin(p: ProfileWithUser): ProducerProfileAdmin {
  // documents est un jsonb. On valide strictement via Zod : si la DB contient
  // une forme inattendue, le caller verra l'erreur — c'est volontaire pour
  // détecter une dérive de format au plus tôt.
  const documents = ProducerDocumentsSchema.parse(p.documents);
  return {
    ...toProducerPublic(p),
    phone: p.user.phone,
    email: p.user.email,
    validatedBy: p.validatedBy,
    documents,
    hasBankDetails: p.bankDetails !== null,
  };
}
