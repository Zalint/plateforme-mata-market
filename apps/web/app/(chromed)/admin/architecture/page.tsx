import { Icon } from '@mata/ui';

/**
 * Admin / Architecture de l'app · page de documentation (lecture seule).
 *
 * Explique le design conceptuel : stack frontend / backend, outillage,
 * intégrations externes, et l'organisation des 19 modules métier du backend.
 * Source : code réel (apps/web, apps/api, packages, docker-compose).
 */

type Item = { label: string; desc: string };

const FE_STACK: Item[] = [
  { label: 'Next.js 15 (App Router, Turbopack)', desc: 'Framework React : routing, rendu, PWA.' },
  { label: 'React 19', desc: 'Couche UI.' },
  { label: 'Tailwind CSS', desc: 'Styling — palette mata + stone (aucun hex inline).' },
  {
    label: '@mata/ui + lucide-react',
    desc: 'Composants partagés (ProductCard, KpiCard, Money…) + icônes.',
  },
  { label: 'TanStack Query', desc: 'État serveur : hooks use-*, cache, polling.' },
  {
    label: 'Keycloak (OIDC + PKCE)',
    desc: 'Auth : access token en mémoire, refresh en cookie HttpOnly.',
  },
  { label: 'serwist / next-pwa', desc: 'Service worker (installable, offline).' },
];

const BE_STACK: Item[] = [
  { label: 'Fastify', desc: 'Serveur HTTP, routes versionnées /v1/*.' },
  { label: 'fastify-type-provider-zod', desc: 'Validation + typage Zod des requêtes/réponses.' },
  { label: 'Prisma + PostgreSQL 18', desc: 'Unique accès DB, migrations versionnées.' },
  { label: 'pino', desc: 'Logs structurés (secrets redactés).' },
  { label: 'Zod', desc: 'Validation à toutes les frontières (HTTP, env, webhooks).' },
  {
    label: 'bcrypt · node:crypto',
    desc: 'Codes téléconseil (bcrypt) · bank_details chiffrés AES-256-GCM.',
  },
];

const TOOLING: Item[] = [
  {
    label: 'TypeScript strict',
    desc: 'strict + noUncheckedIndexedAccess — jamais any / @ts-ignore.',
  },
  { label: 'Biome', desc: 'Lint + format + tri des imports.' },
  { label: 'Vitest', desc: 'Tests unitaires + intégration (testcontainers, vraie Postgres).' },
  { label: 'Playwright', desc: 'Tests E2E (smoke).' },
  {
    label: 'pnpm workspaces + Turborepo',
    desc: 'Monorepo, orchestration et cache build/test/typecheck.',
  },
  {
    label: 'Docker multi-stage · Render',
    desc: 'Image runtime < 200 Mo · migrations en Pre-Deploy.',
  },
];

const EXTERNAL: Item[] = [
  { label: 'Keycloak', desc: 'Identité (OIDC + PKCE) + Admin API pour provisionner les comptes.' },
  {
    label: 'Bictorys',
    desc: 'Paiement (checkout + reversements). Webhook vérifié HMAC temps constant.',
  },
  { label: 'Cloudinary', desc: 'Upload d’images signé côté serveur (le secret ne sort jamais).' },
  { label: 'n8n', desc: 'Automatisations via pattern Outbox — HORS du chemin critique.' },
  { label: 'Web Push (VAPID)', desc: 'Notifications navigateur.' },
  { label: 'hCaptcha', desc: 'Anti-bot sur le checkout invité.' },
  { label: 'resend / MailHog', desc: 'Emails (resend en prod, MailHog capture en dev).' },
];

type ModuleGroup = { domain: string; tone: string; modules: string; desc: string };
const MODULE_GROUPS: ModuleGroup[] = [
  {
    domain: 'Auth & sécurité',
    tone: 'bg-mata-50 text-mata-700',
    modules: 'auth · teleconsult · users · audit',
    desc: 'JWT & rôles, délégation par code 6 chiffres, création de comptes, journal d’audit.',
  },
  {
    domain: 'Catalogue & offres',
    tone: 'bg-amber-50 text-amber-700',
    modules: 'catalog · offers · producers · sites · zones',
    desc: 'Offres validées, profils producteurs, sites de production, zones.',
  },
  {
    domain: 'Commandes & logistique',
    tone: 'bg-blue-50 text-blue-700',
    modules: 'orders · pickups · guest',
    desc: 'Cycle de commande, tournées de collecte, mode invité.',
  },
  {
    domain: 'Pricing & paiements',
    tone: 'bg-green-50 text-green-700',
    modules: 'pricing · payments · payouts',
    desc: 'Règles à 7 composantes + snapshots, Bictorys, reversements producteurs.',
  },
  {
    domain: 'Transverses',
    tone: 'bg-stone-100 text-stone-700',
    modules: 'dashboard · notifications · uploads · outbox',
    desc: 'KPIs par rôle, push web, upload Cloudinary, dispatch vers n8n.',
  },
];

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5 lg:p-6">
      <h2 className="text-lg font-bold text-stone-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

