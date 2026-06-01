import { DomainError } from '@mata/shared/errors';
import type { ProducerProfile, ProductionSite, User, Zone } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import authPlugin from '../../auth/auth-plugin.js';
import type { KeycloakVerifier } from '../../auth/keycloak-verifier.js';
import { offerRoutes } from '../offer-routes.js';

/**
 * Test d'intégration HTTP · gardes de rôle des transitions d'offre.
 *
 * Vérifie la politique d'autorisation des routes suspend/reactivate après
 * alignement sur la modération (CLAUDE.md §G8 « permissions par rôle vérifiées
 * EXPLICITEMENT à chaque endpoint ») :
 *  - le téléconseiller suspend/réactive comme l'admin (modération, sans session)
 *  - le producteur propriétaire garde le self-service sur SA propre offre
 *  - un rôle non autorisé (client) est rejeté 403
 *
 * Stub Keycloak : `verify(token)` renvoie `{ sub: token }` → le token Bearer EST
 * le `keycloakId` ; l'auth-plugin résout ensuite l'utilisateur en base (rôle).
 */

const stubVerifier: KeycloakVerifier = {
  verify: (token: string) =>
    Promise.resolve({ sub: token, exp: 9_999_999_999, iat: 0, iss: 'test' }),
};

let zone: Zone;
let producer: User;
let teleconsultant: User;
let client: User;
let profile: ProducerProfile;
let site: ProductionSite;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(authPlugin, { verifier: stubVerifier });
  await app.register(offerRoutes);
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({ error: err.name, message: err.message });
  });
  await app.ready();
  return app;
}

async function createValidatedOffer(): Promise<string> {
  const offer = await prisma.offer.create({
    data: {
      producerUserId: producer.id,
      siteId: site.id,
      categorySlug: 'poultry',
      title: 'Poulet (test garde rôle)',
      unit: 'unit',
      quantity: 20,
      priceFcfa: 3_000,
      availableFrom: new Date('2026-06-01'),
      status: 'validated',
    },
  });
  return offer.id;
}

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: 'offer-routes-auth-pout' },
    update: {},
    create: { slug: 'offer-routes-auth-pout', name: 'Pout (routes auth)', region: 'Thiès' },
  });
  producer = await prisma.user.create({
    data: {
      keycloakId: 'integ:offerauth:producer',
      displayName: 'Mor Diop (routes auth)',
      role: 'producer',
      phone: '+221770000090',
    },
  });
  teleconsultant = await prisma.user.create({
    data: {
      keycloakId: 'integ:offerauth:tc',
      displayName: 'Ibrahima Ndiaye (routes auth)',
      role: 'teleconsultant',
      phone: '+221770000091',
    },
  });
  client = await prisma.user.create({
    data: {
      keycloakId: 'integ:offerauth:client',
      displayName: 'Awa Ba (routes auth)',
      role: 'client_particulier',
      phone: '+221770000092',
    },
  });
  profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: 'Pout offer-routes-auth',
      type: 'poulailler',
      zoneId: zone.id,
    },
  });
});

beforeEach(async () => {
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
});

afterAll(async () => {
  await prisma.offer.deleteMany({ where: { siteId: site.id } });
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [producer.id, teleconsultant.id, client.id] } },
  });
  await prisma.productionSite.deleteMany({ where: { id: site.id } });
  await prisma.producerProfile.deleteMany({ where: { userId: producer.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [producer.id, teleconsultant.id, client.id] } },
  });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
  await prisma.$disconnect();
});

describe('POST /v1/offers/:id/suspend|reactivate · gardes de rôle', () => {
  it('téléconseiller (hors session) suspend puis réactive — comme l’admin', async () => {
    const app = await buildApp();
    const offerId = await createValidatedOffer();

    const suspend = await app.inject({
      method: 'POST',
      url: `/v1/offers/${offerId}/suspend`,
      headers: { authorization: `Bearer ${teleconsultant.keycloakId}` },
      payload: { reason: 'Contrôle qualité' },
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().status).toBe('suspended');

    const reactivate = await app.inject({
      method: 'POST',
      url: `/v1/offers/${offerId}/reactivate`,
      headers: { authorization: `Bearer ${teleconsultant.keycloakId}` },
      payload: {},
    });
    expect(reactivate.statusCode).toBe(200);
    expect(reactivate.json().status).toBe('validated');

    await app.close();
  });

  it('producteur propriétaire conserve le self-service sur SA propre offre', async () => {
    const app = await buildApp();
    const offerId = await createValidatedOffer();

    const suspend = await app.inject({
      method: 'POST',
      url: `/v1/offers/${offerId}/suspend`,
      headers: { authorization: `Bearer ${producer.keycloakId}` },
      payload: {},
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().status).toBe('suspended');

    await app.close();
  });

  it('client (rôle non autorisé) → 403', async () => {
    const app = await buildApp();
    const offerId = await createValidatedOffer();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/offers/${offerId}/suspend`,
      headers: { authorization: `Bearer ${client.keycloakId}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);

    await app.close();
  });
});
