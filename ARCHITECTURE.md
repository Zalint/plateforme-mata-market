# ARCHITECTURE — MATA · Du champ à l'assiette

## 1. Contexte et vision

MATA est une plateforme web mobile-first qui connecte producteurs alimentaires sénégalais, clients (professionnels et particuliers), équipes logistiques et back-office MATA. MATA orchestre la chaîne complète : collecte chez le producteur, stockage, livraison au client, encaissement, reversement.

L'application est une PWA unique multi-rôles, codée à 100% par Claude (vibe coding, aucun développeur humain). Le design et les flux sont figés par un mockup HTML validé en amont. Reproduction à l'identique attendue.

Contexte d'exécution : Sénégal. Pas de RGPD applicable. Devise FCFA (XOF), entiers, jamais de centimes.

## 2. Stack technique

### Frontend
- **Framework** : Next.js 14+ (App Router)
- **Langage** : TypeScript strict
- **Styling** : Tailwind CSS avec tokens custom (palette `mata`, ombres custom, Inter font)
- **Icônes** : `lucide-react`
- **State serveur** : TanStack Query
- **State UI** : `useState` / `useReducer` (pas de store global)
- **PWA** : `@serwist/next` (à confirmer au Lot 0 vs `next-pwa`)
- **Auth client** : `oidc-client-ts` (Keycloak OIDC + PKCE)
- **Validation** : Zod (schémas partagés avec le back via `/packages/shared`)

### Backend
- **Runtime** : Node.js 22 LTS
- **Framework** : Fastify
- **ORM** : Prisma
- **Validation** : Zod aux frontières (HTTP, env, webhooks)
- **Logger** : pino (JSON structuré)
- **Type provider** : `fastify-type-provider-zod`

### Base de données
- **PostgreSQL 16** managé par Render (instance dédiée à MATA, instance séparée pour Keycloak)
- Migrations versionnées via Prisma Migrate
- Connection pool : `connection_limit=10` par instance API

### Infrastructure
- **Hébergement** : Render (web services + Postgres + cron jobs)
- **Conteneurisation** : Docker multi-stage (Node 22 alpine + tini)
- **CI/CD** : GitHub Actions
- **Monorepo** : pnpm workspaces + Turborepo
- **Lint / Format** : Biome

### Services externes
- **Paiement & disbursement** : Bictorys (Wave, Orange Money, carte bancaire, reversements producteurs)
- **Médias** : Cloudinary (upload signé direct navigateur)
- **Email transactionnel** : resend.dev (templates JSX via `@react-email/components`)
- **Automatisation flux secondaires** : n8n (auto-hébergé sur Render Docker)
- **SSO** : Keycloak (realm `mata`, self-hosted sur Render)
- **CAPTCHA** : hCaptcha (conditionnel sur guest checkout)
- **Monitoring** : Sentry (optionnel, no-op si DSN absent)

## 3. Architecture logicielle

### Pattern global
Monolithe modulaire à deux services Node distincts :

```
        ┌────────────────────────────────────────┐
        │  PWA Next.js  (mata-web)                │
        │  - Routes : producer/*, client/*,       │
        │    admin/*, guest/*, auth/*             │
        │  - Service worker, manifest             │
        └────────────┬───────────────────────────┘
                     │ HTTPS + Bearer JWT
        ┌────────────▼───────────────────────────┐
        │  API Fastify  (mata-api)                │
        │  - REST /v1/*                           │
        │  - 10 modules métier                    │
        └────┬──────────┬──────────┬──────────────┘
             │          │          │
        ┌────▼───┐  ┌───▼────┐ ┌──▼──────┐
        │Postgres│  │Keycloak│ │Bictorys │
        │ Render │  │ Render │ │  API    │
        └────────┘  └────────┘ └─────────┘
             │
        ┌────▼──────────┐  ┌──────────┐  ┌────────┐
        │ Cloudinary    │  │ resend   │  │  n8n   │
        │ (uploads)     │  │ (emails) │  │(flows) │
        └───────────────┘  └──────────┘  └────────┘
```

### Modules métier (back)
Chaque module est isolé. Communication entre modules uniquement via leur interface publique (`modules/X/index.ts`). Pas d'accès direct au repo d'un autre module.

