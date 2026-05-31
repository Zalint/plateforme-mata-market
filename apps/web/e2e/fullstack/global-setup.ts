import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Global setup E2E full-stack (Lot 9).
 *
 * Amène la stack de dépendances AVANT que Playwright ne démarre les serveurs
 * (api / web / mock Bictorys, cf. `webServer` de playwright.fullstack.config.ts) :
 *   1. `docker compose up -d --wait postgres keycloak-db` (attend les healthchecks)
 *   2. `docker compose up -d keycloak` puis poll de l'endpoint realm `mata`
 *      (Keycloak 26 expose /health sur le port 9000 non mappé → on sonde plutôt
 *      le realm public, signal de readiness fiable et déjà mappé sur 8081)
 *   3. `prisma migrate deploy` (schéma à jour, idempotent)
 *   4. `db:seed` (4 users alignés Keycloak, zones, offre « Poulet entier », rules)
 *
 * Local-only : ce setup n'est PAS branché en CI (le job e2e GitHub Actions garde
 * le smoke léger). Dette tracée dans docs/BACKLOG.md.
 *
 * Idempotent : `docker compose up` réutilise les conteneurs existants, le seed
 * est idempotent (upsert), `migrate deploy` ne rejoue pas les migrations déjà
 * appliquées. Lancer les tests deux fois de suite ne casse rien.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');
const KEYCLOAK_REALM_URL =
  process.env.E2E_KEYCLOAK_REALM_URL ?? 'http://localhost:8081/realms/mata';
const KEYCLOAK_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

function run(command: string): void {
  execSync(command, { cwd: REPO_ROOT, stdio: 'inherit' });
}

async function waitForKeycloakRealm(): Promise<void> {
  const deadline = Date.now() + KEYCLOAK_TIMEOUT_MS;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(KEYCLOAK_REALM_URL);
      if (res.ok) {
        process.stdout.write(`[e2e] Keycloak realm prêt (${KEYCLOAK_REALM_URL})\n`);
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Keycloak realm injoignable après ${KEYCLOAK_TIMEOUT_MS / 1000}s (${KEYCLOAK_REALM_URL}) : ${lastError}`,
  );
}

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_SKIP_INFRA === '1') {
    process.stdout.write('[e2e] E2E_SKIP_INFRA=1 → infra docker/seed supposée déjà prête\n');
    return;
  }

  process.stdout.write('[e2e] docker compose up postgres + keycloak…\n');
  run('docker compose up -d --wait postgres keycloak-db');
  run('docker compose up -d keycloak');
  await waitForKeycloakRealm();

  process.stdout.write('[e2e] prisma migrate deploy…\n');
  run('pnpm --filter @mata/api prisma:migrate:deploy');

  process.stdout.write('[e2e] db:seed…\n');
  run('pnpm --filter @mata/api db:seed');

  process.stdout.write('[e2e] infra prête.\n');
}
