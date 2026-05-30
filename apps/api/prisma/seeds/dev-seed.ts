/**
 * Seed dev · 3 utilisateurs alignés Keycloak (Mor Diop / Aïssatou Sow /
 * Resto La Calebasse), 13 zones, profil producteur complet pour Mor avec
 * 2 sites + 3 offres + 6 rules pricing par défaut (1 par catégorie).
 *
 * Usage : `pnpm --filter @mata/api db:seed`
 *
 * Les `keycloakId` sont les UUIDs réels du realm-export (cf. `infra/keycloak/
 * realm-export.json`). Un wipe complet (`docker compose down -v` + import
 * realm + seed) restore un état fonctionnel sans manipulation SQL manuelle.
 *
 * Idempotent (vérifié par re-run successifs) :
 *  - users  : upsert par phone/email, ré-aligne keycloakId au passage
 *  - zones  : upsert par slug
 *  - profil : upsert par userId
 *  - sites + offres : delete-create (Mor uniquement) en wipant aussi en
 *    cascade les order_items + orders + pricing_snapshots qui les
 *    référencent (FK onDelete=Restrict)
 *  - rules pricing : delete + createMany sur les 6 catégories
 *
 * PROD : ce code n'est JAMAIS exécuté. Le seed prod est `prod-bootstrap.ts`,
 * il refuse de tourner si la DB n'est pas vide.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  OfferStatus,
  OfferUnit,
  PricingBase,
  PricingModel,
  PricingScope,
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
// Le `slug` est un alias local STABLE indépendant du keycloakId, utilisé
// pour les lookups internes du seed (cf. Map `userIdBySlug`). Changer le
// keycloakId d'un user (ex: migration UUID) ne casse pas le seed.
//
// Identifiants de login (dev local, password commun `mata`) :
//   mor.diop           / mata  → role producer
//   aissatou.sow       / mata  → role admin
//   lacalebasse.client / mata  → role client_pro
const USERS = [
  {
    slug: 'mor-diop',
    keycloakId: '6e426967-1bae-4280-8b7d-6597a020416c',
    email: null,
    phone: '+221771234567',
    displayName: 'Mor Diop',
    role: UserRole.producer,
  },
  {
    slug: 'la-calebasse',
    keycloakId: '20a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6',
    email: 'contact@lacalebasse.sn',
    phone: '+221338691234',
    displayName: 'Resto La Calebasse',
    role: UserRole.client_pro,
  },
  {
    slug: 'aissatou-sow',
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
  // Si l'utilisateur existe déjà, on ré-aligne son `keycloakId` sur celui du
  // seed (UUID Keycloak réel) et on met à jour displayName/role. Sinon on
  // crée avec les valeurs du seed.
  //
  // Le ré-alignement est nécessaire pour gérer le cas où un user a été créé
  // avec un stub historique (`dev:*`) avant qu'on aligne sur les UUIDs réels
  // du realm-export (cf. Lots 3-4). Au prochain run, il sera réconcilié.
  const userIdBySlug = new Map<string, string>();
  for (const user of USERS) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(user.phone ? [{ phone: user.phone }] : []),
          ...(user.email ? [{ email: user.email }] : []),
        ],
      },
    });

    // À la première exécution, on crée avec le keycloakId du seed (UUID
    // Keycloak réel). Lors des re-runs, on RÉ-ALIGNE le keycloakId du user
    // existant sur celui du seed, pour gérer le cas où il avait été créé
    // avec un stub (`dev:*`) historique avant qu'on aligne sur les UUIDs.
    const { slug: _slug, ...userDataForCreate } = user;
    const saved = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            displayName: user.displayName,
            role: user.role,
            keycloakId: user.keycloakId,
          },
        })
      : await prisma.user.create({ data: userDataForCreate });

    userIdBySlug.set(user.slug, saved.id);
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
  const morUserId = userIdBySlug.get('mor-diop');
  const adminUserId = userIdBySlug.get('aissatou-sow');
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
  // Ordre de suppression (FK onDelete=Restrict côté offers/order_items) :
  //   order_items  → orders  → pricing_snapshots → offer_photos → offers → sites
  // En dev, on accepte de wiper toutes les commandes touchant les offres de Mor
  // pour que le seed reste idempotent. PROD : ce code n'est jamais exécuté
  // (seed prod = prod-bootstrap.ts séparé, refuse de tourner si DB non vide).
  const morOfferIds = (
    await prisma.offer.findMany({
      where: { producerUserId: morUserId },
      select: { id: true },
    })
  ).map((o) => o.id);
  if (morOfferIds.length > 0) {
    const orderItemsToDelete = await prisma.orderItem.findMany({
      where: { offerId: { in: morOfferIds } },
      select: { orderId: true, pricingSnapshotId: true },
    });
    const orderIds = [...new Set(orderItemsToDelete.map((i) => i.orderId))];
    const snapshotIds = orderItemsToDelete.map((i) => i.pricingSnapshotId);
    await prisma.orderItem.deleteMany({ where: { offerId: { in: morOfferIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.pricingSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
    // audit_log : on garde les entrées historiques (pas de FK, pas de cascade
    // requise). Si tu veux un wipe complet pour debug, ajoute :
    //   await prisma.auditLog.deleteMany({ where: { targetId: { in: orderIds } } });
  }
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

  // ─────────────────────────────────────────────────────────────────
  // Pricing rules par défaut · une rule `category` active par catégorie
  // produit, créée par Aïssatou (admin). Permet à `POST /v1/orders` de
  // toujours trouver une rule active sans avoir à passer par /admin/pricing
  // pour bootstrap.
  //
  // Valeurs alignées avec le mockup §2584-2771 (Commission 10% sur prix
  // producteur, marge sécurité 3%, collecte 120 F, livraison 200 F, stockage
  // 50 F, pas de remise). L'admin reste libre de surcharger via UI.
  //
  // Idempotent : delete + create par catégorie. Les rules existantes (créées
  // via UI admin) seront écrasées si tu re-runs le seed — c'est voulu pour
  // garantir un état dev cohérent.
  // ─────────────────────────────────────────────────────────────────

  const admin = await prisma.user.findFirstOrThrow({ where: { role: UserRole.admin } });
  const allCategories: ProductCategory[] = [
    ProductCategory.poultry,
    ProductCategory.eggs,
    ProductCategory.cattle,
    ProductCategory.sheep,
    ProductCategory.vegetables,
    ProductCategory.fish,
  ];

  // Supprime les rules existantes ciblant ces catégories pour rester idempotent.
  await prisma.pricingRule.deleteMany({
    where: { scope: PricingScope.category, category: { in: allCategories } },
  });

  await prisma.pricingRule.createMany({
    data: allCategories.map((category) => ({
      scope: PricingScope.category,
      category,
      model: PricingModel.commission_pct,
      commissionPct: 10,
      commissionBase: PricingBase.producer_price,
      commissionFlatFcfa: 0,
      safetyMarginPct: 3,
      safetyMarginBase: PricingBase.producer_price,
      collectionFcfa: 120,
      deliveryFcfa: 200,
      storageFcfa: 50,
      discountFcfa: 0,
      createdBy: admin.id,
    })),
  });

  log(
    `pricing   ${allCategories.length} rules par défaut (1 par catégorie, model=commission_pct 10%)`,
  );
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
