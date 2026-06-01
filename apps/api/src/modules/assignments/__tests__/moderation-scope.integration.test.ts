import { DomainError } from '@mata/shared/errors';
import type { User, Zone } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { assignmentRoutes } from '../../assignments/index.js';
import authPlugin from '../../auth/auth-plugin.js';
import type { KeycloakVerifier } from '../../auth/keycloak-verifier.js';
import { offerRoutes } from '../../offers/index.js';

/**
 * Test d'intégration · PORTÉE DE MODÉRATION (affectations producteur ↔
 * téléconseiller). Vérifie que :
 *  - la file de validation est filtrée selon les 3 états (tout / sous-ensemble / rien)
 *  - la modération hors périmètre est refusée (403 + message)
 *  - l'admin voit/modère tout
 *  - la route admin PUT /v1/assignments configure la portée
 *
 * Stub Keycloak : token Bearer = keycloakId (résolu en base par l'auth-plugin).
 */

const stubVerifier: KeycloakVerifier = {
  verify: (token: string) =>
    Promise.resolve({ sub: token, exp: 9_999_999_999, iat: 0, iss: 'test' }),
};

let zone: Zone;
let admin: User;
let tc1: User;
let tc2: User;
let p1: User;
let p2: User;
let p1OfferId: string;
let p2OfferId: string;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(authPlugin, { verifier: stubVerifier });
  await app.register(offerRoutes);
  await app.register(assignmentRoutes);
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

async function makeProducerWithOffer(tag: string): Promise<{ producer: User; offerId: string }> {
  const producer = await prisma.user.create({
    data: {
      keycloakId: `integ:modscope:${tag}`,
      displayName: `Producteur ${tag}`,
      role: 'producer',
      phone: `+2217700001${tag === 'p1' ? '01' : '02'}`,
    },
  });
  const profile = await prisma.producerProfile.create({
    data: { userId: producer.id, type: 'poultry', status: 'validated', zoneId: zone.id },
  });
  const site = await prisma.productionSite.create({
    data: {
      producerUserId: profile.userId,
      name: `Site ${tag}`,
      type: 'poulailler',
      zoneId: zone.id,
    },
  });
  const offer = await prisma.offer.create({
    data: {
      producerUserId: producer.id,
      siteId: site.id,
      categorySlug: 'poultry',
      title: `Offre ${tag}`,
      unit: 'unit',
      quantity: 10,
      priceFcfa: 3_000,
      availableFrom: new Date('2026-06-01'),
      status: 'pending',
      submittedAt: new Date(),
    },
  });
  return { producer, offerId: offer.id };
}

beforeAll(async () => {
  zone = await prisma.zone.upsert({
    where: { slug: 'modscope-pout' },
    update: {},
    create: { slug: 'modscope-pout', name: 'Pout (modscope)', region: 'Thiès' },
  });
  admin = await prisma.user.create({
    data: { keycloakId: 'integ:modscope:admin', displayName: 'Admin', role: 'admin' },
  });
  tc1 = await prisma.user.create({
    data: { keycloakId: 'integ:modscope:tc1', displayName: 'TC1', role: 'teleconsultant' },
  });
  tc2 = await prisma.user.create({
    data: { keycloakId: 'integ:modscope:tc2', displayName: 'TC2', role: 'teleconsultant' },
  });
  const a = await makeProducerWithOffer('p1');
  const b = await makeProducerWithOffer('p2');
  p1 = a.producer;
  p1OfferId = a.offerId;
  p2 = b.producer;
  p2OfferId = b.offerId;
});

afterAll(async () => {
  const userIds = [admin.id, tc1.id, tc2.id, p1.id, p2.id];
  await prisma.teleconsultantAssignment.deleteMany({
    where: { teleconsultantUserId: { in: [tc1.id, tc2.id] } },
  });
  await prisma.teleconsultantScope.deleteMany({
    where: { teleconsultantUserId: { in: [tc1.id, tc2.id] } },
  });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.offer.deleteMany({ where: { producerUserId: { in: [p1.id, p2.id] } } });
  await prisma.productionSite.deleteMany({ where: { producerUserId: { in: [p1.id, p2.id] } } });
  await prisma.producerProfile.deleteMany({ where: { userId: { in: [p1.id, p2.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.zone.deleteMany({ where: { id: zone.id } });
  await prisma.$disconnect();
});

function as(user: User): { authorization: string } {
  return { authorization: `Bearer ${user.keycloakId}` };
}

describe('Portée de modération · file + actions', () => {
  it('admin configure la portée de TC1 = [P1] via PUT /v1/assignments', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/assignments/${tc1.id}`,
      headers: as(admin),
      payload: { allProducers: false, producerUserIds: [p1.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().producerUserIds).toEqual([p1.id]);
    await app.close();
  });

  it('TC1 (affecté à P1) ne voit que les offres de P1 dans la file', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/offers', headers: as(tc1) });
    expect(res.statusCode).toBe(200);
    const producerIds = res.json().offers.map((o: { producerUserId: string }) => o.producerUserId);
    expect(producerIds).toContain(p1.id);
    expect(producerIds).not.toContain(p2.id);
    await app.close();
  });

  it('TC2 (aucune affectation) ne voit AUCUNE offre', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/offers', headers: as(tc2) });
    expect(res.statusCode).toBe(200);
    expect(res.json().offers).toHaveLength(0);
    await app.close();
  });

  it('admin voit toutes les offres', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/offers', headers: as(admin) });
    const producerIds = res.json().offers.map((o: { producerUserId: string }) => o.producerUserId);
    expect(producerIds).toEqual(expect.arrayContaining([p1.id, p2.id]));
    await app.close();
  });

  it('TC1 valide une offre de P1 (200) mais pas de P2 (403 + message)', async () => {
    const app = await buildApp();

    const ok = await app.inject({
      method: 'POST',
      url: `/v1/offers/${p1OfferId}/validate`,
      headers: as(tc1),
      payload: {},
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('validated');

    const forbidden = await app.inject({
      method: 'POST',
      url: `/v1/offers/${p2OfferId}/validate`,
      headers: as(tc1),
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().message).toMatch(/affecté/i);
    await app.close();
  });

  it('TC2 passé en allProducers voit toutes les offres', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: `/v1/assignments/${tc2.id}`,
      headers: as(admin),
      payload: { allProducers: true, producerUserIds: [] },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/offers', headers: as(tc2) });
    const producerIds = res.json().offers.map((o: { producerUserId: string }) => o.producerUserId);
    expect(producerIds).toEqual(expect.arrayContaining([p1.id, p2.id]));
    await app.close();
  });
});
