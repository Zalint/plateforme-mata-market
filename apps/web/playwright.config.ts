import { defineConfig, devices } from '@playwright/test';

/**
 * Config Playwright minimale pour le smoke E2E du Lot 1.
 *
 * Stratégie : on lance `next start` localement, on visite /welcome et on
 * vérifie que le bouton de login est présent. Les vrais flows (auth complet
 * Keycloak, parcours métier) arrivent au Lot 9.
 *
 * Référence : ARCHITECTURE.md §10 « Tests E2E essentiels ».
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm start',
        port: 3000,
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
        env: {
          KEYCLOAK_URL: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
          KEYCLOAK_REALM: process.env.KEYCLOAK_REALM ?? 'mata',
          KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID ?? 'mata-web',
          KEYCLOAK_REDIRECT_URI:
            process.env.KEYCLOAK_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
          API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:4000',
          NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
          NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'mata',
          NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'mata-web',
        },
      },
});
