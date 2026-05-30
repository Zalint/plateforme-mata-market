import { DomainError } from '@mata/shared/errors';
import {
  TeleconsultCodeGenerateOutputSchema,
  TeleconsultSessionCloseInputSchema,
  TeleconsultSessionOptionalSchema,
  TeleconsultSessionOutputSchema,
  TeleconsultSessionStartInputSchema,
  UuidSchema,
} from '@mata/shared/schemas';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth/index.js';
import { codeService } from './code-service.js';
import { assertActionAllowedDuringTeleconsult } from './forbid-during-teleconsult.js';
import { sessionService } from './session-service.js';

/**
 * Routes /v1/teleconsult/* · génération de code, démarrage / fermeture de
 * session, lectures (Lot 6).
 *
 * Convention CLAUDE.md §G2 : routes minces, permissions vérifiées EXPLICITEMENT.
 */

const SessionIdParamSchema = z.object({ id: UuidSchema });

export async function teleconsultRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─────────────────────────────────────────────────────────────
  // POST /v1/teleconsult/codes
  // Producteur lui-même → génère un code 6 chiffres (UNE FOIS en clair).

  typed.post(
    '/v1/teleconsult/codes',
    {
      schema: { response: { 201: TeleconsultCodeGenerateOutputSchema } },
    },
    async (req, reply) => {
      requireRole(req, 'producer');
      const user = requireUser(req);
      const result = await codeService.generateForProducer({
        producerUserId: user.id,
        request: req,
      });
      return reply.code(201).send(result);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/teleconsult/sessions
  // Téléconseiller / admin → vérifie code, démarre session 15 min.
  // Garde-fou : pas de session-dans-session (whitelist forbidden).

  typed.post(
    '/v1/teleconsult/sessions',
    {
      schema: {
        body: TeleconsultSessionStartInputSchema,
        response: { 201: TeleconsultSessionOutputSchema },
      },
    },
    async (req, reply) => {
      requireRole(req, 'teleconsultant', 'admin');
      const user = requireUser(req);

      // Si déjà dans une session déléguée → refuse (whitelist forbidden).
      await assertActionAllowedDuringTeleconsult(req, 'teleconsult.session.start');

      const session = await sessionService.start({
        teleconsultantUserId: user.id,
        producerUsername: req.body.producerUsername,
        code: req.body.code,
        request: req,
      });
      return reply.code(201).send(session);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // POST /v1/teleconsult/sessions/:id/close
  // Fermeture explicite — par le téléconseiller, le producteur, ou un admin.

  typed.post(
    '/v1/teleconsult/sessions/:id/close',
    {
      schema: {
        params: SessionIdParamSchema,
        body: TeleconsultSessionCloseInputSchema,
        response: { 200: TeleconsultSessionOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const session = await sessionService.getById(req.params.id);

      // Permission compound : teleconsultant de la session, OR producer
      // concerné, OR admin/super_admin.
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isTeleconsultantOfSession = session.teleconsultantUserId === user.id;
      const isProducerOfSession = session.producer.userId === user.id;
      if (!isAdmin && !isTeleconsultantOfSession && !isProducerOfSession) {
        throw new DomainError('FORBIDDEN', 'Vous ne pouvez pas fermer cette session');
      }

      const closedByRole = isAdmin
        ? user.role === 'super_admin'
          ? 'super_admin'
          : 'admin'
        : isTeleconsultantOfSession
          ? 'teleconsultant'
          : 'producer';

      return sessionService.close({
        sessionId: req.params.id,
        closedByUserId: user.id,
        closedByRole,
        reasonOverride: req.body.reason,
        request: req,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/teleconsult/sessions/active
  // Session active du téléconseiller courant (ou null).

  typed.get(
    '/v1/teleconsult/sessions/active',
    {
      schema: { response: { 200: TeleconsultSessionOptionalSchema } },
    },
    async (req) => {
      requireRole(req, 'teleconsultant', 'admin');
      const user = requireUser(req);
      return sessionService.getActiveForTeleconsultant(user.id);
    },
  );

  // ─────────────────────────────────────────────────────────────
  // GET /v1/teleconsult/sessions/:id
  // Détail (admin / teleconsultant de la session / producer concerné).

  typed.get(
    '/v1/teleconsult/sessions/:id',
    {
      schema: {
        params: SessionIdParamSchema,
        response: { 200: TeleconsultSessionOutputSchema },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const session = await sessionService.getById(req.params.id);

      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      if (isAdmin) return session;
      if (session.teleconsultantUserId === user.id) return session;
      if (session.producer.userId === user.id) return session;
      throw new DomainError('FORBIDDEN', 'Accès session refusé');
    },
  );
}