```
modules/
├── producers/      Producteurs, sites de production, profils
├── offers/         Offres produits, statuts, photos
├── orders/         Commandes, items, cycle de vie 8 étapes
├── pricing/        7 composantes, 4 modèles, calcul + snapshots
├── deliveries/     Tournées de collecte (pickups), livraisons
├── payments/       Bictorys, statuts, idempotence, reversements
├── teleconsult/    Codes, sessions, audit délégué
├── notifications/  Push web, email, dispatch n8n
├── audit/          audit_log central
└── users/          Mapping Keycloak ↔ profils internes
```

### Authentification (Keycloak)

Realm `mata`, 3 clients :
- `mata-web` : public, PKCE S256, redirect_uri PWA
- `mata-api` : bearer-only, vérifie JWT entrants
- `mata-admin-bootstrap` : confidentiel, scripts ops uniquement

6 rôles realm : `producer`, `client_pro`, `client_particulier`, `admin`, `teleconsultant`, `super_admin`.

Tokens côté PWA :
- Access token (5 min) : en mémoire JS uniquement
- Refresh token (30 j) : cookie HttpOnly Secure SameSite=Strict, path `/api/auth/refresh`
- Silent refresh via iframe Keycloak

Mode invité : aucun token, route `/v1/guest/orders` distincte, rate-limit strict.

## 4. Architecture PWA

