import type { ProductCategory } from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type {
  PricingRuleCreate,
  PricingRuleListQuery,
  PricingRuleOutput,
  PricingRuleUpdate,
  PricingSimulateInput,
  PricingSimulateOutput,
} from '@mata/shared/schemas';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/index.js';
import { toPricingRuleOutput } from './mappers.js';
import { computePricing, type PricingEngineInput } from './pricing-engine.js';

/**
 * Service pricing · CRUD des règles + lookup rule active + simulate.
 *
 * Lookup rule active (findActiveRule) :
 *   1. Cherche un override `offer` pour cette offre précise.
 *   2. À défaut, prend la rule `category` correspondante.
 *   3. Filtre par validité (validFrom <= at AND (validUntil null OR > at)).
 *   4. Si plusieurs candidates, prend la plus récente (validFrom DESC).
 *   5. Si aucune → DomainError NOT_FOUND.
 *
 * Audit : pricing.rule.create et pricing.rule.update systématiques avec
 * oldValue/newValue (CLAUDE.md §G3 « toute action métier sensible »).
 */

// ─────────────────────────────────────────────────────────────────
// Lookup rule active

export interface FindActiveRuleArgs {
  offerId?: string;
  category?: ProductCategory;
  at?: Date;
}

async function findActiveRuleInternal(args: FindActiveRuleArgs) {
  const at = args.at ?? new Date();
  const validityFilter: Prisma.PricingRuleWhereInput = {
    validFrom: { lte: at },
    OR: [{ validUntil: null }, { validUntil: { gt: at } }],
  };

  // 1. Override offer si offerId fourni
  if (args.offerId) {
    const override = await prisma.pricingRule.findFirst({
      where: { scope: 'offer', offerId: args.offerId, ...validityFilter },
      orderBy: { validFrom: 'desc' },
    });
    if (override) return override;
  }

  // 2. Fallback rule catégorie
  if (args.category) {
    return prisma.pricingRule.findFirst({
      where: { scope: 'category', category: args.category, ...validityFilter },
      orderBy: { validFrom: 'desc' },
    });
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// Service

export const pricingService = {
  findActiveRule: findActiveRuleInternal,

  // ─────────────────────────────────────────────────────────────
  // CRUD

  async createRule(
    actorUserId: string,
    input: PricingRuleCreate,
    request?: FastifyRequest,
  ): Promise<PricingRuleOutput> {
    // Si scope=offer, vérifier que l'offre existe (FK Prisma le ferait mais
    // erreur côté DB peu lisible — 404 explicite ici).
    if (input.scope === 'offer' && input.offerId) {
      const exists = await prisma.offer.findUnique({
        where: { id: input.offerId },
        select: { id: true },
      });
      if (!exists) throw new DomainError('NOT_FOUND', 'Offre cible introuvable');
    }

    const created = await prisma.pricingRule.create({
      data: {
        scope: input.scope,
        category: input.scope === 'category' ? (input.category ?? null) : null,
        offerId: input.scope === 'offer' ? (input.offerId ?? null) : null,
        model: input.model,
        commissionPct: input.commissionPct,
        commissionBase: input.commissionBase,
        commissionFlatFcfa: input.commissionFlatFcfa,
        safetyMarginPct: input.safetyMarginPct,
        safetyMarginBase: input.safetyMarginBase,
        collectionFcfa: input.collectionFcfa,
        deliveryFcfa: input.deliveryFcfa,
        storageFcfa: input.storageFcfa,
        discountFcfa: input.discountFcfa,
        validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        createdBy: actorUserId,
      },
    });

    await auditService.log({
      actorUserId,
      action: 'pricing.rule.create',
      targetType: 'pricing_rule',
      targetId: created.id,
      newValue: toAuditValue(created),
      request,
    });

    return toPricingRuleOutput(created);
  },

  async updateRule(
    actorUserId: string,
    ruleId: string,
    input: PricingRuleUpdate,
    request?: FastifyRequest,
  ): Promise<PricingRuleOutput> {
    const before = await prisma.pricingRule.findUnique({ where: { id: ruleId } });
    if (!before) throw new DomainError('NOT_FOUND', 'Règle pricing introuvable');

    const updated = await prisma.pricingRule.update({
      where: { id: ruleId },
      data: {
        ...(input.model !== undefined && { model: input.model }),
        ...(input.commissionPct !== undefined && { commissionPct: input.commissionPct }),
        ...(input.commissionBase !== undefined && { commissionBase: input.commissionBase }),
        ...(input.commissionFlatFcfa !== undefined && {
          commissionFlatFcfa: input.commissionFlatFcfa,
        }),
        ...(input.safetyMarginPct !== undefined && { safetyMarginPct: input.safetyMarginPct }),
        ...(input.safetyMarginBase !== undefined && { safetyMarginBase: input.safetyMarginBase }),
        ...(input.collectionFcfa !== undefined && { collectionFcfa: input.collectionFcfa }),
        ...(input.deliveryFcfa !== undefined && { deliveryFcfa: input.deliveryFcfa }),
        ...(input.storageFcfa !== undefined && { storageFcfa: input.storageFcfa }),
        ...(input.discountFcfa !== undefined && { discountFcfa: input.discountFcfa }),
        ...(input.validFrom !== undefined && { validFrom: new Date(input.validFrom) }),
        ...(input.validUntil !== undefined && {
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        }),
        updatedBy: actorUserId,
      },
    });

    await auditService.log({
      actorUserId,
      action: 'pricing.rule.update',
      targetType: 'pricing_rule',
      targetId: ruleId,
      oldValue: toAuditValue(before),
      newValue: toAuditValue(updated),
      request,
    });

    return toPricingRuleOutput(updated);
  },

  async getRule(ruleId: string): Promise<PricingRuleOutput> {
    const row = await prisma.pricingRule.findUnique({ where: { id: ruleId } });
    if (!row) throw new DomainError('NOT_FOUND', 'Règle pricing introuvable');
    return toPricingRuleOutput(row);
  },

  async listRules(query: PricingRuleListQuery): Promise<PricingRuleOutput[]> {
    const where: Prisma.PricingRuleWhereInput = {
      ...(query.scope && { scope: query.scope }),
      ...(query.category && { category: query.category }),
      ...(query.offerId && { offerId: query.offerId }),
      ...(query.activeAt && {
        validFrom: { lte: new Date(query.activeAt) },
        OR: [{ validUntil: null }, { validUntil: { gt: new Date(query.activeAt) } }],
      }),
    };
    const rows = await prisma.pricingRule.findMany({
      where,
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toPricingRuleOutput);
  },

  // ─────────────────────────────────────────────────────────────
  // Simulate

  async simulate(input: PricingSimulateInput): Promise<PricingSimulateOutput> {
    if ('inline' in input) {
      return runSimulate({
        engineInput: {
          producerPriceFcfa: input.inline.producerPriceFcfa,
          model: input.inline.model,
          commissionPct: input.inline.commissionPct,
          commissionBase: input.inline.commissionBase,
          commissionFlatFcfa: input.inline.commissionFlatFcfa,
          safetyMarginPct: input.inline.safetyMarginPct,
          safetyMarginBase: input.inline.safetyMarginBase,
          collectionFcfa: input.inline.collectionFcfa,
          deliveryFcfa: input.inline.deliveryFcfa,
          storageFcfa: input.inline.storageFcfa,
          discountFcfa: input.inline.discountFcfa,
        },
        quantity: input.inline.quantity,
        ruleId: null,
      });
    }

    // Forme offerId : lookup offer (prix producteur) + rule active.
    const offer = await prisma.offer.findUnique({
      where: { id: input.offerId },
      select: { id: true, priceFcfa: true, category: true },
    });
    if (!offer) throw new DomainError('NOT_FOUND', 'Offre introuvable');

    const rule = await findActiveRuleInternal({
      offerId: offer.id,
      category: offer.category,
    });
    if (!rule) {
      throw new DomainError(
        'NOT_FOUND',
        'Aucune règle pricing active pour cette offre (ni override, ni catégorie)',
        { details: { offerId: offer.id, category: offer.category } },
      );
    }

    return runSimulate({
      engineInput: {
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
      },
      quantity: input.quantity,
      ruleId: rule.id,
    });
  },
};

// ─────────────────────────────────────────────────────────────────
// Helpers internes

function runSimulate(args: {
  engineInput: PricingEngineInput;
  quantity: number;
  ruleId: string | null;
}): PricingSimulateOutput {
  const result = computePricing(args.engineInput);
  return {
    ruleId: args.ruleId,
    modelUsed: args.engineInput.model,
    quantity: args.quantity,
    perUnit: {
      producerPriceFcfa: result.producerPriceFcfa,
      commissionFcfa: result.commissionFcfa,
      collectionFcfa: result.collectionFcfa,
      deliveryFcfa: result.deliveryFcfa,
      storageFcfa: result.storageFcfa,
      safetyMarginFcfa: result.safetyMarginFcfa,
      discountFcfa: result.discountFcfa,
      finalPriceFcfa: result.finalPriceFcfa,
      producerShareFcfa: result.producerShareFcfa,
      platformShareFcfa: result.platformShareFcfa,
    },
    lineTotal: {
      producerPriceFcfa: result.producerPriceFcfa * args.quantity,
      finalPriceFcfa: result.finalPriceFcfa * args.quantity,
      producerShareFcfa: result.producerShareFcfa * args.quantity,
      platformShareFcfa: result.platformShareFcfa * args.quantity,
    },
  };
}

/**
 * Sérialise une rule pour audit_log.oldValue/newValue. JSON pur (Date → ISO).
 */
function toAuditValue(r: Prisma.PricingRuleGetPayload<Record<string, never>>) {
  return {
    id: r.id,
    scope: r.scope,
    category: r.category,
    offerId: r.offerId,
    model: r.model,
    commissionPct: r.commissionPct,
    commissionBase: r.commissionBase,
    commissionFlatFcfa: r.commissionFlatFcfa,
    safetyMarginPct: r.safetyMarginPct,
    safetyMarginBase: r.safetyMarginBase,
    collectionFcfa: r.collectionFcfa,
    deliveryFcfa: r.deliveryFcfa,
    storageFcfa: r.storageFcfa,
    discountFcfa: r.discountFcfa,
    validFrom: r.validFrom.toISOString(),
    validUntil: r.validUntil ? r.validUntil.toISOString() : null,
  };
}
