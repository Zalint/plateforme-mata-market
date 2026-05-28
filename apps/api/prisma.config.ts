import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Config Prisma 7. Remplace les anciennes valeurs `datasource.url` et
 * `seed` du package.json. Voir https://pris.ly/d/prisma7-client-config.
 *
 * Important : ce fichier est lu par Prisma CLI (migrate, db push, generate
 * meta), pas par l'application runtime. Le runtime utilise le driverAdapter
 * configuré dans `src/lib/prisma.ts`.
 */

// Charge .env si présent (même logique que src/env.ts)
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Prisma CLI commands');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seeds/dev-seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
