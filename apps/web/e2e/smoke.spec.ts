import { expect, test } from '@playwright/test';

/**
 * Smoke E2E Lot 1 :
 *  1. La racine redirige vers /welcome
 *  2. /welcome affiche le bouton « Se connecter via Keycloak »
 *  3. Le lien pointe bien vers /api/auth/login
 *
 * Le flow Keycloak complet (login + callback + producer/home) sera ajouté au
 * Lot 9 quand on aura un Keycloak stable en CI.
 */

test('welcome page renders and links to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: /MATA · Du champ à l/ })).toBeVisible();

  const loginLink = page.getByRole('link', { name: /Se connecter via Keycloak/i });
  await expect(loginLink).toBeVisible();
  await expect(loginLink).toHaveAttribute('href', '/api/auth/login');
});

test('login page renders without crash and links back', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Continuer avec Keycloak/i })).toBeVisible();
});

test('protected route redirects unauthenticated user to login', async ({ page }) => {
  await page.goto('/producer/home');
  // Le middleware doit rediriger vers /auth/login car pas de cookie refresh
  await expect(page).toHaveURL(/\/auth\/login/);
});
