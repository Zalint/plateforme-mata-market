import { expect, test } from '@playwright/test';
import { loginAs, SEED_USERS } from '../helpers/auth';

/**
 * E2E full-stack (Lot 9) — parcours paiement client de bout en bout.
 *
 * Couvre la dette BACKLOG [lot-5→lot-9] « payments-checkout E2E » : on pilote
 * le vrai parcours dans un navigateur, contre la stack réelle (api Fastify +
 * Postgres seedé + Keycloak), avec le mock Bictorys local (port 4001) qui
 * rejoue le callback webhook signé HMAC puis redirige vers /payment/return.
 *
 *   Test 1 (client) : catalogue → panier → commande → « Payer maintenant »
 *     → checkout mock Bictorys → confirmation → /payment/return « Paiement réussi ».
 *   Test 2 (admin)  : /admin/payments filtre « Payé » → la commande apparaît PAYÉ.
 *
 * Deux tests SÉPARÉS (contextes navigateur distincts) volontairement : Keycloak
 * garde une session SSO par contexte ; rejouer /api/auth/login dans le même
 * contexte réutiliserait la session client au lieu de connecter l'admin.
 *
 * La jambe « reversement déclenché » n'est PAS couverte ici (nécessite une
 * commande `delivered` + bank_details producteur, absents après un checkout
 * frais) — dette tracée BACKLOG, déjà couverte par payouts-flow.integration.test.ts.
 *
 * Référence : ARCHITECTURE.md §10 + CLAUDE.md §G5/§G6.
 */

// Partagé entre les deux tests sérialisés (numéro CMD-YYYY-NNNN capturé au checkout).
let orderNumber = '';

test.describe
  .serial('Paiement client — checkout Bictorys (mock)', () => {
    test('client : commande → paiement → confirmation', async ({ page }) => {
      await loginAs(page, SEED_USERS.client);

      // Catalogue : la seule offre validée du seed est « Poulet entier ».
      await page.goto('/client/catalog');
      await expect(page.getByText('Poulet entier')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /Panier/ }).click();

      // Panier : zone + adresse, puis validation.
      await page.goto('/client/cart');
      await expect(page.getByText('Poulet entier')).toBeVisible();
      await page.locator('select').first().selectOption({ index: 1 });
      await page
        .getByPlaceholder('Adresse précise (rue, repère...)')
        .fill('Cité Keur Gorgui, villa 12');
      await Promise.all([
        page.waitForURL('**/client/orders/**', { timeout: 20_000 }),
        page.getByRole('button', { name: /Valider la commande/ }).click(),
      ]);

      // Capture le numéro de commande affiché (#CMD-YYYY-NNNN).
      const orderNumberEl = page.getByText(/CMD-\d{4}-\d+/).first();
      await expect(orderNumberEl).toBeVisible({ timeout: 15_000 });
      const rawNumber = (await orderNumberEl.textContent()) ?? '';
      const match = rawNumber.match(/CMD-\d{4}-\d+/);
      if (!match) {
        throw new Error(`Numéro de commande introuvable dans « ${rawNumber} »`);
      }
      orderNumber = match[0];

      // Lance le paiement → redirection vers le checkout mock Bictorys (port 4001).
      await Promise.all([
        page.waitForURL((url) => url.port === '4001', { timeout: 20_000 }),
        page.getByRole('button', { name: /Payer maintenant/ }).click(),
      ]);

      // Confirme le paiement sur le mock → callback webhook signé → 302 /payment/return.
      await Promise.all([
        page.waitForURL((url) => url.pathname.includes('/payment/return'), { timeout: 20_000 }),
        page.getByRole('button', { name: /Payer/ }).click(),
      ]);

      // La page poll /v1/payments/:id ; le webhook a déjà basculé le statut à paid.
      await expect(page.getByRole('heading', { name: 'Paiement réussi' })).toBeVisible({
        timeout: 15_000,
      });
    });

    test('admin : la commande payée apparaît dans /admin/payments', async ({ page }) => {
      expect(orderNumber, 'le test client doit avoir capturé un numéro de commande').not.toBe('');

      await loginAs(page, SEED_USERS.admin);
      await page.goto('/admin/payments');

      // Filtre « Payé » puis vérifie la ligne de notre commande + badge PAYÉ.
      await page.getByRole('button', { name: 'Payé' }).click();
      const row = page.getByRole('row', { name: new RegExp(orderNumber) });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row.getByText('PAYÉ')).toBeVisible();
    });
  });
