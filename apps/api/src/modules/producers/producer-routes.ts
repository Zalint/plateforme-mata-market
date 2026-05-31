import {
  BankDetailsClearSchema,
  BankDetailsRevealResponseSchema,
  BankDetailsUpdateInputSchema,
  ProducerAdminListQuerySchema,
  ProducerAdminListResponseSchema,
  ProducerBlacklistInputSchema,
  ProducerProfileAdminSchema,
  ProducerProfileCreateSchema,
  ProducerProfilePublicSchema,
  ProducerProfileUpdateSchema,
  ProducerRatingCreateSchema,
  ProducerSuspendInputSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { assertActionAllowedDuringTeleconsult } from '../teleconsult/index.js';
import { bankDetailsService } from './bank-details-service.js';
import { producerService } from './producer-service.js';

const UserIdParamSchema = z.object({ userId: UuidSchema });
const ProducerIdParamSchema = z.object({ producerId: UuidSchema });

const MyProfileResponseSchema = z.object({
  profile: ProducerProfilePublicSchema.nullable(),
});

/**
 * Routes producteurs · CRUD profil + transitions admin + bank_details.
 *
 * Découpage des autorisations :
 *  - /v1/producers/me*                : producteur sur son propre profil
 *  - /v1/producers (liste/detail)     : admin only
 *  - /v1/producers/:userId/validate   : admin only
 *  - /v1/producers/:userId/suspend    : admin only
 *  - /v1/producers/:userId/blacklist  : admin only
 *  - /v1/producers/me/bank-details    : producteur sur son propre profil
 *  - /v1/producers/:userId/bank-details/reveal : admin only (audité)
 */
export async function producerRoutes(app: FastifyInstance): Promise<void> {
  // Le type provider est appliqué globalement sur l'app au boot (server.ts),
  // mais la signature `FastifyInstance` ne le porte pas à la frontière du
  // plugin. On le réapplique localement pour bénéficier de l'inférence Zod
  // sur req.body / req.params / req.query.
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // /me — profil du producteur courant

  typed.get(
    '/v1/producers/me',
    { schema: { response: { 200: MyProfileResponseSchema } } },
    async (req) => {
      const user = requireUser(req);
      const profile = await producerService.getMyProfile(user.id);
      return { profile };
    },
  );

  typed.post(
    '/v1/producers/me',
    {
      schema: {
        body: ProducerProfileCreateSchema,
        response: { 201: ProducerProfilePublicSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      const created = await producerService.createMyProfile(user.id, req.body, req);
      return reply.code(201).send(created);
    },
  );

  typed.patch(
    '/v1/producers/me',
    {
      schema: {
        body: ProducerProfileUpdateSchema,
        response: { 200: ProducerProfilePublicSchema },
      },
    },
    async (req) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      return producerService.updateMyProfile(user.id, req.body, req);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Bank details · /me (producteur self) + reveal (admin)

  typed.put(
    '/v1/producers/me/bank-details',
    {
      schema: {
        body: BankDetailsUpdateInputSchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      // Lot 6 — refuse pendant session téléconseil (whitelist forbidden).
      // Si un téléconseiller a un X-Teleconsult-Session-Id et tente cette
      // route via délégation, c'est refusé + audité.
      await assertActionAllowedDuringTeleconsult(req, 'producer.bank_details.update');
      await bankDetailsService.update(
        { actorUserId: user.id, targetUserId: user.id, request: req },
        req.body,
      );
      return reply.code(204).send();
    },
  );

  typed.post(
    '/v1/producers/:userId/bank-details/reveal',
    {
      schema: {
        params: UserIdParamSchema,
        response: { 200: BankDetailsRevealResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      const clear = await bankDetailsService.reveal({
        actorUserId: user.id,
        targetUserId: req.params.userId,
        request: req,
      });
      // Re-validation défensive avant sortie réseau.
      return BankDetailsClearSchema.parse(clear);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Notation producteur (Lot 9) · client authentifié, commande livrée dont il
  // est propriétaire. 1 note par (commande, producteur).

  typed.post(
    '/v1/producers/:producerId/ratings',
    {
      schema: {
        params: ProducerIdParamSchema,
        body: ProducerRatingCreateSchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      requireRole(req, 'client_pro', 'client_particulier');
      const user = requireUser(req);
      await producerService.createRating({
        actorUserId: user.id,
        producerUserId: req.params.producerId,
        input: req.body,
        request: req,
      });
      return reply.code(204).send();
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Admin : liste + détail + transitions

  typed.get(
    '/v1/producers',
    {
      schema: {
        querystring: ProducerAdminListQuerySchema,
        response: { 200: ProducerAdminListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      return producerService.listAdmin(req.query);
    },
  );

  typed.get(
    '/v1/producers/:userId',
    {
      schema: {
        params: UserIdParamSchema,
        response: { 200: ProducerProfileAdminSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      return producerService.getByIdAdmin(req.params.userId);
    },
  );

  typed.post(
    '/v1/producers/:userId/validate',
    {
      schema: {
        params: UserIdParamSchema,
        response: { 200: ProducerProfilePublicSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return producerService.validate({
        actorUserId: user.id,
        targetUserId: req.params.userId,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/producers/:userId/suspend',
    {
      schema: {
        params: UserIdParamSchema,
        body: ProducerSuspendInputSchema,
        response: { 200: ProducerProfilePublicSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return producerService.suspend({
        actorUserId: user.id,
        targetUserId: req.params.userId,
        reason: req.body.reason,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/producers/:userId/blacklist',
    {
      schema: {
        params: UserIdParamSchema,
        body: ProducerBlacklistInputSchema,
        response: { 200: ProducerProfilePublicSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return producerService.blacklist({
        actorUserId: user.id,
        targetUserId: req.params.userId,
        reason: req.body.reason,
        request: req,
      });
    },
  );
}