### Manifest
```json
{
  "name": "MATA · Du champ à l'assiette",
  "short_name": "MATA",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#fafaf9",
  "theme_color": "#9b1c1c",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Sources SVG conservées dans `public/icons/src/` pour régénération future.

### Service worker
Généré par `@serwist/next` ou `next-pwa`, jamais écrit à la main.

Stratégies de cache :
- App shell (JS, CSS, polices) : precache au build
- Assets statiques `/public/*` : cache-first
- Images Cloudinary : stale-while-revalidate
- Requêtes API `/v1/*` : network-only (rappel : pas d'offline métier)
- Fallback navigation : `/offline.html`

### Update flow
Détection de nouvelle version via le SW, prompt utilisateur "Nouvelle version disponible, recharger ?" via composant `UpdatePrompt`.

### Installation
Prompt d'installation déclenché après une action signifiante (commande validée côté client, première offre publiée côté producteur), jamais au chargement.

### Push web
VAPID keys en variables d'env API. Permission demandée tardivement. Subscriptions stockées en DB, nettoyage automatique des endpoints 410.

iOS : push web fonctionne uniquement pour PWA installée en home screen, iOS 16.4+. Documenté côté centre d'aide MATA.

## 5. Structure du monorepo

```
mata/
├── apps/
│   ├── web/                       Next.js PWA
│   │   ├── app/
│   │   │   ├── (chromed)/         layouts avec sidebar
│   │   │   │   ├── producer/
│   │   │   │   ├── client/
│   │   │   │   └── admin/
│   │   │   ├── (chromeless)/      layouts sans sidebar
│   │   │   │   ├── auth/
│   │   │   │   └── guest/
│   │   │   ├── api/               Route Handlers minces (refresh proxy)
│   │   │   ├── layout.tsx
│   │   │   └── middleware.ts      CSP, redirects auth
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   ├── offline.html
│   │   │   └── icons/
│   │   └── src/
│   │       ├── lib/               api client, auth, hooks
│   │       └── components/        spécifiques aux pages
│   │
│   └── api/                       Fastify
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seeds/
│       │       ├── dev-seed.ts
│       │       ├── staging-seed.ts
│       │       └── prod-bootstrap.ts
│       └── src/
│           ├── modules/           10 modules métier
│           ├── lib/               bictorys, cloudinary, resend, crypto, ...
│           ├── plugins/           auth, raw-body, error-handler, ...
│           ├── jobs/              cron scripts
│           ├── env.ts             validation Zod env
│           └── server.ts
│
├── packages/
│   ├── shared/                    schémas Zod, types, constantes, errors
│   ├── ui/                        composants React partagés (design system)
│   └── config/                    tsconfig base, biome.json
│
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   └── web.Dockerfile
│   ├── keycloak/
│   │   └── realm-export.json
│   └── github/
│       └── workflows/ci.yml
│
├── docs/
│   ├── ARCHITECTURE.md            (ce fichier)
│   ├── CONVENTIONS.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
│
├── CLAUDE.md                      (à la racine, lu par Claude Code)
├── README.md
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
├── docker-compose.yml             (dev local : postgres + keycloak + mailhog)
└── package.json
```

## 6. Modèle de données

15 tables principales. Schéma complet dans `apps/api/prisma/schema.prisma`. Conventions Postgres : `snake_case` côté DB, `camelCase` côté Prisma via `@map`.

### Tables et relations clés

```
users                    Identité MATA, mappée vers Keycloak (keycloak_id)
  ├── producer_profiles  (1:1 si role=producer)
  ├── orders             (commandes client_user_id)
  ├── push_subscriptions
  └── notification_preferences

producer_profiles
  ├── production_sites
  └── offers

offers
  ├── pricing_rules      (override par offre, sinon fallback catégorie)
  └── order_items        (un order_item référence l'offre)

product_categories       (poultry, eggs, cattle, fish, vegetables, ...)
  ├── offers
  └── pricing_rules      (rules par défaut catégorie)

orders                   (CMD-2026-NNNN)
  ├── order_items
  │     ├── pricing_snapshots  (1:1 fige les 7 composantes)
  │     └── pickup_items
  └── payments
        └── (Bictorys provider_intent_id)

pickups                  (tournées de collecte)
  └── pickup_items

payouts                  (reversements producteurs via Bictorys disbursement)

teleconsult_codes        (codes 6 chiffres bcrypt, expiration 15 min)
teleconsult_sessions     (session active, audit on_behalf_of)

audit_log                (toutes actions sensibles, central)
```

### Décisions de modélisation

- **`pricing_snapshots`** : fige les 7 composantes par order_item. Changement de pricing_rule n'affecte pas les commandes passées. Non négociable pour la traçabilité comptable.
- **`producer_id` dénormalisé sur `order_items`** : index dédié pour requêtes producteur fréquentes sans join.
- **`stock_reserved` sur `offers`** : empêche la double-réservation. Manipulé uniquement en transaction Prisma.
- **`audit_log.on_behalf_of_user_id`** : colonne clé du téléconseil. Permet de retracer qu'un téléconseiller a agi au nom d'un producteur.
- **Pas de soft-delete générique**. Status métier explicite (archived, cancelled, etc.).
- **`bank_details` (jsonb)** : chiffré applicativement AES-256-GCM avant insertion.
- **`raw_webhook_payload` (jsonb)** : tous les webhooks Bictorys conservés bruts pour audit post-mortem.

### Index posés en première migration

11 index sur les colonnes filtrées fréquemment (offers.producer_id+status, orders.status+created_at, order_items.producer_id, pickups.zone+scheduled_for, payments.provider_intent_id, teleconsult_codes non utilisés non expirés, audit_log.target, audit_log.actor, etc.).

### Connection pooling
`connection_limit=10` Prisma côté API. PgBouncer ou Render connection pooling si scaling horizontal nécessaire.

## 7. APIs et intégrations

### Style API
REST. Routes versionnées `/v1/*`. Bump `/v2` seulement sur breaking change.

Contrats validés Zod. Schémas définis dans `/packages/shared/schemas/`, importés des deux côtés. Types dérivés via `z.infer<typeof X>`.

Documentation OpenAPI auto-générée via `fastify-type-provider-zod` + `@fastify/swagger`.

### Endpoints principaux

```
/v1/health                                  (DB + Keycloak)
/v1/auth/me
/v1/producers, /v1/producers/:id, ...
/v1/offers, /v1/offers/:id, ...
/v1/orders, /v1/orders/:id, /v1/orders/:id/status
/v1/pricing/simulate                        (calcul à la volée)
/v1/pricing/rules                           (config admin)
/v1/deliveries/pickups, /v1/deliveries/routes
/v1/payments/intents
/v1/payments/webhook                        (public, signé HMAC)
/v1/teleconsult/codes
/v1/teleconsult/sessions
/v1/notifications/push/subscribe
/v1/audit                                   (admin only)
/v1/guest/orders                            (public, rate-limited, hCaptcha conditionnel)
/v1/uploads/signature
```

### Bictorys (paiement + disbursement)

Intégration via `apps/api/src/lib/bictorys.ts`. Mode : Checkout hosted.

Flux paiement :
1. Création de session checkout côté API, retour `payment_url`
2. Client redirigé vers Bictorys, paie via Wave / OM / carte
3. Bictorys envoie webhook signé HMAC sur `/v1/payments/webhook`
4. Vérification signature en temps constant, parse Zod, traitement idempotent
5. Mise à jour `payments`, `orders`, `offers.stock`, écriture `audit_log`
6. Émission événement vers `outbox_events` pour dispatch n8n

Reversements producteurs : disbursement Bictorys via cron quotidien (6h UTC). Agrégation des `order_items` delivered non reversés, création `payouts`, appel API disbursement.

Idempotence à 3 niveaux :
- Bictorys → MATA : lookup `payments.provider_intent_id`, return early si déjà traité
- MATA → Bictorys : `idempotency_key = payments.id` sur les appels sortants
- Client → MATA : header `X-Idempotency-Key` sur POST /v1/orders, table `idempotency_records` TTL 24h

### Cloudinary

Upload signé direct depuis le navigateur :
1. Front demande signature à `/v1/uploads/signature` (folder figé serveur, `max_file_size=5MB`, formats restreints)
2. Navigateur uploade directement vers Cloudinary
3. Front transmet `public_id` à l'API
4. API valide l'existence via `cloudinary.api.resource` avant DB write

Stockage DB : seulement `public_id` dans `offers.cloudinary_public_ids: text[]`. URL reconstruite côté front via SDK.

### resend.dev

Templates JSX versionnés dans `apps/api/src/lib/emails/templates/` via `@react-email/components`.

Cas d'usage MVP : confirmation commande (client + guest), récap journalier admin, reporting hebdo. Reset password géré par Keycloak.

Webhook delivery sur `/v1/emails/webhook` (HMAC signé). Statuts dans table `email_events` (optionnel).

Sender : domaine à acquérir (ex `mata.sn`), DKIM/SPF/DMARC à configurer. Variables : `RESEND_API_KEY`, `EMAIL_FROM`.

### n8n

Auto-hébergé sur Render Docker. Jamais dans le chemin critique.

Flux orchestrés :
- `order.created` → push admin
- `order.confirmed` → push producteur(s) concerné(s) + email client
- `pickup.scheduled` → push producteur "Tournée demain"
- `pickup.confirmed` → push admin récap
- `order.delivered` → email client "Notez votre commande"
- `payout.sent` → push producteur + email

Pattern Outbox : API écrit dans `outbox_events`, cron retry vers n8n. Si n8n down, retry rattrape. Système opérationnel sans n8n.

### Push web

VAPID via `web-push`. Subscriptions dans `push_subscriptions`. Nettoyage automatique des endpoints qui retournent 410.

Préférences fines par catégorie d'événement dans `notification_preferences.categories` (jsonb).

### Sécurité des webhooks entrants

Tous les webhooks (Bictorys, resend, n8n callbacks éventuels) vérifient leur signature HMAC en temps constant avant tout autre traitement. Plugin `fastify-raw-body` activé uniquement sur les routes concernées.

## 8. UI / UX

### Design system (extrait du mockup)

Source de vérité : le mockup HTML validé. Pas de réinvention.

**Tokens Tailwind** (figés dans `tailwind.config.ts`) :

```ts
colors: {
  mata: { 50:'#fdf3f3', 100:'#fbe5e5', 200:'#f7cdcd', 300:'#f0a8a8',
          400:'#e57676', 500:'#d44a4a', 600:'#b91c1c', 700:'#9b1c1c',
          800:'#7f1d1d', 900:'#651414', 950:'#3a0a0a' }
},
boxShadow: {
  soft:   '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
  card:   '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
  lifted: '0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 20px -5px rgba(0,0,0,0.08)',
},
fontFamily: { sans: ['Inter','system-ui','sans-serif'] }
```

Background body `#fafaf9`. Neutres `stone-*`. Couleurs sémantiques par rôle : `amber-*` producteur, `blue-*` client, `mata-*` admin.

**Pas de shadcn/ui au MVP**. Composants React purs custom Tailwind. Headless UI uniquement si comportement complexe (Dialog, Listbox, Disclosure).

**Composants atomiques à factoriser** :

| Composant | Fonction |
|---|---|
| `AppShell` | Sidebar dark desktop + Drawer mobile + Outlet |
| `KpiCard` | 4 variantes : neutral, primary-filled, success, warning |
| `StatusBadge` | Validée, En attente, Réservée, Pause, Disponible, etc. |
| `ListRow` | Icône + titre + meta + actions (pattern récurrent) |
| `OfferCard` | Carte offre producteur |
| `ProductCard` | Carte produit catalogue client |
| `OrderCard` | 3 variantes : producer, client, admin |
| `WorkflowSection` | Header coloré "Côté X · ..." + body (parcours guidés) |
| `PricingRow` | Label + icône + input + suffix + montant final |
| `RoleBadge` | Pill avec `data-role` |
| `Money` | Rendu FCFA tabular-nums + espace fine |
| `DateChip` | Jour + mois compact (Prochaines collectes) |
| `UpdatePrompt` | Bandeau "Nouvelle version disponible" |

**Icônes** : `lucide-react`, wrapper `<Icon name="check" />` pour standardiser.

**Emojis produits** (🐓🥚🐄) : mapping centralisé `CATEGORY_EMOJI` dans `/packages/shared/constants/categories.ts`. Jamais inline.

**Formatage FCFA** : `formatFCFA(n) → "12 500 F"`. Toujours via `<Money amount={...} />`.

**Responsive** : mobile-first, breakpoint principal `lg` (1024px). Sidebar devient drawer en dessous.

### Layouts

- **Chromed** (avec sidebar) : producer/*, client/* (sauf catalog mobile), admin/*
- **Chromeless** : auth/*, guest/*
- **Sidebar** : dark `bg-stone-900`, w-64 desktop, drawer mobile
- **Bottom nav** mobile : utiliser `pb-safe` et `has-bottom-nav` (cf. mockup)

### Mobile-first
Majorité des utilisateurs sénégalais sur mobile. Toutes les pages testées en priorité sur viewports 375×667 (iPhone SE) et 411×823 (Pixel).

UX producteur : gros boutons (`py-3.5`, `py-4`), labels explicites, peu de menus imbriqués. Adapté à des utilisateurs peu à l'aise avec le digital.

## 9. Sécurité

### Authentification
Keycloak realm `mata`. 3 clients, 6 rôles. Brute force detection 5 échecs → lockout 5 min. Access token 5 min, refresh token 30 j avec rotation.

### Stockage tokens (PWA)
- Access token : mémoire JS uniquement
- Refresh token : cookie HttpOnly Secure SameSite=Strict, path `/api/auth/refresh`
- localStorage / sessionStorage / IndexedDB : INTERDITS pour tokens

### Téléconseil
- Code 6 chiffres généré par `crypto.randomInt`, hashé bcrypt avant stockage
- Expiration 15 minutes, usage unique
- Vérification temps constant, message d'erreur identique pour "invalide" et "expiré"
- Lockout 5 échecs / 1h → 30 min
- Session 15 min, audit_log obligatoire avec `actor_user_id` + `on_behalf_of_user_id`
- Whitelist d'actions interdites en session déléguée : `producer.bankDetails.update`, `producer.phone.update`, `producer.delete`, `user.password.reset`, `teleconsult.session.start`
- Notification push producteur en temps réel, email récap fin de session

### Webhooks
Lecture raw body, HMAC SHA-256, `timingSafeEqual`. Plugin `fastify-raw-body` activé route par route. Idempotence systématique.

### CSP (PWA)
Header HTTP via middleware Next.js :

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://res.cloudinary.com;
connect-src 'self' https://api.mata.sn https://keycloak.mata.sn https://api.cloudinary.com;
worker-src 'self';
manifest-src 'self';
frame-src https://keycloak.mata.sn;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

### CORS et rate-limit
- CORS strict : `origin: [PUBLIC_WEB_URL]`, `credentials: true`
- Rate-limits par route :
  - `POST /v1/guest/orders` : 10 / 15 min / IP
  - `POST /v1/auth/refresh` : 30 / min / IP
  - `POST /v1/teleconsult/codes` : 5 / 15 min / producerId
  - `POST /v1/teleconsult/sessions` : 5 / 15 min / IP
  - `POST /v1/payments/webhook` : 100 / min / IP
  - Lecture authentifiée : 600 / min / user
  - Écriture authentifiée : 60 / min / user

### CAPTCHA
hCaptcha conditionnel sur guest checkout : activé après 3 commandes guest non payées en 1h depuis même IP. Désactivé silencieusement si variables d'env vides (dev).

### Chiffrement applicatif
`producer_profiles.bank_details` chiffré AES-256-GCM. Clé `ENCRYPTION_KEY` (32 octets base64) en variable d'env Render. Affichage admin masqué par défaut, reveal explicite avec audit_log.

### Validation
Zod systématique aux frontières. Pas de payload typé "à la main".

### Anti-IDOR
Helper `assertOwnership(req, resourceUserId)` appelé sur toute route accédant à une ressource liée à un utilisateur. Rôle admin et `req.actingOnBehalfOf` autorisés en plus du propriétaire.

### Logs sécurité
Événements monitorés : `webhook.signature_invalid`, `teleconsult.code.bruteforce_lockout`, `teleconsult.session.action_forbidden`, `guest.checkout.rate_limited`, `authz.forbidden`, `encryption.decryption_failed`.

pino redact configuré pour champs sensibles (jamais loggués) : `authorization`, `password`, `code`, `secret`, `apiKey`, `bankDetails`.

## 10. Tests

### Stack
- Vitest (unitaires + intégration)
- Playwright (E2E, multi-viewports)
- `@testcontainers/postgresql` (vraie Postgres jetable pour intégration)
- MSW (mock Bictorys, Cloudinary, resend en unitaire)
- `@faker-js/faker` localisé `fr` pour données sénégalaises plausibles

### Pyramide
~60 unitaires, ~30 intégration, ~10 E2E. Zéro test inutile.

### Zones critiques à 100%
- `modules/pricing/` : 7 composantes, 4 modèles, snapshot figé, invariant comptable (producer_share + platform_share = total)
- `modules/teleconsult/` : génération code, vérification, audit, expiration, lockout, actions interdites
- `modules/payments/` : webhook signature, idempotence, transitions de statut

### Tests E2E essentiels
1. Producteur login Keycloak → producer/home
2. Producteur crée une offre
3. Admin valide l'offre
4. Client pro commande, valide
5. Webhook Bictorys → commande confirmed
6. Producteur accepte la commande
7. Admin planifie tournée
8. Téléconseil : code → session → action → audit_log
9. Guest checkout complet
10. PWA installable (manifest, SW, icônes)

### Fixtures sénégalaises
Producteurs (Mor Diop, Fatou Sarr, Aliou Ndiaye), zones (Pout, Thiès, Dahra), clients pros (Resto La Calebasse, Hôtel Terrou-Bi), adresses Dakar (Almadies, Mermoz, Sicap Liberté, Yoff, Ouakam).

## 11. CI/CD et opérations

### Dockerfile
Multi-stage Node 22 alpine + tini. Image runtime < 200 Mo. Pas de devDependencies, pas de TS source, pas de Prisma CLI au runtime.

### docker-compose dev
Postgres + Keycloak + Mailhog uniquement. API et Web tournent en `pnpm dev` natif (hot reload).

### Pipeline GitHub Actions

```yaml
on: [push, pull_request]
jobs:
  ci:
    steps:
      - pnpm install --frozen-lockfile
      - pnpm biome ci .
      - pnpm --filter @mata/shared build
      - pnpm --filter @mata/api prisma generate
      - pnpm typecheck
      - pnpm test:unit
      - pnpm test:integration       # testcontainers
      - if main : pnpm test:e2e     # complet sur main uniquement
      - pnpm --filter @mata/api build
      - pnpm --filter @mata/web build
```

### Déploiement Render
Auto-deploy sur push `main`. Pre-Deploy Command sur `mata-api` : `pnpm --filter @mata/api prisma migrate deploy`. Healthcheck `/health`.

### Cron jobs Render
- `cleanup-expired-teleconsult` : */5 min, marque sessions expirées, supprime codes > 1h non utilisés
- `retry-outbox` : */1 min, retry events vers n8n
- `process-payouts` : 6h UTC, agrège order_items delivered, crée payouts, appel Bictorys disbursement