/** Liste label — description. */
function ItemList({ items }: { items: Item[] }): React.JSX.Element {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-start gap-2 text-sm text-stone-600">
          <Icon name="check-circle" className="w-4 h-4 text-mata-700 mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold text-stone-900">{it.label}</span> — {it.desc}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Boîte d'un étage du diagramme système. */
function Layer({
  title,
  sub,
  tone,
}: {
  title: string;
  sub: string;
  tone: string;
}): React.JSX.Element {
  return (
    <div className={`w-full rounded-xl border p-4 text-center ${tone}`}>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs opacity-80 mt-0.5">{sub}</div>
    </div>
  );
}

function Arrow(): React.JSX.Element {
  return (
    <div className="flex justify-center py-1.5 text-stone-400" aria-hidden="true">
      <Icon name="chevron-down" className="w-5 h-5" />
    </div>
  );
}

export default function AdminArchitecturePage(): React.JSX.Element {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="text-sm text-stone-500 flex items-center gap-2">
          <Icon name="scroll-text" className="w-4 h-4 text-mata-700" />
          <span>Documentation technique</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-1">
          Architecture de l'app
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Frameworks, librairies, outils externes (frontend & backend) et organisation des modules.
        </p>
      </div>

      {/* Diagramme système */}
      <Card title="Vue système — qui parle à qui">
        <Layer
          title="Navigateur — PWA mobile-first"
          sub="Client (producteur · client · admin · invité)"
          tone="bg-stone-100 text-stone-700 border-stone-200"
        />
        <Arrow />
        <Layer
          title="apps/web — Frontend · Next.js 15 (App Router, Turbopack)"
          sub="React · Tailwind · @mata/ui · TanStack Query · /api/auth/* (OIDC+PKCE → Keycloak)"
          tone="bg-mata-50 text-mata-800 border-mata-200"
        />
        <Arrow />
        <Layer
          title="apps/api — Backend · Fastify (Zod) · pino"
          sub="19 modules métier (service + routes + index) · Prisma · crypto (bank_details)"
          tone="bg-mata-700 text-white border-mata-800"
        />
        <Arrow />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Layer
            title="PostgreSQL 18"
            sub="Prisma — source de vérité métier"
            tone="bg-blue-50 text-blue-700 border-blue-200"
          />
          <Layer
            title="Keycloak (+ Postgres)"
            sub="OIDC/PKCE — realm mata"
            tone="bg-amber-50 text-amber-700 border-amber-200"
          />
          <Layer
            title="n8n"
            sub="Automatisations (Outbox, hors chemin critique)"
            tone="bg-green-50 text-green-700 border-green-200"
          />
        </div>
        <p className="text-xs text-stone-500 mt-4">
          Règle clé : aucune logique métier dans le web (pas de Server Action → Prisma). Le web
          appelle l’API en <code className="bg-stone-100 px-1 rounded">/v1/*</code>. n8n reçoit des
          events via la table <code className="bg-stone-100 px-1 rounded">outbox_events</code>{' '}
          (cron) → s’il tombe, commandes et paiements continuent.
        </p>
      </Card>

      {/* Monorepo */}
      <Card title="Monorepo (pnpm workspaces + Turborepo)">
        <pre className="text-xs sm:text-sm bg-stone-900 text-stone-100 rounded-xl p-4 overflow-x-auto leading-relaxed">{`plateforme/
├─ apps/
│  ├─ web/      Next.js (PWA, front)
│  └─ api/      Fastify (backend)
├─ packages/
│  ├─ shared/   schémas Zod + constantes + erreurs  ◄── importé par web ET api
│  └─ ui/       composants React (ProductCard, KpiCard, Money, Icon…)
├─ infra/       keycloak (thème + realm), n8n (workflow)
└─ docs/        ARCHITECTURE.md · BACKLOG.md · DEPLOYMENT.md`}</pre>
        <p className="text-xs text-stone-500 mt-3">
          <span className="font-semibold text-stone-900">@mata/shared</span> est le contrat commun :
          les schémas Zod y vivent et sont validés des deux côtés (frontière HTTP).
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Stack Frontend (apps/web)">
          <ItemList items={FE_STACK} />
        </Card>
        <Card title="Stack Backend (apps/api)">
          <ItemList items={BE_STACK} />
        </Card>
        <Card title="Outillage & qualité">
          <ItemList items={TOOLING} />
        </Card>
        <Card title="Intégrations externes">
          <ItemList items={EXTERNAL} />
        </Card>
      </div>

      {/* Modules */}
      <Card title="Organisation des modules backend (19)">
        <p className="text-sm text-stone-500 mb-4">
          Chaque module suit le même patron et ne communique avec les autres que via son{' '}
          <code className="bg-stone-100 px-1 rounded">index.ts</code> (interface publique) :
        </p>
        <pre className="text-xs sm:text-sm bg-stone-900 text-stone-100 rounded-xl p-4 overflow-x-auto leading-relaxed mb-5">{`modules/<domaine>/
├─ <domaine>-routes.ts    parse la requête → appelle le service → retourne
├─ <domaine>-service.ts   TOUTE la logique métier (accès Prisma)
├─ index.ts               exporte routes + service (seul point d'entrée public)
└─ __tests__/             tests d'intégration (vraie Postgres)`}</pre>
        <div className="space-y-4">
          {MODULE_GROUPS.map((g) => (
            <div key={g.domain}>
              <span
                className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${g.tone}`}
              >
                {g.domain}
              </span>
              <div className="mt-1.5">
                <code className="text-sm font-semibold text-stone-900">{g.modules}</code>
                <p className="text-sm text-stone-600 mt-0.5">{g.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500 mt-5">
          <span className="font-semibold text-stone-900">apps/api/src/lib/</span> regroupe les
          clients d’intégration externe (bictorys, cloudinary, keycloak-admin, n8n, web-push,
          hcaptcha) et les utilitaires (prisma, logger, crypto) — tout appel sortant passe par un
          helper <code className="bg-stone-100 px-1 rounded">httpFetch</code> (timeout + retry).
        </p>
      </Card>
    </div>
  );
}
