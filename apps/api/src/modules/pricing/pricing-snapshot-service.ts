import { DomainError } from '@mata/shared/errors';
import type { PricingSnapshotOutput } from '@mata/shared/schemas';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { toPricingSnapshotOutput } from './mappers.js';
import { computePricing } from './pricing-engine.js';
import { pricingService } from './pricing-service.js';

/**
 * Service snapshot · interface publique CONSOMMÉE PAR LE LOT 4 (orders).
 *
 * Lot 3 livre l'interface, Lot 4 l'appellera dans la transaction de création
 * d'un order_item. La FK `order_items.pricing_snapshot_id` sera ajoutée
 * par Lot 4 (table order_items absente à ce Lot).
 *
 * INVARIANT IMMUTABILITÉ : aucun update/delete exposé. La table est
 * write-once. Si un calcul s'avère erroné post-commande, on ne CORRIGE pas
 * le snapshot : on crée une note d'avoir (Lot 5) qui pointe sur un nouveau
 * snapshot. CLAUDE.md §G4 « pricing_snapshots figé à la création ».
 *
 * Référence : ARCHITECTURE.md §6.
 */

export interface CreateSnapshotArgs {
  /**
   * ID de l'offre source (pour lookup prix producteur + rule applicable).
   * Le service prend la rule active à `atDate` (default = maintenant).
   */
  offerId: string;
  /** Quantité commandée par l'order_item (entiers, > 0). */
  quantity: number;
  /** Date de référence pour le lookup rule active. Default = new Date(). */
  atDate?: Date;
  /**
   * Optionnel : client Prisma transactionnel passé par Lot 4 pour englober
   * la création du snapshot dans la transaction de création de l'order.
   * Si omis, utilise le client global.
   */
  tx?: Prisma.TransactionClient | PrismaClient;
}

export const pricingSnapshotService = {
  /**
   * Crée un snapshot IMMUABLE depuis une offre + sa rule active.
   *
   * Sera appelé par le module orders (Lot 4) dans la transaction de
   * création d'order_item. Le caller est responsable de stocker
   * `snapshot.id` dans `order_items.pricing_snapshot_id`.
   *
   * @throws DomainError NOT_FOUND si offre absente OU pas de rule applicable.
   * @throws DomainError VALIDATION si la configuration produit final < producer.
   */
  async createForOrderItem(args: CreateSnapshotArgs): Promise<PricingSnapshotOutput> {
    if (args.quantity <= 0) {
      throw new DomainError('VALIDATION', 'quantity doit être > 0');
    }

    const db = args.tx ?? prisma;
    const at = args.atDate ?? new Date();

    const offer = await db.offer.findUnique({
      where: { id: args.offerId },
      select: { id: true, priceFcfa: true, category: true, categorySlug: true },
    });
    if (!offer) throw new DomainError('NOT_FOUND', 'Offre introuvable');

    const offerCategory = offer.categorySlug ?? offer.category ?? undefined;
    const rule = await pricingService.findActiveRule({
      offerId: offer.id,
      category: offerCategory,
      at,
    });
    if (!rule) {
      throw new DomainError(
        'NOT_FOUND',
        'Aucune règle pricing active pour cette offre — impossible de générer le snapshot',
        { details: { offerId: offer.id, category: offerCategory } },
      );
    }

    const computed = computePricing({
      producerPriceFcfa: offer.priceFcfa,
      model: rule.model,
      commissionPct: rule.commissionPct,
      commissionBase: rule.commissionBase,
      commissionFlatFcfa: rule.commissionFlatFcfa,
      safetyMarginPct: rule.safetyMarginPct,
      safetyMarginBase: rule.safetyMarginBase,
      collectionFcfa: rule.collectionFcfa,
      deliveryFcfa: rule.deliveryFcfa,
      storageFcfa: rule.storageFcfa,
      discountFcfa: rule.discountFcfa,
    });

    const snapshot = await db.pricingSnapshot.create({
      data: {
        modelUsed: rule.model,
        pricingRuleId: rule.id,
        quantity: args.quantity,
        producerPriceFcfa: computed.producerPriceFcfa,
        commissionFcfa: computed.commissionFcfa,
        collectionFcfa: computed.collectionFcfa,
        deliveryFcfa: computed.deliveryFcfa,
        storageFcfa: computed.storageFcfa,
        safetyMarginFcfa: computed.safetyMarginFcfa,
        discountFcfa: computed.discountFcfa,
        finalPriceFcfa: computed.finalPriceFcfa,
        producerShareFcfa: computed.producerShareFcfa,
        platformShareFcfa: computed.platformShareFcfa,
      },
    });

    return toPricingSnapshotOutput(snapshot);
  },

  /**
   * Lookup par ID — pour affichage uniquement (UI admin/order details Lot 4).
   * Aucun update/delete exposé.
   */
  async getById(snapshotId: string): Promise<PricingSnapshotOutput> {
    const row = await prisma.pricingSnapshot.findUnique({ where: { id: snapshotId } });
    if (!row) throw new DomainError('NOT_FOUND', 'Snapshot pricing introuvable');
    return toPricingSnapshotOutput(row);
  },
};
