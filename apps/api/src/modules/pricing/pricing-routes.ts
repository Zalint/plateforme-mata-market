import {
  PricingRuleCreateSchema,
  PricingRuleListQuerySchema,
  PricingRuleListResponseSchema,
  PricingRuleOutputSchema,
  PricingRuleUpdateSchema,
  PricingSimulateInputSchema,
  PricingSimulateOutputSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { pricingService } from './pricing-service.js';

/**
 * Routes /v1/pricing/* · admin uniquement au Lot 3.
 *
 * Lot 4 élargira `POST /v1/pricing/simulate` aux rôles producer/client
 * quand le catalogue/checkout afficheront un prix simulé.
 *
 * Convention CLAUDE.md §G2 : routes minces (parse → service → return),
 * la logique métier reste dans `pricing-service.ts`.
 */

const RuleIdParamSchema = z.object({ id: UuidSchema });

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // List rules (admin)

  typed.get(
    '/v1/pricing/rules',
    {
      schema: {
        querystring: PricingRuleListQuerySchema,
        response: { 200: PricingRuleListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const rules = await pricingService.listRules(req.query);
      return { rules };
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Get rule by id (admin)

  typed.get(
    '/v1/pricing/rules/:id',
    {
      schema: {
        params: RuleIdParamSchema,
        response: { 200: PricingRuleOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      return pricingService.getRule(req.params.id);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Create rule (admin)

  typed.post(
    '/v1/pricing/rules',
    {
      schema: {
        body: PricingRuleCreateSchema,
        response: { 201: PricingRuleOutputSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      const created = await pricingService.createRule(user.id, req.body, req);
      return reply.code(201).send(created);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Update rule (admin) → audit pricing.rule.update

  typed.patch(
    '/v1/pricing/rules/:id',
    {
      schema: {
        params: RuleIdParamSchema,
        body: PricingRuleUpdateSchema,
        response: { 200: PricingRuleOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return pricingService.updateRule(user.id, req.params.id, req.body, req);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Simulate (admin only Lot 3, élargi Lot 4)

  typed.post(
    '/v1/pricing/simulate',
    {
      schema: {
        body: PricingSimulateInputSchema,
        response: { 200: PricingSimulateOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      return pricingService.simulate(req.body);
    },
  );
}
