import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { DomainError } from '@mata/shared/errors';
import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { authPlugin, createKeycloakVerifier } from './modules/auth/index.js';
import { catalogRoutes } from './modules/catalog/index.js';
import { dashboardRoutes } from './modules/dashboard/index.js';
import { guestPlugin } from './modules/guest/index.js';
import { notificationRoutes } from './modules/notifications/index.js';
import { offerRoutes } from './modules/offers/index.js';
import { orderRoutes } from './modules/orders/index.js';
import { paymentRoutes } from './modules/payments/index.js';
import { payoutRoutes } from './modules/payouts/index.js';
import { pickupRoutes } from './modules/pickups/index.js';
import { pricingRoutes } from './modules/pricing/index.js';
import { producerRoutes } from './modules/producers/index.js';
import { siteRoutes } from './modules/sites/index.js';
import { teleconsultPlugin, teleconsultRoutes } from './modules/teleconsult/index.js';
import { uploadsRoutes } from './modules/uploads/index.js';
import { userRoutes } from './modules/users/index.js';
import { zoneRoutes } from './modules/zones/index.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';

function requireKeycloakConfig(): {
  keycloakUrl: string;
  realm: string;
  audience: string;
} {
  if (!env.KEYCLOAK_URL || !env.KEYCLOAK_REALM || !env.KEYCLOAK_CLIENT_API_AUDIENCE) {
    throw new Error(
      'Keycloak config missing : KEYCLOAK_URL, KEYCLOAK_REALM et KEYCLOAK_CLIENT_API_AUDIENCE sont requis (hors NODE_ENV=test).',
    );
  }
  return {
    keycloakUrl: env.KEYCLOAK_URL,
    realm: env.KEYCLOAK_REALM,
    audience: env.KEYCLOAK_CLIENT_API_AUDIENCE,
  };
}

async function buildServer(): Promise<void> {
  const app = Fastify({
    // Fastify 5 : passer l'instance pino via `loggerInstance` (l'option
    // `logger` accepte désormais uniquement un objet de configuration).
    loggerInstance: logger,
    genReqId: () => `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    disableRequestLogging: false,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: false,
    // L'API est servie sur un sous-domaine distinct du web (api.<domaine> vs
    // app.<domaine>, et localhost:4000 vs :3000 en dev). Le défaut Helmet
    // `crossOriginResourcePolicy: same-origin` ferait BLOQUER la réponse par le
    // navigateur (« Failed to fetch ») même quand CORS l'autorise. On passe en
    // `cross-origin` : la lecture des données reste gardée par CORS ci-dessous
    // (origin restreint à PUBLIC_WEB_URL).
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, {
    origin: [env.PUBLIC_WEB_URL],
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
  });

  // fastify-raw-body : capture le corps brut UNIQUEMENT pour les routes qui
  // déclarent `config.rawBody = true` (CLAUDE.md §G5 « activé route par route »).
  // Critique pour /v1/payments/webhook : la vérif HMAC se fait sur le RAW BODY.
  //
  // Options :
  //  - global: false        → opt-in par route via config.rawBody
  //  - runFirst: true       → capture AVANT le body parser JSON
  //  - encoding: false      → retourne un Buffer (pas une string décodée)
  //  - field: 'rawBody'     → req.rawBody
  await app.register(rawBody, {
    global: false,
    runFirst: true,
    encoding: false,
    field: 'rawBody',
  });

  // Auth Keycloak — obligatoire dès le démarrage (refuse de booter sans).
  const kcConfig = requireKeycloakConfig();
  const verifier = createKeycloakVerifier(kcConfig);
  await app.register(authPlugin, { verifier });

  // Lot 6 · Téléconseil : résout req.actingOnBehalfOf depuis l'en-tête
  // X-Teleconsult-Session-Id (CLAUDE.md §G8). DOIT être enregistré APRÈS
  // auth-plugin et AVANT toutes les routes métier.
  await app.register(teleconsultPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(zoneRoutes);
  await app.register(producerRoutes);
  await app.register(siteRoutes);
  await app.register(offerRoutes);
  await app.register(catalogRoutes);
  await app.register(pricingRoutes);
  await app.register(orderRoutes);
  await app.register(paymentRoutes); // Lot 5
  await app.register(payoutRoutes); // Lot 5
  await app.register(teleconsultRoutes); // Lot 6
  await app.register(pickupRoutes); // Lot 7
  await app.register(notificationRoutes); // Lot 7
  await app.register(dashboardRoutes); // Lot 9 — KPIs accueil admin
  await app.register(userRoutes); // Lot 9 — création de comptes par un admin
  await app.register(guestPlugin); // Lot 8 — mode invité (/v1/guest/*)
  await app.register(uploadsRoutes);

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request.error');
    if (err instanceof DomainError) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        details: err.details,
        requestId: req.id,
      });
    }
    const statusCode = err.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: err.name,
      message: statusCode >= 500 ? 'Internal Server Error' : err.message,
      requestId: req.id,
    });
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutdown.start');
    try {
      await app.close();
      await prisma.$disconnect();
      app.log.info('shutdown.done');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown.error');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'server.start.failed');
    process.exit(1);
  }
}

await buildServer();
