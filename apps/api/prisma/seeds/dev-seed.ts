/**
 * Seed dev · 3 utilisateurs pour démarrer rapidement le développement.
 *
 * Usage : `pnpm --filter @mata/api db:seed`
 *
 * Les `keycloak_id` au format `dev:<role>:<slug>` sont des stubs : ils doivent
 * être remplacés par les vrais IDs Keycloak quand les comptes seront créés
 * dans le realm `mata` (cf. Lot 0 docs/DEPLOYMENT.md §4).
 *
 * Idempotent : utilise upsert sur `keycloak_id` pour pouvoir relancer sans
 * créer de doublons.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Charge le .env local pour récupérer DATABASE_URL (cf. src/env.ts).
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const USERS = [
  {
    keycloakId: 'dev:producer:mor-diop',
    email: null,
    phone: '+221771234567',
    displayName: 'Mor Diop',
    role: 'producer' as const,
  },
  {
    keycloakId: 'dev:client_pro:la-calebasse',
    email: 'contact@lacalebasse.sn',
    phone: '+221338691234',
    displayName: 'Resto La Calebasse',
    role: 'client_pro' as const,
  },
  {
    keycloakId: 'dev:admin:aissatou-sow',
    email: 'aissatou.sow@mata.sn',
    phone: null,
    displayName: 'Aïssatou Sow',
    role: 'admin' as const,
  },
];

async function main(): Promise<void> {
  for (const user of USERS) {
    const created = await prisma.user.upsert({
      where: { keycloakId: user.keycloakId },
      update: {},
      create: user,
    });
    // biome-ignore lint/suspicious/noConsole: seed script, output attendu
    console.log(`✓ ${created.role.padEnd(20)} ${created.displayName}  (${created.id})`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
