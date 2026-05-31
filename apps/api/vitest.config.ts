import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Les tests d'intégration ont leur propre config + globalSetup
    // (vitest.integration.config.ts). On les exclut ici pour que `pnpm test`
    // reste rapide et n'exige pas Docker.
    exclude: ['node_modules', 'dist', '**/*.integration.test.ts'],
  },
});
