/**
 * Seed dev · 9 utilisateurs alignés Keycloak (Mor Diop, Aïssatou Sow admin,
 * Resto La Calebasse client, Ibrahima Ndiaye téléconseiller + 5 producteurs
 * Lot 9 : Fatou/Ousmane pending, Awa validée, Cheikh suspendu, Khady
 * blacklisté). 13 zones. Profils producteurs (1 par statut → file de
 * validation admin non vide). Mor : 2 sites + 3 offres ; Awa : 1 site + 1
 * offre validée. 6 rules pricing par défaut. 3 commandes livrées + 3 avis
 * (La Calebasse note Mor 5★+4★ → 4.5 et Awa 5★) pour démontrer la note moyenne.
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
 *  - profils : upsert par userId (Mor + 5 producteurs Lot 9)
 *  - sites + offres : delete-create (Mor + Awa) en wipant aussi en cascade les
 *    order_items + orders + pricing_snapshots + producer_ratings qui les
 *    référencent (FK onDelete=Restrict/Cascade)
 *  - rules pricing : delete + createMany sur les 6 catégories
 *  - commandes + avis : recréés à chaque run (supprimés par le wipe ci-dessus)
 *
 * PROD : ce code n'est JAMAIS exécuté. Le seed prod est `prod-bootstrap.ts`,
 * il refuse de tourner si la DB n'est pas vide.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DeliveryPeriod,
  OfferStatus,
  OfferUnit,
  OrderStatus,
  PaymentStatus,
  PricingBase,
  PricingModel,
  PricingScope,
  PrismaClient,
  ProducerStatus,
  ProducerType,
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
//   mor.diop           / mata  → role producer (validé)
//   aissatou.sow       / mata  → role admin
//   lacalebasse.client / mata  → role client_pro
//   ibrahima.ndiaye    / mata  → role teleconsultant (Lot 6)
//   fatou.ndiaye       / mata  → role producer (pending — Lot 9)
//   ousmane.ba         / mata  → role producer (pending — Lot 9)
//   awa.sarr           / mata  → role producer (validé — Lot 9)
//   cheikh.fall        / mata  → role producer (suspendu — Lot 9)
//   khady.diallo       / mata  → role producer (blacklisté — Lot 9)
//
// Le champ `username` (Lot 6) est utilisé par le lookup producteur lors du
// démarrage d'une session téléconseil (cf. mockup §2888 — l'admin saisit
// "mor.diop"). Doit matcher le `username` du realm-export.
const USERS = [
  {
    slug: 'mor-diop',
    keycloakId: '6e426967-1bae-4280-8b7d-6597a020416c',
    username: 'mor.diop',
    email: null,
    phone: '+221771234567',
    displayName: 'Mor Diop',
    role: UserRole.producer,
  },
  {
    slug: 'la-calebasse',
    keycloakId: '20a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6',
    username: 'lacalebasse.client',
    email: 'contact@lacalebasse.sn',
    phone: '+221338691234',
    displayName: 'Resto La Calebasse',
    role: UserRole.client_pro,
  },
  {
    slug: 'aissatou-sow',
    keycloakId: '10a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6',
    username: 'aissatou.sow',
    email: 'aissatou.sow@mata.sn',
    phone: null,
    displayName: 'Aïssatou Sow',
    role: UserRole.admin,
  },
  {
    slug: 'ibrahima-ndiaye',
    keycloakId: '30b6c2d3-4e5f-4067-9101-b2c3d4e5f607',
    username: 'ibrahima.ndiaye',
    email: 'ibrahima.ndiaye@mata.sn',
    phone: null,
    displayName: 'Ibrahima Ndiaye',
    role: UserRole.teleconsultant,
  },
  // Lot 9 — producteurs supplémentaires pour alimenter la file de validation
  // admin (un producteur par statut) + démontrer la note moyenne. UUIDs alignés
  // sur le realm-export (cf. infra/keycloak/realm-export.json § users), password
  // commun `mata`. Leurs profils (statut/type/zone) sont définis dans PRODUCERS.
  {
    slug: 'fatou-ndiaye',
    keycloakId: 'a1000001-0000-4000-8000-000000000001',
    username: 'fatou.ndiaye',
    email: null,
    phone: '+221770000001',
    displayName: 'Fatou Ndiaye',
    role: UserRole.producer,
  },
  {
    slug: 'ousmane-ba',
    keycloakId: 'a1000002-0000-4000-8000-000000000002',
    username: 'ousmane.ba',
    email: null,
    phone: '+221770000002',
    displayName: 'Ousmane Ba',
    role: UserRole.producer,
  },
  {
    slug: 'awa-sarr',
    keycloakId: 'a1000003-0000-4000-8000-000000000003',
    username: 'awa.sarr',
    email: null,
    phone: '+221770000003',
    displayName: 'Awa Sarr',
    role: UserRole.producer,
  },
  {
    slug: 'cheikh-fall',
    keycloakId: 'a1000004-0000-4000-8000-000000000004',
    username: 'cheikh.fall',
    email: null,
    phone: '+221770000004',
    displayName: 'Cheikh Fall',
    role: UserRole.producer,
  },
  {
    slug: 'khady-diallo',
    keycloakId: 'a1000005-0000-4000-8000-000000000005',
    username: 'khady.diallo',
    email: null,
    phone: '+221770000005',
    displayName: 'Khady Diallo',
    role: UserRole.producer,
  },
] as const;

// ─────────────────────────────────────────────────────────────────
// Profils des producteurs additionnels (Lot 9). Un par statut pour que chaque
// onglet de la vue admin Producteurs soit non vide (À valider ×2, Validé,
// Suspendu, Blacklisté ; Mor Diop fournit le 2e Validé). Awa Sarr (validée)
// reçoit un site + une offre validée pour être commandable → support des avis.
const PRODUCERS = [
  {
    slug: 'fatou-ndiaye',
    type: ProducerType.vegetables,
    zoneSlug: 'niayes',
    status: ProducerStatus.pending,
    whatsappPhone: '+221770000001',
    bio: 'Maraîchère dans les Niayes. Légumes de saison cultivés sans pesticides.',
  },
  {
    slug: 'ousmane-ba',
    type: ProducerType.cattle,
    zoneSlug: 'dahra',
    status: ProducerStatus.pending,
    whatsappPhone: '+221770000002',
    bio: 'Éleveur bovin à Dahra. Zébus Gobra et viande de bœuf.',
  },
  {
    slug: 'awa-sarr',
    type: ProducerType.fish,
    zoneSlug: 'joal',
    status: ProducerStatus.validated,
    whatsappPhone: '+221770000003',
    bio: 'Mareyeuse à Joal-Fadiouth. Poisson frais débarqué du jour.',
  },
  {
    slug: 'cheikh-fall',
    type: ProducerType.sheep,
    zoneSlug: 'mbour',
    status: ProducerStatus.suspended,
    whatsappPhone: '+221770000004',
    bio: 'Éleveur ovin à Mbour. Moutons Ladoum et Touabire.',
  },
  {
    slug: 'khady-diallo',
    type: ProducerType.poultry,
    zoneSlug: 'thies-ville',
    status: ProducerStatus.blacklisted,
    whatsappPhone: '+221770000005',
    bio: 'Aviculteur à Thiès. Poulets de chair.',
  },
] as const;

// Centroïdes approximatifs (lat/lng WGS84) renseignés au Lot 7 (tournées) —
// résout la dette BACKLOG [lot-2→lot-7]. Coordonnées indicatives des
// localités sénégalaises, suffisantes pour grouper/ordonner les collectes.
const ZONES = [
  { slug: 'pout', name: 'Pout', region: 'Thiès', centroidLat: 14.7717, centroidLng: -17.0608 },
  {
    slug: 'thies-ville',
    name: 'Thiès ville',
    region: 'Thiès',
    centroidLat: 14.7886,
    centroidLng: -16.9246,
  },
  { slug: 'dahra', name: 'Dahra', region: 'Louga', centroidLat: 15.3478, centroidLng: -15.4775 },
  { slug: 'niayes', name: 'Niayes', region: 'Thiès', centroidLat: 14.9667, centroidLng: -17.0833 },
  { slug: 'mbour', name: 'Mbour', region: 'Thiès', centroidLat: 14.4198, centroidLng: -16.9636 },
  {
    slug: 'joal',
    name: 'Joal-Fadiouth',
    region: 'Thiès',
    centroidLat: 14.1667,
    centroidLng: -16.8333,
  },
  {
    slug: 'almadies',
    name: 'Almadies',
    region: 'Dakar',
    centroidLat: 14.7456,
    centroidLng: -17.5147,
  },
  { slug: 'mermoz', name: 'Mermoz', region: 'Dakar', centroidLat: 14.7008, centroidLng: -17.4781 },
  {
    slug: 'sicap-liberte',
    name: 'Sicap Liberté',
    region: 'Dakar',
    centroidLat: 14.7053,
    centroidLng: -17.4575,
  },
  { slug: 'yoff', name: 'Yoff', region: 'Dakar', centroidLat: 14.7547, centroidLng: -17.4894 },
  { slug: 'ouakam', name: 'Ouakam', region: 'Dakar', centroidLat: 14.7211, centroidLng: -17.4944 },
  { slug: 'pikine', name: 'Pikine', region: 'Dakar', centroidLat: 14.7553, centroidLng: -17.3906 },
  {
    slug: 'corniche',
    name: 'Corniche',
    region: 'Dakar',
    centroidLat: 14.6822,
    centroidLng: -17.4678,
  },
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
            username: user.username, // Lot 6 — backfill pour lookup téléconseil
          },
        })
      : await prisma.user.create({ data: userDataForCreate });

    userIdBySlug.set(user.slug, saved.id);
    const kcShort =
      saved.keycloakId.length > 30 ? `${saved.keycloakId.slice(0, 27)}...` : saved.keycloakId;
    log(`user      ${saved.role.padEnd(15)} ${saved.displayName.padEnd(20)} kc=${kcShort}`);
  }

  // 1b. Portée de modération du téléconseiller seedé : `allProducers = true`
  // (préserve le comportement dev « voit toutes les offres »). Sans cette ligne,
  // le nouveau défaut (aucune affectation = aucune offre) viderait sa file de
  // validation tant que l'admin ne l'a pas configuré via l'écran « Affectations ».
  const ibrahimaUserId = userIdBySlug.get('ibrahima-ndiaye');
  if (ibrahimaUserId) {
    await prisma.teleconsultantScope.upsert({
      where: { teleconsultantUserId: ibrahimaUserId },
      update: { allProducers: true },
      create: { teleconsultantUserId: ibrahimaUserId, allProducers: true },
    });
    log('scope     teleconsultant  Ibrahima Ndiaye      allProducers=true');
  }

  // 2. Zones
  const zoneIdBySlug = new Map<string, string>();
  for (const zone of ZONES) {
    const created = await prisma.zone.upsert({
      where: { slug: zone.slug },
      update: {
        name: zone.name,
        region: zone.region,
        centroidLat: zone.centroidLat,
        centroidLng: zone.centroidLng,
      },
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

  // 3b. Producteurs additionnels (Lot 9) — un par statut pour alimenter la
  // file de validation admin + démontrer la note moyenne. Upsert par userId
  // (idempotent). validatedAt/validatedBy posés pour validated/suspended
  // (états atteints après une validation admin) ; pending/blacklisted restent
  // sans validation.
  for (const p of PRODUCERS) {
    const userId = userIdBySlug.get(p.slug);
    const zoneId = zoneIdBySlug.get(p.zoneSlug);
    if (!userId || !zoneId) {
      throw new Error(`Seed invariant: missing user or zone for producer ${p.slug}`);
    }
    const wasValidated =
      p.status === ProducerStatus.validated || p.status === ProducerStatus.suspended;
    const profileData = {
      type: p.type,
      status: p.status,
      zoneId,
      whatsappPhone: p.whatsappPhone,
      bio: p.bio,
      validatedAt: wasValidated ? new Date('2026-03-01T10:00:00Z') : null,
      validatedBy: wasValidated ? adminUserId : null,
    };
    await prisma.producerProfile.upsert({
      where: { userId },
      update: profileData,
      create: { userId, ...profileData },
    });
  }
  const awaUserId = userIdBySlug.get('awa-sarr');
  const joalZoneId = zoneIdBySlug.get('joal');
  if (!awaUserId || !joalZoneId) {
    throw new Error('Seed invariant: missing Awa Sarr user or Joal zone');
  }
  log(`producer  +5 producteurs (pending×2, validated, suspended, blacklisted)`);

  // 4. Sites + commerce des producteurs commandables (reset complet pour
  // idempotence). « Commandables » = ceux qui portent des offres et donc des
  // commandes : Mor Diop + Awa Sarr (Lot 9). Les autres producteurs n'ont ni
  // site ni offre, leur profil seul suffit.
  //
  // Ordre de suppression (FK onDelete=Restrict côté offers/order_items) :
  //   order_items  → orders  → pricing_snapshots → offer_photos → offers → sites
  // Les producer_ratings partent en cascade avec les orders (FK onDelete=Cascade).
  // En dev, on accepte de wiper toutes les commandes touchant ces offres pour
  // que le seed reste idempotent. PROD : ce code n'est jamais exécuté (seed prod
  // = prod-bootstrap.ts séparé, refuse de tourner si DB non vide).
  const commerceProducerIds = [morUserId, awaUserId];
  const seededOfferIds = (
    await prisma.offer.findMany({
      where: { producerUserId: { in: commerceProducerIds } },
      select: { id: true },
    })
  ).map((o) => o.id);
  if (seededOfferIds.length > 0) {
    const orderItemsToDelete = await prisma.orderItem.findMany({
      where: { offerId: { in: seededOfferIds } },
      select: { id: true, orderId: true, pricingSnapshotId: true },
    });
    const orderItemIds = orderItemsToDelete.map((i) => i.id);
    const orderIds = [...new Set(orderItemsToDelete.map((i) => i.orderId))];
    const snapshotIds = orderItemsToDelete.map((i) => i.pricingSnapshotId);
    // Lot 5 — wipe en cascade des payout_items qui référencent ces order_items
    // (FK RESTRICT). Sans ça, le DELETE order_items échoue avec violation FK.
    const payoutIdsToDelete = (
      await prisma.payoutItem.findMany({
        where: { orderItemId: { in: orderItemIds } },
        select: { payoutId: true },
      })
    ).map((pi) => pi.payoutId);
    await prisma.payoutItem.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
    // On supprime aussi les payouts orphelins (plus aucun item couvert).
    if (payoutIdsToDelete.length > 0) {
      await prisma.payout.deleteMany({
        where: { id: { in: [...new Set(payoutIdsToDelete)] } },
      });
    }
    // Lot 7 — wipe des pickup_items qui référencent ces order_items (FK
    // RESTRICT, ajoutée au couplage commande↔tournée). Sans ça, le DELETE
    // order_items échoue. On supprime ensuite les tournées devenues vides.
    const pickupIdsToCheck = (
      await prisma.pickupItem.findMany({
        where: { orderItemId: { in: orderItemIds } },
        select: { pickupId: true },
      })
    ).map((pi) => pi.pickupId);
    await prisma.pickupItem.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
    if (pickupIdsToCheck.length > 0) {
      await prisma.pickup.deleteMany({
        where: { id: { in: [...new Set(pickupIdsToCheck)] }, items: { none: {} } },
      });
    }
    // Lot 5 — wipe payments des orders qu'on supprime (FK CASCADE depuis order).
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { offerId: { in: seededOfferIds } } });
    // Les producer_ratings (Lot 9) liés à ces orders partent en cascade.
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.pricingSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
    // audit_log : on garde les entrées historiques (pas de FK, pas de cascade
    // requise). Si tu veux un wipe complet pour debug, ajoute :
    //   await prisma.auditLog.deleteMany({ where: { targetId: { in: orderIds } } });
  }
  await prisma.offer.deleteMany({ where: { producerUserId: { in: commerceProducerIds } } });
  await prisma.productionSite.deleteMany({
    where: { producerUserId: { in: commerceProducerIds } },
  });
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

  // 4b. Catégories produit (taxonomie data-driven). Upsert idempotent : la
  // migration les seede déjà, on garantit ici leur présence pour un `db:seed`
  // autonome (et on les réactive si désactivées).
  const CATEGORIES = [
    { slug: 'poultry', labelFr: 'Volaille', emoji: '🐓', sortOrder: 1 },
    { slug: 'eggs', labelFr: 'Œufs', emoji: '🥚', sortOrder: 2 },
    { slug: 'cattle', labelFr: 'Bovin', emoji: '🐄', sortOrder: 3 },
    { slug: 'sheep', labelFr: 'Ovin', emoji: '🐑', sortOrder: 4 },
    { slug: 'vegetables', labelFr: 'Maraîcher', emoji: '🥬', sortOrder: 5 },
    { slug: 'fish', labelFr: 'Poisson', emoji: '🐟', sortOrder: 6 },
  ];
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { labelFr: c.labelFr, emoji: c.emoji, sortOrder: c.sortOrder, isActive: true },
      create: c,
    });
  }
  log(`categories ${CATEGORIES.length} catégories upsertées`);

  // 5. Offres de Mor (delete fait plus haut, à l'étape 4, pour respecter
  // l'ordre des FK).
  await prisma.offer.createMany({
    data: [
      {
        producerUserId: morUserId,
        siteId: poutSite.id,
        categorySlug: 'poultry',
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
        categorySlug: 'eggs',
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
        categorySlug: 'sheep',
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

  // 5b. Site + offre validée d'Awa Sarr (mareyeuse) — la rend commandable pour
  // que La Calebasse puisse passer une commande livrée et la noter (Lot 9).
  await prisma.productionSite.create({
    data: {
      producerUserId: awaUserId,
      name: 'Débarcadère Joal',
      type: SiteType.mareyage,
      zoneId: joalZoneId,
      addressLine: 'Quai de pêche, Joal-Fadiouth',
      geoLat: 14.1667,
      geoLng: -16.8333,
      vehicleAccess: 'utilitaire',
      contactName: 'Awa',
      contactPhone: '+221770000003',
      pickupHours: 'Matin · 7h-11h',
    },
  });
  const awaSite = await prisma.productionSite.findFirstOrThrow({
    where: { producerUserId: awaUserId },
  });
  await prisma.offer.create({
    data: {
      producerUserId: awaUserId,
      siteId: awaSite.id,
      categorySlug: 'fish',
      status: OfferStatus.validated,
      title: 'Thiof frais',
      unit: OfferUnit.kg,
      quantity: 100,
      priceFcfa: 2500,
      availableFrom: new Date('2026-05-26'),
      qualityNote: 'Pêche du jour · vidé sur demande',
      submittedAt: new Date('2026-05-25T09:00:00Z'),
      validatedAt: new Date('2026-05-25T15:00:00Z'),
      validatedBy: adminUserId,
    },
  });
  log(`offers    +1 offre validée Awa Sarr (Thiof frais)`);

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
  const allCategories: string[] = CATEGORIES.map((c) => c.slug);

  // Supprime les rules existantes ciblant ces catégories pour rester idempotent.
  await prisma.pricingRule.deleteMany({
    where: { scope: PricingScope.category, categorySlug: { in: allCategories } },
  });

  await prisma.pricingRule.createMany({
    data: allCategories.map((categorySlug) => ({
      scope: PricingScope.category,
      categorySlug,
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

  // ─────────────────────────────────────────────────────────────────
  // 6. Commandes livrées + avis (Lot 9) · La Calebasse note Mor & Awa.
  //
  // Une note (`producer_ratings`) exige une commande LIVRÉE dont le client est
  // propriétaire (cf. producerService.createRating, CLAUDE.md §G). On fabrique
  // donc 3 commandes `delivered`/`paid` pour La Calebasse, chacune avec un
  // pricing_snapshot figé (composantes cohérentes avec les rules : commission
  // 10 %, marge 3 %, collecte 120, livraison 200, stockage 50). Numéros
  // CMD-2026-90xx pour ne pas collisionner avec la séquence order_number_seq.
  //
  // Idempotent : ces commandes référencent les offres de Mor/Awa, donc le wipe
  // de l'étape 4 les supprime au re-run (les producer_ratings partent en
  // cascade depuis order). On crée le snapshot AVANT l'order pour rester en
  // écriture scalaire (pas de mélange relation/scalaire Prisma).
  // ─────────────────────────────────────────────────────────────────
  const laCalebasseUserId = userIdBySlug.get('la-calebasse');
  const almadiesZoneId = zoneIdBySlug.get('almadies');
  if (!laCalebasseUserId || !almadiesZoneId) {
    throw new Error('Seed invariant: missing La Calebasse user or Almadies zone');
  }
  const morPoultryOffer = await prisma.offer.findFirstOrThrow({
    where: { producerUserId: morUserId, title: 'Poulet entier' },
  });
  const awaFishOffer = await prisma.offer.findFirstOrThrow({
    where: { producerUserId: awaUserId, title: 'Thiof frais' },
  });

  const ratedOrders = [
    {
      orderNumber: 'CMD-2026-9001',
      offer: morPoultryOffer,
      producerUserId: morUserId,
      quantity: 10,
      deliveredAt: '2026-05-20T16:00:00Z',
      stars: 5,
      comment: 'Poulets fermiers excellents, livraison à l’heure.',
    },
    {
      orderNumber: 'CMD-2026-9002',
      offer: awaFishOffer,
      producerUserId: awaUserId,
      quantity: 5,
      deliveredAt: '2026-05-22T16:00:00Z',
      stars: 5,
      comment: 'Thiof très frais, parfait pour le restaurant.',
    },
    {
      orderNumber: 'CMD-2026-9003',
      offer: morPoultryOffer,
      producerUserId: morUserId,
      quantity: 4,
      deliveredAt: '2026-05-28T16:00:00Z',
      stars: 4,
      comment: 'Bonne qualité, un poulet un peu petit.',
    },
  ];

  for (const o of ratedOrders) {
    const producerPrice = o.offer.priceFcfa;
    const commission = Math.round(producerPrice * 0.1);
    const safetyMargin = Math.round(producerPrice * 0.03);
    const collection = 120;
    const delivery = 200;
    const storage = 50;
    const discount = 0;
    const finalPrice =
      producerPrice + commission + collection + delivery + storage + safetyMargin - discount;
    const deliveredAt = new Date(o.deliveredAt);

    const snapshot = await prisma.pricingSnapshot.create({
      data: {
        modelUsed: PricingModel.commission_pct,
        producerPriceFcfa: producerPrice,
        commissionFcfa: commission,
        collectionFcfa: collection,
        deliveryFcfa: delivery,
        storageFcfa: storage,
        safetyMarginFcfa: safetyMargin,
        discountFcfa: discount,
        finalPriceFcfa: finalPrice,
        producerShareFcfa: producerPrice,
        platformShareFcfa: finalPrice - producerPrice,
        quantity: o.quantity,
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: o.orderNumber,
        clientUserId: laCalebasseUserId,
        status: OrderStatus.delivered,
        deliveryZoneId: almadiesZoneId,
        deliveryAddressLine: 'Route des Almadies, Dakar',
        deliverySlotDate: deliveredAt,
        deliverySlotPeriod: DeliveryPeriod.morning,
        totalFcfa: finalPrice * o.quantity,
        paymentStatus: PaymentStatus.paid,
        confirmedAt: deliveredAt,
        collectedAt: deliveredAt,
        storedAt: deliveredAt,
        deliveredAt,
        items: {
          create: [
            {
              offerId: o.offer.id,
              producerUserId: o.producerUserId,
              quantity: o.quantity,
              unitPriceAtOrder: producerPrice,
              pricingSnapshotId: snapshot.id,
            },
          ],
        },
      },
    });

    await prisma.producerRating.create({
      data: {
        producerUserId: o.producerUserId,
        orderId: order.id,
        clientUserId: laCalebasseUserId,
        stars: o.stars,
        comment: o.comment,
      },
    });
  }
  log(`orders    3 commandes livrées + 3 avis (Mor 5★+4★ → 4.5 · Awa 5★ → 5.0)`);

  // Purge des orphelins Keycloak (cf. fonction) : le wipe de la base applicative
  // ne touche pas Keycloak → des comptes provisionnés par téléphone (+221…)
  // s'y accumulent sans ligne `users`. On les supprime pour ne pas bloquer les
  // recréations futures. Best-effort (jamais bloquant pour le seed).
  const dbUsernames = new Set(
    (await prisma.user.findMany({ select: { username: true } }))
      .map((u) => u.username)
      .filter((u): u is string => u !== null),
  );
  await purgeKeycloakOrphans(dbUsernames);
}

/**
 * Supprime les comptes Keycloak « orphelins » : username = téléphone (`+221…`,
 * donc provisionnés via le flux admin/staff) ET absents de la base applicative
 * après reseed. Ne touche JAMAIS aux users du realm-export (usernames type
 * `mor.diop`) ni aux service-accounts. Lit la config depuis `process.env` ;
 * tout est best-effort (KC absent / erreur → log + skip, le seed ne casse pas).
 */
