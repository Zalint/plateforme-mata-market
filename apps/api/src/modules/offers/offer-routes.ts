import {
  OfferAdminListQuerySchema,
  OfferAdminListResponseSchema,
  OfferAttachPhotosInputSchema,
  OfferCreateSchema,
  OfferListResponseSchema,
  OfferOutputSchema,
  OfferRejectInputSchema,
  OfferStatusSchema,
  OfferSuspendInputSchema,
  OfferUpdateSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  assertOwnership,
  requireProducerOrDelegate,
  requireRole,
  requireUser,
} from '../auth/index.js';
import { offerService } from './offer-service.js';

const OfferIdParamSchema = z.object({ id: UuidSchema });

const MyOffersQuerySchema = z.object({
  status: OfferStatusSchema.optional(),
});

export async function offerRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // Producer self

  typed.get(
    '/v1/offers/me',
    {
      schema: {
        querystring: MyOffersQuerySchema,
        response: { 200: OfferListResponseSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const offers = await offerService.listMine(user.id, req.query.status);
      return { offers };
    },
  );

  typed.post(
    '/v1/offers',
    {
      schema: {
        body: OfferCreateSchema,
        response: { 201: OfferOutputSchema },
      },
    },
    async (req, reply) => {
      // Lot 6 — accepte producer direct OU téléconseiller/admin via délégation.
      // mockup §2934 : "Créer/modifier/suspendre offre" est dans la whitelist
      // des actions AUTORISÉES en session déléguée.
      const { ownerUserId } = requireProducerOrDelegate(req);
      const created = await offerService.create(ownerUserId, req.body, req);
      return reply.code(201).send(created);
    },
  );

  // GET /:id — accessible owner OU admin (vérif via ownership lookup)
  typed.get(
    '/v1/offers/:id',
    {
      schema: {
        params: OfferIdParamSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      return offerService.getById(req.params.id);
    },
  );

  typed.patch(
    '/v1/offers/:id',
    {
      schema: {
        params: OfferIdParamSchema,
        body: OfferUpdateSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      const user = requireUser(req);
      return offerService.update(user.id, req.params.id, req.body, req);
    },
  );

  typed.put(
    '/v1/offers/:id/photos',
    {
      schema: {
        params: OfferIdParamSchema,
        body: OfferAttachPhotosInputSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      const user = requireUser(req);
      return offerService.attachPhotos(user.id, req.params.id, req.body, req);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Transitions

  typed.post(
    '/v1/offers/:id/submit',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      const user = requireUser(req);
      return offerService.submit({ actorUserId: user.id, offerId: req.params.id, request: req });
    },
  );

  typed.post(
    '/v1/offers/:id/validate',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return offerService.validate({ actorUserId: user.id, offerId: req.params.id, request: req });
    },
  );

  typed.post(
    '/v1/offers/:id/reject',
    {
      schema: {
        params: OfferIdParamSchema,
        body: OfferRejectInputSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const user = requireUser(req);
      return offerService.reject({
        actorUserId: user.id,
        offerId: req.params.id,
        reason: req.body.reason,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/suspend',
    {
      schema: {
        params: OfferIdParamSchema,
        body: OfferSuspendInputSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      // Owner OU admin
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      const user = requireUser(req);
      return offerService.suspend({
        actorUserId: user.id,
        offerId: req.params.id,
        reason: req.body.reason,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/reactivate',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      const user = requireUser(req);
      return offerService.reactivate({
        actorUserId: user.id,
        offerId: req.params.id,
        request: req,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Admin : queue de validation

  typed.get(
    '/v1/offers',
    {
      schema: {
        querystring: OfferAdminListQuerySchema,
        response: { 200: OfferAdminListResponseSchema },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      return offerService.listAdmin(req.query);
    },
  );
}

/**
 * Charge le producerUserId de l'offre pour le passer à assertOwnership.
 * Throw NOT_FOUND si l'offre n'existe pas.
 */
async function loadOfferOwner(offerId: string): Promise<string> {
  const row = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { producerUserId: true },
  });
  if (!row) {
    const { DomainError } = await import('@mata/shared/errors');
    throw new DomainError('NOT_FOUND', 'Offre introuvable');
  }
  return row.producerUserId;
}
