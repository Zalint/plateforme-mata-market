import { expect, type Page } from '@playwright/test';

/**
 * Helpers d'authentification E2E full-stack (Lot 9).
 *
 * `loginAs` pilote le vrai flow OIDC Authorization Code + PKCE de bout en bout :
 *   1. GET /api/auth/login → 302 vers le formulaire Keycloak (realm `mata`)
 *   2. Remplit le formulaire de login Keycloak (#username / #password)
 *   3. Keycloak redirige vers /api/auth/callback → pose le cookie refresh
 *      HttpOnly et redirige vers /producer/home
 *   4. On attend d'être revenu sur l'origine web (localhost:3000)
 *
 * Les utilisateurs de test viennent du realm-export + seed dev
 * (`pnpm --filter @mata/api db:seed`). Mot de passe commun : `mata`.
 */

export type SeedUser = {
  username: string;
  password: string;
  /** Page d'atterrissage attendue après le callback (sanity check). */
  landing?: RegExp;
};

export const SEED_USERS = {
  client: { username: 'lacalebasse.client', password: 'mata' },
  admin: { username: 'aissatou.sow', password: 'mata' },
  producer: { username: 'mor.diop', password: 'mata' },
  teleconsultant: { username: 'ibrahima.ndiaye', password: 'mata' },
} as const satisfies Record<string, SeedUser>;

/**
 * Connecte `page` via le flow Keycloak réel et établit le cookie refresh.
 *
 * Après l'appel, `page` est sur l'origine web avec une session valide. Le test
 * peut ensuite naviguer librement vers les routes protégées.
 */
export async function loginAs(page: Page, user: SeedUser): Promise<void> {
  await page.goto('/api/auth/login');

  // Formulaire de login Keycloak (template standard : #username / #password / #kc-login).
  await page.waitForSelector('#username', { timeout: 30_000 });
  await page.fill('#username', user.username);
  await page.fill('#password', user.password);
  await Promise.all([
    page.waitForURL((url) => url.port === '3000', { timeout: 30_000 }),
    page.click('#kc-login'),
  ]);

  // On doit être revenu sur l'app web (pas resté sur Keycloak avec une erreur).
  expect(new URL(page.url()).port).toBe('3000');
}
