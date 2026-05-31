import { defineConfig } from 'vitest/config';

/**
 * Config dédiée aux tests d'intégration : nécessite Docker (testcontainers).
 *
 * Lancement : `pnpm --filter @mata/api test:integration`
 *
 * Le `globalSetup` démarre un container Postgres 18 jetable, applique les
 * migrations et expose la `DATABASE_URL` dans `process.env` AVANT que les
 * tests n'importent quoi que ce soit qui touche à Prisma.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
    globalSetup: ['./src/__tests__/integration-setup.ts'],
    // Containers prennent du temps à démarrer + migrations à appliquer
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Sérialise les tests dans un seul worker pour partager le container PG
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
