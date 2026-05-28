# MATA Plateforme — Du champ à l'assiette

Plateforme web mobile-first qui connecte producteurs alimentaires sénégalais,
clients (pros et particuliers), équipes logistiques et back-office MATA.

## Statut

| Lot | Périmètre | Statut |
|-----|-----------|--------|
| 0 | Setup monorepo + tooling + Render blueprint | ✅ |
| 1 | Auth Keycloak + design system | ⏳ |
| 2 | Producteurs · offres · sites | ⏳ |
| 3 | Pricing 7 composantes | ⏳ |
| 4 | Commandes · cycle 8 étapes | ⏳ |
| 5 | Paiements Bictorys + reversements | ⏳ |
| 6 | Téléconseil sécurisé | ⏳ |
| 7 | Tournées + push + n8n | ⏳ |
| 8 | Guest checkout | ⏳ |
| 9 | E2E + durcissement + prod | ⏳ |

Plan détaillé : [`ARCHITECTURE.md` §13](./ARCHITECTURE.md#13-plan-de-réalisation-10-lots-6-jours-claude).

## Stack

- **Frontend** : Next.js 15 (App Router) · TypeScript strict · Tailwind · `lucide-react`
- **Backend** : Node 22 LTS · Fastify · Prisma · Zod · pino
- **DB** : PostgreSQL 16
- **SSO** : Keycloak
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

# 4. Configurer l'API
cp apps/api/.env.example apps/api/.env

# 5. Appliquer la migration initiale
pnpm --filter @mata/api prisma migrate dev

# 6. Démarrer api + web
pnpm dev
```

URLs locales :
- Web (Next.js) : http://localhost:3000
- API (Fastify) : http://localhost:4000
- Keycloak : http://localhost:8080 (admin / admin)
- Mailhog : http://localhost:8025

## Scripts utiles

```bash
pnpm typecheck       # vérification TypeScript de tous les packages
pnpm biome check .   # lint + format
pnpm format          # auto-fix biome
pnpm test            # unit tests vitest
pnpm build           # build de tous les packages
pnpm dev             # dev mode (api + web en parallèle)
```

## Structure du monorepo

```
mata/
├── apps/
│   ├── web/                  Next.js PWA
│   └── api/                  Fastify + Prisma
├── packages/
│   └── shared/               Zod schemas + constants + DomainError
├── infra/
│   ├── docker/               Dockerfiles api + web
│   └── keycloak/             realm-export.json
├── docs/
│   └── DEPLOYMENT.md         Procédure Render
├── mockup/                   Maquette HTML de référence (v0.2)
├── render.yaml               Blueprint Render
├── docker-compose.yml        Dev local
├── ARCHITECTURE.md
├── CLAUDE.md                 Règles de développement assisté
└── README.md
```

## Maquette de référence

La maquette HTML cliquable reste disponible dans [`mockup/index.html`](./mockup/index.html).
Elle est la source de vérité visuelle pour reproduire l'UX en Next.js
(cf. CLAUDE.md §E1 « Ne réinvente pas l'UI »).

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — architecture cible complète
- [`CLAUDE.md`](./CLAUDE.md) — règles de développement assisté par Claude
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — procédure Render et opérations

## Déploiement

Auto-deploy Render sur push `main`. Procédure de première mise en place :
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).
