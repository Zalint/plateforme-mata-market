import { defineConfig, devices } from '@playwright/test';

/**
 * Config Playwright E2E FULL-STACK (Lot 9).
 *
 * Distincte du smoke (`playwright.config.ts`, gardé léger pour la CI). Ici on
 * teste les vrais parcours métier de bout en bout contre la stack réelle :
 *   - Keycloak (auth OIDC + PKCE) + Postgres seedé  → cf. e2e/fullstack/global-setup.ts
 *   - apps/api Fastify (port 4000)
 *   - apps/web Next.js dev (port 3000)
 *   - mock Bictorys (port 4001, cf. apps/api/scripts/bictorys-mock-server.ts)
 *
 * Lancement : `pnpm --filter @mata/web test:e2e:fullstack`
 *
 * Local-only (pas branché en CI — Keycloak+Postgres+seed en GitHub Actions
 * est lourd ; dette tracée docs/BACKLOG.md). `reuseExistingServer` permet de
 * réutiliser une stack déjà lancée (`pnpm dev` + `pnpm --filter @mata/api
 * bictorys:mock`) pour itérer vite.
 *
 * Référence : ARCHITECTURE.md §10 « Tests E2E essentiels » + CLAUDE.md §G6.
 */
export default defineConfig({
  testDir: './e2e/fullstack',
  globalSetup: './e2e/fullstack/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Le mock Bictorys redirige (302) entre origines localhost:4001 ↔ :3000 ;
    // pas de pré-collecte de permissions ici (cf. push spec qui gère les siennes).
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @mata/api bictorys:mock',
      url: 'http://localhost:4001/_health',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @mata/api dev',
      url: 'http://localhost:4000/v1/health',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @mata/web dev',
      url: 'http://localhost:3000/welcome',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