Tous trois dans la même image Docker que l'API, CMD différent.

### Environnements
- Dev local : docker-compose + pnpm dev
- Preview Render : sur PR (plan Team uniquement, optionnel au MVP)
- Prod Render : auto-deploy main

### Logs
pino JSON sur stdout, ingéré par Render. `requestId` injecté par requête. Niveaux : info (métier), warn (anormal non critique), error (exceptions).

### Monitoring
Render dashboard + logs (7j rétention Starter). Sentry optionnel (variable `SENTRY_DSN`, no-op si vide).

### Rollback
Render UI → Events → Rollback. Migrations destructives en deux temps (ajout puis suppression, deux releases séparées) pour permettre le rollback DB.

### Backups
Render Postgres backups quotidiens, rétention 7 jours (Starter). À vérifier activé au Lot 0.

### Budget Render estimé
~42 $/mois (6 services Starter : mata-web, mata-api, mata-keycloak, mata-db, mata-keycloak-db, mata-n8n).

## 12. Conventions de code

- TypeScript strict mode, `noUncheckedIndexedAccess`, `noImplicitOverride`
- Biome (lint + format + import sort)
- Fichiers : `kebab-case.ts`
- Types / Classes / Composants React : `PascalCase`
- Variables / fonctions : `camelCase`
- Constantes globales : `UPPER_SNAKE_CASE`
- Tables DB : `snake_case` (mappé via Prisma `@map`)
- Pas d'export default sauf composants React et pages Next.js
- Trunk-based development : branche feature → PR → main
- Conventional Commits
- Une PR par lot du plan de réalisation
- Description PR avec : ce qui change, tests ajoutés, captures d'écran si UI

