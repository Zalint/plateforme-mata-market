import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * globalSetup vitest pour les tests d'intégration.
 *
 * Démarre un container Postgres 18 jetable, applique les migrations Prisma,
 * pose `DATABASE_URL`, `ENCRYPTION_KEY` et `NODE_ENV=test` dans
 * `process.env` AVANT que les modules de test n'importent prisma.
 *
 * Référence : ARCHITECTURE.md §10, CLAUDE.md §G6 « testcontainers + vraie
 * Postgres. Jamais mocker Prisma. »
 */

let container: StartedPostgreSqlContainer | null = null;

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('mata_test')
    .withUsername('mata')
    .withPassword('mata')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.NODE_ENV = 'test';

  // Applique les migrations via la CLI Prisma. `pnpm --filter @mata/api
  // test:integration` est invoqué depuis apps/api donc `process.cwd()` y
  // pointe ; prisma.config.ts attend ce cwd pour trouver schema.prisma et
  // .env (ce dernier n'override pas notre DATABASE_URL car process.loadEnvFile
  // n'écrase pas les vars existantes).
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
  container = null;
}
