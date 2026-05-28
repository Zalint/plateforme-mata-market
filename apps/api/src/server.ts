import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { DomainError } from '@mata/shared/errors';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { authPlugin, createKeycloakVerifier } from './modules/auth/index.js';
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
    logger,
    genReqId: () => `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    disableRequestLogging: false,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [env.PUBLIC_WEB_URL],
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
  });

  // Auth Keycloak — obligatoire dès le démarrage (refuse de booter sans).
  const kcConfig = requireKeycloakConfig();
  const verifier = createKeycloakVerifier(kcConfig);
  await app.register(authPlugin, { verifier });

  await app.register(healthRoutes);
  await app.register(authRoutes);

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