## 13. Plan de réalisation (10 lots, ~6 jours-Claude)

```
Lot 0  Setup ............................. 0,5 j
       monorepo, Docker, Render (web/api/db),
       Keycloak realm, manifest PWA,
       ARCHITECTURE.md + CLAUDE.md initial

Lot 1  Auth + design system ............... 0,5 j
       Keycloak end-to-end, composants UI atomiques,
       AppShell, routing chromed/chromeless

Lot 2  Producteurs, offres, sites ......... 0,5 j
       CRUD complet, écrans producer/*

Lot 3  Pricing 7 composantes .............. 0,5 j
       modèle DB, moteur de calcul, snapshots,
       écran admin/pricing

Lot 4  Commandes + cycle 8 étapes ......... 1 j
       modèle, transitions de statut,
       écrans client/* et admin/orders

Lot 5  Paiements Bictorys + reversements .. 0,5 j
       checkout, webhook, idempotence,
       cron payouts, écran admin/payments

Lot 6  Téléconseil sécurisé ............... 0,5 j
       code, session, audit_log,
       écrans workflows/teleconseil

Lot 7  Tournées + push + n8n .............. 0,5 j
       pickups, push subscriptions,
       outbox events, 6 workflows n8n

Lot 8  Guest checkout ..................... 0,5 j
       parcours invité complet sans auth,
       hCaptcha conditionnel

Lot 9  Tests E2E + durcissement + prod .... 1 j
       Playwright complet, CSP, rate-limit,
       revue secrets, mise en prod
```

