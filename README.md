# MATA Plateforme — Du champ à l'assiette

Plateforme web mobile-first qui connecte producteurs alimentaires sénégalais,
clients (pros et particuliers), équipes logistiques et back-office MATA.

## Statut des lots

| Lot | Périmètre | Statut |
|-----|-----------|--------|
| 0 | Setup monorepo + tooling + Render blueprint | ✅ |
| 1 | Auth Keycloak + design system | ✅ |
| 2 | Producteurs · offres · sites · catalogue · Cloudinary | ✅ |
| 3 | Pricing 7 composantes (4 modèles × 3 bases pct) | ✅ |
| 4 | Commandes · cycle 8 étapes · idempotency | ✅ |
| 5 | Paiements Bictorys + reversements | ✅ |
| 6 | Téléconseil sécurisé | ✅ |
| 7 | Tournées + push + n8n | ✅ |
| 8 | Guest checkout | ✅ |
| 9 | E2E + durcissement + prod | ⏳ |

Plan détaillé : [`ARCHITECTURE.md` §13](./ARCHITECTURE.md#13-plan-de-réalisation-10-lots-6-jours-claude).

## Stack

- **Frontend** : Next.js 15 (App Router) · TypeScript strict · Tailwind · `lucide-react`
- **Backend** : Node 22 LTS · Fastify · Prisma · Zod · pino
- **DB** : PostgreSQL 18
- **SSO** : Keycloak (realm `mata`)
- **Hébergement** : Render (web + api + 2× postgres + keycloak)
- **Monorepo** : pnpm workspaces + Turborepo + Biome

Détails complets : [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Démarrer en local

```bash
# 1. Pré-requis : Node 22, pnpm 9, Docker
node --version  # >= 22
pnpm --version  # >= 9
docker --version

# 2. Cloner et installer
git clone https://github.com/Zalint/plateforme-mata-market.git
cd plateforme-mata-market
pnpm install

# 3. Démarrer Postgres + Keycloak + Mailhog
docker compose up -d

# 4. Configurer l'API + le Web
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local  # si présent

# 5. Appliquer toutes les migrations
pnpm --filter @mata/api prisma migrate deploy

# 6. Importer le realm Keycloak (3 users dev + roles)
# → http://localhost:8081/admin (admin/admin) → Create realm → Browse
#   → infra/keycloak/realm-export.json → Create

# 7. Seed la base avec données dev
pnpm --filter @mata/api db:seed

# 8. Démarrer api + web
pnpm dev
```

URLs locales :
- Web (Next.js) : http://localhost:3000
- API (Fastify) : http://localhost:4000
- Keycloak : http://localhost:8081 (admin / admin)
- Mailhog : http://localhost:8025

> Note Windows + EnterpriseDB : Keycloak est mappé sur **8081** (EDB squatte 8080).
> Sur une machine sans EDB, repasse à `8080:8080` dans `docker-compose.yml`
> et aligne les variables `KEYCLOAK_URL` côté `.env`.

## Comptes dev local

Les 3 comptes ci-dessous sont créés par le realm-export Keycloak (UUIDs
stables) et alignés avec le seed dev. Password commun : `mata`.

| Username | Mot de passe | Rôle | Espace |
|---|---|---|---|
| `mor.diop` | `mata` | producer | `/producer/*` |
| `aissatou.sow` | `mata` | admin | `/admin/*` |
| `lacalebasse.client` | `mata` | client_pro | `/client/*` |

Login : http://localhost:3000/welcome → "Se connecter via Keycloak".

## Comment tester chaque lot

### Lot 1 — Auth + design system
Connecte-toi avec n'importe quel compte → tu arrives sur l'espace du rôle
correspondant. La sidebar montre les liens disponibles par rôle.

### Lot 2 — Producteurs · offres · sites
1. Login `mor.diop` → `/producer/sites` → crée un site → `/producer/offers` → crée une offre → soumets-la
2. Login `aissatou.sow` → `/admin/producers` (validation profil) puis `/admin/offers` (validation offres)
3. Login `lacalebasse.client` → `/client/catalog` voit les offres validées

### Lot 3 — Pricing
1. Login `aissatou.sow` → `/admin/pricing`
2. Choisis une catégorie (ex Volaille) ou une offre
3. Choisis un modèle (Commission %, Marge fixe, Mixte, Négocié)
4. Ajuste les composantes et regarde le bandeau noir mettre à jour le prix final
5. Clique "Enregistrer & appliquer" → la rule est créée + audit `pricing.rule.create`
   en DB. Recharger la page la pré-remplit en mode "Mettre à jour".

### Lot 4 — Commandes
1. Login `lacalebasse.client` → `/client/catalog` → clique "+ Panier" sur une offre
2. `/client/cart` → choisis zone livraison + adresse + date + créneau → "Valider la commande"
3. Login `aissatou.sow` → `/admin/orders` → tu vois la commande en `created`
4. Clique "Passer en confirmée" → "Passer en collecte" → ... → "Passer en livrée"
   (à chaque étape, audit `order.status_change` écrit en DB)
5. Login `mor.diop` → `/producer/received-orders` → tu vois la commande
6. Idempotency : refais POST avec même `X-Idempotency-Key` → 200 avec même body
   (pas de doublon). Test inclus dans la suite intégration.

### Lot 5 — Paiements Bictorys + reversements
1. Login `lacalebasse.client` → passe une commande en **paiement en ligne** →
   redirection vers le lien de paiement Bictorys → retour sur `/payment/return`
2. Le webhook `/v1/payments/webhook` (HMAC vérifié en temps constant, raw body)
   marque la commande `paid` de façon idempotente (lookup `provider_intent_id`)
3. Login `aissatou.sow` → `/admin/payments` → suit les paiements et déclenche les
   reversements producteurs (`payout`) ; chaque transition écrit dans `audit_log`
4. Tests inclus : signature invalide → 401, idempotence webhook, calcul des parts
   (`producer_share` / `platform_share`)

### Lot 6 — Téléconseil sécurisé
1. Login `mor.diop` → `/producer/help/code` → un code à 6 chiffres s'affiche
   (généré `crypto.randomInt`, haché bcrypt, jamais reloggé, jamais relisible)
2. Login `aissatou.sow` → `/admin/teleconseil` → saisit le code → ouvre une
   session déléguée (15 min) au nom du producteur
3. Toute action déléguée écrit dans `audit_log` avec `actor` (téléconseiller) +
   `on_behalf_of` (producteur). La whitelist `TELECONSULT_FORBIDDEN_ACTIONS` bloque
   les actions interdites
4. Tests inclus : audit_log actor/on_behalf_of correct, code jamais révélé

### Lot 7 — Tournées de collecte + push web + n8n
1. Login `aissatou.sow` → `/admin/pickups` → crée/planifie une tournée de collecte
2. Login `mor.diop` → `/producer/pickups` → voit ses tournées. La permission push
   est demandée **après** une action signifiante (pas au chargement)
3. Les events métier alimentent `outbox_events` ; le cron `retry-outbox` dispatche
   vers n8n (HMAC `X-Mata-Signature`). Si n8n est down, le retry exponentiel
   rattrape — n8n n'est **jamais** dans le chemin critique
4. Tests inclus : dispatch, retry, abandon après `MAX_RETRIES`, vérif HMAC

### Lot 8 — Guest checkout (mode invité)
1. Construis un panier puis va sur `/guest/checkout` (route chromeless, sans
   compte). Le catalogue invité est **masqué** : l'identité producteur est cachée
   (affiché « Producteur MATA vérifié »)
2. Remplis coordonnées (`+221` + 9 chiffres), adresse, zone, créneau, et choisis
   **Paiement à la livraison** (cash) ou **Paiement en ligne** (Bictorys)
3. Si `HCAPTCHA_SECRET` (api) + `NEXT_PUBLIC_HCAPTCHA_SITEKEY` (web) sont
   configurés, le widget anti-bot hCaptcha apparaît et **désactive** le bouton
   tant qu'il n'est pas résolu. Sans configuration, la porte se désactive en dev
4. « Valider la commande » → écran de confirmation (`CMD-2026-NNNN`, total figé
   côté serveur via pricing snapshot). Les routes `/v1/guest/*` sont en plugin
   Fastify dédié, rate-limit strict, hCaptcha sur la création de commande
5. Tests inclus (11) : zones, catalogue masqué, création cash/online, idempotency,
   intent sans captcha (token à usage unique consommé à la commande)

> **Paire hCaptcha de test (démo locale)** : sitekey
> `10000000-ffff-ffff-ffff-000000000001` (web) + secret
> `0x0000000000000000000000000000000000000000` (api). Le secret de test valide le
> token produit par la sitekey de test. En prod, provisionner de vraies clés
> hCaptcha sur Render (`NEXT_PUBLIC_HCAPTCHA_SITEKEY` / `HCAPTCHA_SECRET`).

## Scripts utiles

```bash
pnpm typecheck            # vérification TypeScript de tous les packages
pnpm biome check .        # lint + format
pnpm format               # auto-fix biome
pnpm test                 # tests unit (vitest)
pnpm --filter @mata/api test:integration  # tests integration (testcontainers + Postgres jetable)
pnpm build                # build de tous les packages
pnpm dev                  # dev mode (api + web en parallèle)
```

## Reset complet (utile en dev)

```bash
# Wipe la DB MATA + Keycloak + recompose
docker compose down -v
docker compose up -d
pnpm --filter @mata/api prisma migrate deploy
# Re-importer le realm via UI Keycloak (cf. étape 6 de "Démarrer en local")
pnpm --filter @mata/api db:seed
```

Tous les UUIDs Keycloak et DB sont stables (cf. `infra/keycloak/realm-export.json`
et `apps/api/prisma/seeds/dev-seed.ts`), donc le reset ne nécessite aucune
manipulation SQL manuelle.

## Structure du monorepo

```
mata/
├── apps/
│   ├── web/                  Next.js PWA
│   └── api/                  Fastify + Prisma
├── packages/
│   ├── shared/               Zod schemas + constants + DomainError
│   └── ui/                   Composants React partagés (design system)
├── infra/
│   ├── docker/               Dockerfiles api + web
│   └── keycloak/             realm-export.json (3 users dev)
├── docs/
│   ├── BACKLOG.md            Dette technique + reports inter-lots
│   └── DEPLOYMENT.md         Procédure Render
├── mockup/                   Maquette HTML de référence (source de vérité UI)
├── render.yaml               Blueprint Render
├── docker-compose.yml        Dev local (Postgres + Keycloak + Mailhog)
├── ARCHITECTURE.md
├── CLAUDE.md                 Règles de développement assisté
└── README.md
```

## Maquette de référence

La maquette HTML cliquable est dans [`mockup/index.html`](./mockup/index.html).
C'est la **source de vérité visuelle** pour reproduire l'UX en Next.js
(cf. CLAUDE.md §E1 « Ne réinvente pas l'UI »).

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — architecture cible complète (15 sections)
- [`CLAUDE.md`](./CLAUDE.md) — règles de développement assisté par Claude
- [`docs/BACKLOG.md`](./docs/BACKLOG.md) — dette technique + entrées `[lot-X→lot-Y]`
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — procédure Render et opérations

## Déploiement

Auto-deploy Render sur push `main`. Procédure de première mise en place :
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).