async function purgeKeycloakOrphans(keepUsernames: Set<string>): Promise<void> {
  const baseUrl = process.env.KEYCLOAK_URL?.replace(/\/$/, '');
  const realm = process.env.KEYCLOAK_REALM;
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!baseUrl || !realm || !clientId || !clientSecret) {
    log('keycloak  purge orphelins ignorée (config admin absente)');
    return;
  }
  try {
    const tokenRes = await fetch(`${baseUrl}/realms/${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      log(`keycloak  purge orphelins ignorée (token HTTP ${tokenRes.status})`);
      return;
    }
    const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
    if (!token) {
      log('keycloak  purge orphelins ignorée (token absent)');
      return;
    }
    const auth = { authorization: `Bearer ${token}` };
    const listRes = await fetch(`${baseUrl}/admin/realms/${realm}/users?max=1000`, {
      headers: auth,
    });
    if (!listRes.ok) {
      log(`keycloak  purge orphelins ignorée (list HTTP ${listRes.status})`);
      return;
    }
    const kcUsers = (await listRes.json()) as { id: string; username?: string }[];
    let purged = 0;
    for (const u of kcUsers) {
      const username = u.username ?? '';
      if (!username.startsWith('+')) continue; // jamais les users realm-export / service-accounts
      if (keepUsernames.has(username)) continue; // a une ligne DB → légitime
      const del = await fetch(`${baseUrl}/admin/realms/${realm}/users/${u.id}`, {
        method: 'DELETE',
        headers: auth,
      });
      if (del.ok || del.status === 404) purged += 1;
    }
    log(`keycloak  ${purged} orphelin(s) supprimé(s) (comptes téléphone sans ligne DB)`);
  } catch (err) {
    log(`keycloak  purge orphelins ignorée (${err instanceof Error ? err.message : 'erreur'})`);
  }
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