Cumul : 6 jours-Claude. Marge d'1 jour sur la semaine pour imprévus et itérations.

## 14. Glossaire métier MATA

| Terme français | Terme code | Précisions |
|---|---|---|
| Producteur | `producer` | table `producer_profiles` |
| Site de production | `productionSite` | table `production_sites` |
| Offre | `offer` | produit publié par un producteur |
| Tournée de collecte | `pickup` | groupage producteurs par zone |
| Livraison | `delivery` | associée à un order |
| Commande | `order` | `CMD-2026-NNNN` |
| Reversement | `payout` | table `payouts`, via Bictorys disbursement |
| Pricing semi-auto | `pricing` | `pricing_rules` + `pricing_snapshots` |
| Marge sécurité | `safety_margin` | métier, jamais "security margin" |
| Téléconseil | `teleconsult` | jamais "telesupport" ni "remote assist" |
| Téléconseiller | `teleconsultant` | rôle Keycloak |
| Mode invité | `guest` | `orders.client_user_id NULL` + `guest_phone` |
| Créneau livraison | `delivery_slot` | date + period (morning / afternoon) |
| Prix final client | `final_price_fcfa` | total dû par le client |
| Part producteur | `producer_share` | reçu par le producteur sur un item |
| Part MATA | `platform_share` | gardé par MATA sur un item |
| Zone | `zone` | Pout, Dahra, Thiès, Almadies, Mermoz, ... |
| FCFA / F | int | jamais de centimes, jamais Decimal/Float |

Cohérence : tables Postgres en `snake_case`, code TS en `camelCase`. Conversion via Prisma `@map`.
