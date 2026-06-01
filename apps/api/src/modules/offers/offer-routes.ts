import {
  OfferAdminListQuerySchema,
  OfferAdminListResponseSchema,
  OfferAttachPhotosInputSchema,
  OfferCreateSchema,
  OfferListResponseSchema,
  OfferOutputSchema,
  OfferRejectInputSchema,
  OfferRequestChangesInputSchema,
  OfferRetireInputSchema,
  OfferStatusSchema,
  OfferSuspendInputSchema,
  OfferUpdateSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { assertModeratorForProducer, scopeOfferWhereForModerator } from '../assignments/index.js';
import {
  assertOwnership,
  requireProducerOrDelegate,
  requireRole,
  resolveAuditActor,
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
      // Producteur direct OU téléconseiller/admin via session déléguée : on
      // résout le producteur cible (ownerUserId) pour lister SES offres.
      const { ownerUserId } = requireProducerOrDelegate(req);
      const offers = await offerService.listMine(ownerUserId, req.query.status);
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
      const created = await offerService.create(ownerUserId, req.body, resolveAuditActor(req), req);
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
      return offerService.update(resolveAuditActor(req), req.params.id, req.body, req);
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
      return offerService.attachPhotos(resolveAuditActor(req), req.params.id, req.body, req);
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
      return offerService.submit({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/withdraw',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      // Owner OU délégué : repasse une offre `pending` en `draft` pour la modifier.
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      return offerService.withdraw({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/validate',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      // Modération scopée : admin = tout ; téléconseiller = ses producteurs affectés.
      const owner = await loadOfferOwner(req.params.id);
      await assertModeratorForProducer(req, owner);
      return offerService.validate({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/request-changes',
    {
      schema: {
        params: OfferIdParamSchema,
        body: OfferRequestChangesInputSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      await assertModeratorForProducer(req, owner);
      return offerService.requestChanges({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        reason: req.body.reason,
        request: req,
      });
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
      const owner = await loadOfferOwner(req.params.id);
      await assertModeratorForProducer(req, owner);
      return offerService.reject({
        ...resolveAuditActor(req),
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
      // Suspendre = self-service producteur (sa propre offre) / délégation, OU
      // modération MATA. Le téléconseiller HORS session est borné à ses
      // producteurs affectés (assertModeratorForProducer) ; producteur, admin
      // et délégation passent par assertOwnership.
      const owner = await loadOfferOwner(req.params.id);
      if (req.user?.role === 'teleconsultant' && !req.actingOnBehalfOf) {
        await assertModeratorForProducer(req, owner);
      } else {
        assertOwnership(req, owner);
      }
      return offerService.suspend({
        ...resolveAuditActor(req),
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
      // Réactiver : même politique que suspendre (self-service / délégation via
      // assertOwnership ; téléconseiller-modération borné à ses affectations).
      const owner = await loadOfferOwner(req.params.id);
      if (req.user?.role === 'teleconsultant' && !req.actingOnBehalfOf) {
        await assertModeratorForProducer(req, owner);
      } else {
        assertOwnership(req, owner);
      }
      return offerService.reactivate({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/archive',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      return offerService.archive({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/unarchive',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      return offerService.unarchive({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/relist',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      assertOwnership(req, owner);
      return offerService.relist({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        request: req,
      });
    },
  );

  // Retrait unilatéral par MATA (modération). VERROU : pas d'assertOwnership —
  // le producteur ne peut PAS retirer/restaurer. Téléconseiller borné à ses
  // producteurs affectés ; admin = tout.
  typed.post(
    '/v1/offers/:id/retire',
    {
      schema: {
        params: OfferIdParamSchema,
        body: OfferRetireInputSchema,
        response: { 200: OfferOutputSchema },
      },
    },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      await assertModeratorForProducer(req, owner);
      return offerService.retire({
        ...resolveAuditActor(req),
        offerId: req.params.id,
        reason: req.body.reason,
        request: req,
      });
    },
  );

  typed.post(
    '/v1/offers/:id/restore',
    { schema: { params: OfferIdParamSchema, response: { 200: OfferOutputSchema } } },
    async (req) => {
      const owner = await loadOfferOwner(req.params.id);
      await assertModeratorForProducer(req, owner);
      return offerService.restore({
        ...resolveAuditActor(req),
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
      requireRole(req, 'admin', 'teleconsultant');
      // Portée de modération : un téléconseiller ne voit que ses producteurs
      // affectés (admin/allProducers → tout ; aucune affectation → rien).
      const scopeWhere = await scopeOfferWhereForModerator(req);
      return offerService.listAdmin(req.query, scopeWhere);
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
