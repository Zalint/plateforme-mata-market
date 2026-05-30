import { DomainError } from '@mata/shared/errors';
import {
  type BankDetailsClear,
  BankDetailsClearSchema,
  BankDetailsEncryptedSchema,
} from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { decrypt, encrypt } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';

/**
 * Service bank_details · update + reveal.
 *
 * INVARIANTS DE SÉCURITÉ :
 *  1. Le contenu en clair NE PASSE JAMAIS par audit_log (oldValue/newValue).
 *     L'audit se limite à `{ updated: true }` ou `{ revealed: true }`.
 *  2. Le contenu en clair n'est JAMAIS LOGGÉ par pino (cf. logger.ts redact
 *     sur `bankDetails`).
 *  3. Update et reveal génèrent CHACUNE leur audit avec actor + cible.
 *
 * Référence : CLAUDE.md §G4 « bank_details chiffré applicativement »,
 *             §G8 « Chiffrement applicatif » + ARCHITECTURE.md §9.
 */

type Context = {
  actorUserId: string;
  targetUserId: string;
  request?: FastifyRequest;
};

export const bankDetailsService = {
  /**
   * Set/replace les coordonnées bancaires d'un producteur.
   *
   * Le payload en clair est validé Zod, sérialisé JSON, chiffré AES-256-GCM,
   * puis persisté dans `producer_profiles.bank_details` (jsonb).
   *
   * Autorise actor = producteur lui-même OU admin (vérifié côté route).
   */
  async update(ctx: Context, clear: BankDetailsClear): Promise<void> {
    // Re-validation défensive (la route a déjà parsé via Zod, mais ce service
    // peut être appelé depuis ailleurs).
    BankDetailsClearSchema.parse(clear);

    const existing = await prisma.producerProfile.findUnique({
      where: { userId: ctx.targetUserId },
      select: { userId: true, bankDetails: true },
    });
    if (!existing) throw new DomainError('NOT_FOUND', 'Producteur introuvable');

    const encrypted = encrypt(JSON.stringify(clear));

    await prisma.producerProfile.update({
      where: { userId: ctx.targetUserId },
      data: { bankDetails: encrypted as unknown as Prisma.InputJsonValue },
    });

    await auditService.log({
      actorUserId: ctx.actorUserId,
      action: 'producer.bank_details.update',
      targetType: 'producer',
      targetId: ctx.targetUserId,
      // INTENTIONNEL : pas d'oldValue/newValue contenant les BD. Juste un flag.
      newValue: { updated: true, hadPrevious: existing.bankDetails !== null },
      request: ctx.request,
    });
  },

  /**
   * Reveal admin : déchiffre et retourne le payload en clair.
   *
   * **Audit obligatoire** (justification du reveal). Tout appel produit une
   * entrée `producer.bank_details.reveal` traçable.
   *
   * La vérification du rôle admin doit être faite côté route (requireRole).
   * Ce service présume l'autorisation déjà accordée.
   */
  async reveal(ctx: Context): Promise<BankDetailsClear> {
    const row = await prisma.producerProfile.findUnique({
      where: { userId: ctx.targetUserId },
      select: { userId: true, bankDetails: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Producteur introuvable');
    if (row.bankDetails === null) {
      throw new DomainError('NOT_FOUND', 'Aucune coordonnée bancaire pour ce producteur');
    }

    const encrypted = BankDetailsEncryptedSchema.parse(row.bankDetails);
    const clearJson = decrypt(encrypted);
    const clear = BankDetailsClearSchema.parse(JSON.parse(clearJson));

    await auditService.log({
      actorUserId: ctx.actorUserId,
      action: 'producer.bank_details.reveal',
      targetType: 'producer',
      targetId: ctx.targetUserId,
      newValue: { revealed: true },
      request: ctx.request,
    });

    return clear;
  },
};
