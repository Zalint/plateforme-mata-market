/**
 * Seed dev · 3 utilisateurs, 13 zones, 1 profil producteur complet
 * (Mor Diop) avec 2 sites et 3 offres couvrant les statuts UI.
 *
 * Usage : `pnpm --filter @mata/api db:seed`
 *
 * Les `keycloak_id` au format `dev:<role>:<slug>` sont des stubs : ils doivent
 * être remplacés par les vrais IDs Keycloak quand les comptes seront créés
 * dans le realm `mata` (cf. Lot 0 docs/DEPLOYMENT.md §4).
 *
 * Idempotent : utilise upsert sur clés naturelles (keycloakId, zone.slug,
 * producer.userId) et `deleteMany` + `createMany` pour les sites/offres de
 * Mor afin de pouvoir relancer sans accumuler de doublons.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  OfferStatus,
  OfferUnit,
  PrismaClient,
  ProducerStatus,
  ProducerType,
  ProductCategory,
  SiteType,
  UserRole,
} from '@prisma/client';

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

// ─────────────────────────────────────────────────────────────────
// Données

// Les `keycloakId` ci-dessous correspondent aux `id` UUID définis dans
// `infra/keycloak/realm-export.json`. Tant qu'on importe le realm tel quel,
// les UUIDs survivent aux wipes de la DB Keycloak (`docker compose down -v`).
//
// Identifiants de login (dev local, password commun `mata`) :
//   mor.diop           / mata  → role producer
//   aissatou.sow       / mata  → role admin
//   lacalebasse.client / mata  → role client_pro
const USERS = [
  {
    keycloakId: '6e426967-1bae-4280-8b7d-6597a020416c',
    email: null,
    phone: '+221771234567',
    displayName: 'Mor Diop',
    role: UserRole.producer,
  },
  {
    keycloakId: '20a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6',
    email: 'contact@lacalebasse.sn',
    phone: '+221338691234',
    displayName: 'Resto La Calebasse',
    role: UserRole.client_pro,
  },
  {
    keycloakId: '10a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6',
    email: 'aissatou.sow@mata.sn',
    phone: null,
    displayName: 'Aïssatou Sow',
    role: UserRole.admin,
  },
] as const;

const ZONES = [
  { slug: 'pout', name: 'Pout', region: 'Thiès' },
  { slug: 'thies-ville', name: 'Thiès ville', region: 'Thiès' },
  { slug: 'dahra', name: 'Dahra', region: 'Louga' },
  { slug: 'niayes', name: 'Niayes', region: 'Thiès' },
  { slug: 'mbour', name: 'Mbour', region: 'Thiès' },
  { slug: 'joal', name: 'Joal-Fadiouth', region: 'Thiès' },
  { slug: 'almadies', name: 'Almadies', region: 'Dakar' },
  { slug: 'mermoz', name: 'Mermoz', region: 'Dakar' },
  { slug: 'sicap-liberte', name: 'Sicap Liberté', region: 'Dakar' },
  { slug: 'yoff', name: 'Yoff', region: 'Dakar' },
  { slug: 'ouakam', name: 'Ouakam', region: 'Dakar' },
  { slug: 'pikine', name: 'Pikine', region: 'Dakar' },
  { slug: 'corniche', name: 'Corniche', region: 'Dakar' },
] as const;

// ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Users
  //
  // Stratégie d'upsert : on cherche d'abord par clé naturelle (phone ou email).
  // Si l'utilisateur existe déjà (cas d'un compte provisionné via login Keycloak
  // réel qui a remplacé le `dev:*` stub par un vrai UUID), on PRÉSERVE son
  // keycloak_id existant et on met juste à jour les champs métier. Sinon on
  // crée avec le keycloak_id stub `dev:*` du seed.
  //
  // Cette logique évite de casser un login Keycloak établi tout en gardant
  // le seed idempotent et utile pour les comptes qui n'ont pas encore loggué.
  const userIdByKeycloakStub = new Map<string, string>();
  for (const user of USERS) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(user.phone ? [{ phone: user.phone }] : []),
          ...(user.email ? [{ email: user.email }] : []),
        ],
      },
    });

    const saved = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { displayName: user.displayName, role: user.role },
        })
      : await prisma.user.create({ data: user });

    userIdByKeycloakStub.set(user.keycloakId, saved.id);
    const kcShort =
      saved.keycloakId.length > 30 ? `${saved.keycloakId.slice(0, 27)}...` : saved.keycloakId;
    log(`user      ${saved.role.padEnd(15)} ${saved.displayName.padEnd(20)} kc=${kcShort}`);
  }

  // 2. Zones
  const zoneIdBySlug = new Map<string, string>();
  for (const zone of ZONES) {
    const created = await prisma.zone.upsert({
      where: { slug: zone.slug },
      update: { name: zone.name, region: zone.region },
      create: zone,
    });
    zoneIdBySlug.set(zone.slug, created.id);
  }
  log(`zones     ${ZONES.length} zones seedées (${ZONES.map((z) => z.slug).join(', ')})`);

  // 3. Profil producteur Mor Diop (idempotent)
  const morUserId = userIdByKeycloakStub.get('dev:producer:mor-diop');
  const adminUserId = userIdByKeycloakStub.get('dev:admin:aissatou-sow');
  const poutZoneId = zoneIdBySlug.get('pout');
  const dahraZoneId = zoneIdBySlug.get('dahra');
  if (!morUserId || !adminUserId || !poutZoneId || !dahraZoneId) {
    throw new Error('Seed invariant: missing user or zone ID after upsert');
  }

  await prisma.producerProfile.upsert({
    where: { userId: morUserId },
    update: {
      type: ProducerType.poultry,
      status: ProducerStatus.validated,
      zoneId: poutZoneId,
      whatsappPhone: '+221771234567',
      bio: 'Aviculteur à Pout depuis 2020. Production de poulets fermiers et œufs.',
      validatedAt: new Date('2026-02-15T10:00:00Z'),
      validatedBy: adminUserId,
    },
    create: {
      userId: morUserId,
      type: ProducerType.poultry,
      status: ProducerStatus.validated,
      zoneId: poutZoneId,
      whatsappPhone: '+221771234567',
      bio: 'Aviculteur à Pout depuis 2020. Production de poulets fermiers et œufs.',
      validatedAt: new Date('2026-02-15T10:00:00Z'),
      validatedBy: adminUserId,
    },
  });
  log(`producer  Mor Diop · poultry · validated (zone Pout)`);

  // 4. Sites de Mor (reset complet pour idempotence).
  //
  // Ordre de suppression : d'abord les offers (FK `site_id` onDelete=Restrict),
  // puis les sites. La création se fait inversée (sites d'abord).
  await prisma.offer.deleteMany({ where: { producerUserId: morUserId } });
  await prisma.productionSite.deleteMany({ where: { producerUserId: morUserId } });
  await prisma.productionSite.createMany({
    data: [
      {
        producerUserId: morUserId,
        name: 'Poulailler Pout 1',
        type: SiteType.poulailler,
        zoneId: poutZoneId,
        addressLine: 'Route nationale 2, sortie Pout',
        geoLat: 14.7644,
        geoLng: -17.0535,
        vehicleAccess: 'utilitaire',
        contactName: 'Birame',
        contactPhone: '+221772345678',
        pickupHours: 'Matin · 6h-10h',
      },
      {
        producerUserId: morUserId,
        name: 'Ferme Dahra',
        type: SiteType.ferme,
        zoneId: dahraZoneId,
        addressLine: 'Route de Linguère',
        geoLat: 15.3478,
        geoLng: -15.4798,
        vehicleAccess: 'camion',
        contactName: 'Modou',
        contactPhone: '+221773456789',
        pickupHours: 'Aube · 5h-8h',
      },
    ],
  });

  const sites = await prisma.productionSite.findMany({
    where: { producerUserId: morUserId },
    orderBy: { createdAt: 'asc' },
  });
  const [poutSite, dahraSite] = sites;
  if (!poutSite || !dahraSite) {
    throw new Error('Seed invariant: production sites not created');
  }
  log(`sites     2 sites créés (Poulailler Pout 1, Ferme Dahra)`);

  // 5. Offres de Mor (delete fait plus haut, à l'étape 4, pour respecter
  // l'ordre des FK).
  await prisma.offer.createMany({
    data: [
      {
        producerUserId: morUserId,
        siteId: poutSite.id,
        category: ProductCategory.poultry,
        status: OfferStatus.validated,
        title: 'Poulet entier',
        unit: OfferUnit.unit,
        quantity: 500,
        priceFcfa: 3000,
        availableFrom: new Date('2026-05-25'),
        qualityNote: 'Poids moyen 1,5 kg · Élevé en plein air',
        submittedAt: new Date('2026-05-24T08:00:00Z'),
        validatedAt: new Date('2026-05-24T11:30:00Z'),
        validatedBy: adminUserId,
      },
      {
        producerUserId: morUserId,
        siteId: poutSite.id,
        category: ProductCategory.eggs,
        status: OfferStatus.pending,
        title: 'Œufs frais',
        unit: OfferUnit.tray,
        quantity: 40,
        priceFcfa: 2500,
        availableFrom: new Date('2026-05-29'),
        qualityNote: 'Plateaux de 30 œufs',
        submittedAt: new Date('2026-05-29T14:00:00Z'),
      },
      {
        producerUserId: morUserId,
        siteId: dahraSite.id,
        category: ProductCategory.sheep,
        status: OfferStatus.draft,
        title: 'Mouton sur pied',
        unit: OfferUnit.head,
        quantity: 5,
        priceFcfa: 95000,
        availableFrom: new Date('2026-06-15'),
        qualityNote: 'Race Ladoum, prêts pour la Tabaski',
      },
    ],
  });
  log(`offers    3 offres créées (validated × 1, pending × 1, draft × 1)`);
}

function log(line: string): void {
  // biome-ignore lint/suspicious/noConsole: seed script, output attendu
  console.log(`✓ ${line}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
