import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { healthRoutes } from './routes/health.js';

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

  await app.register(healthRoutes);

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request.error');
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
