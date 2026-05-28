import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../env.js';

/**
 * Client Prisma 7 + driver adapter pg.
 *
 * Depuis Prisma 7, la connection string n'est plus déclarée dans
 * `schema.prisma`. On passe par un driver adapter à la construction du
 * client, ce qui permet aussi de basculer plus tard vers un autre driver
 * (pg-native, edge runtime) sans toucher au schéma.
 *
 * Référence : ARCHITECTURE.md §6 + https://pris.ly/d/prisma7-client-config
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
