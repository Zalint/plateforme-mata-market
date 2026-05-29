# CLAUDE.md — Règles de développement assisté par Claude

> Lis ce fichier en début de chaque session Claude Code sur ce projet.
> Si une règle d'ici contredit une suggestion spontanée de ta part, c'est la règle qui gagne.

## A. Contexte projet

MATA est une PWA mobile-first qui orchestre la chaîne du producteur sénégalais jusqu'au client final. Trois rôles (Producteur, Client, Admin) + mode invité. Pricing à 7 composantes. Téléconseil sécurisé. Paiements Bictorys.

Tu es l'unique développeur sur ce projet. Aucun humain n'écrira de code. Le design et les flux sont validés par un mockup HTML : tu le reproduis à l'identique, tu ne le réinventes pas. Contexte Sénégal, pas de RGPD applicable, devise FCFA en entiers.

## B. Principes fondamentaux

1. Avant d'écrire, lis. Le code voisin, le mockup pour les écrans, `ARCHITECTURE.md` pour les choix structurants.
2. Avant toute tâche non triviale, produis un plan court (3-7 étapes) et attends validation.
3. Tests en parallèle du code, pas après.
4. À la fin de chaque tâche, résume : fichiers touchés, raisonnement, risques résiduels.
5. Marque tes zones d'incertitude au lieu de bluffer.

## C. Stack figée

Toute déviation requiert une mise à jour explicite de `ARCHITECTURE.md` dans la même PR.

- TypeScript strict, Node 22 LTS, Next.js 14+ (App Router), Fastify
- Prisma + PostgreSQL 16, migrations versionnées
- Tailwind + lucide-react + composants React purs (pas de shadcn au MVP)
- TanStack Query pour l'état serveur
- Biome (lint + format + import sort)
- pnpm workspaces + Turborepo
- Docker multi-stage, déploiement Render
- Keycloak (OIDC + PKCE), Bictorys (paiement), Cloudinary, resend.dev, n8n
- Zod aux frontières systématiquement

## D. Interdictions absolues

1. Jamais inventer une API, fonction, ou lib. En cas de doute, lis la doc ou demande.
2. Jamais inventer un chemin de fichier. Liste le repo avant d'éditer.
3. Jamais ajouter une dépendance npm sans la justifier dans le commit (lib, alternative écartée, surface d'attaque).
4. Jamais écrire un secret en clair. Tous les secrets passent par variables d'env Render et validation Zod au boot.
5. Jamais supprimer, désactiver, skipper ou commenter un test pour faire passer une feature.
6. Jamais utiliser `any`, `@ts-ignore`, `@ts-expect-error`. `unknown` sans narrowing immédiat est interdit aussi.
7. Jamais laisser `console.log`, code commenté, TODO sans contexte daté.
8. Jamais avaler une erreur dans un try/catch silencieux. Soit rethrow, soit DomainError, soit log explicite avec commentaire justifiant l'absorption.
9. Jamais d'opération destructive sans confirmation explicite (DROP, TRUNCATE, rm -rf, DELETE en masse).
10. Jamais bypasser Keycloak. Pas d'auth maison, pas de bcrypt user, pas de JWT custom.
11. Jamais exposer une clé Cloudinary, Bictorys, resend, Keycloak ou VAPID privée côté client.
12. Jamais committer un fichier `.env`.

## E. Anti-patterns Claude spécifiques MATA

1. **Ne réinvente pas l'UI.** Le mockup est figé. Reproduis-le. Pas d'ombre "améliorée", pas de padding "optimisé", pas de composant "plus moderne" spontané.
2. **Ne sur-type pas.** Les enums Postgres sont la source de vérité, pas un type discriminé à 15 variantes.
3. **N'abstraie pas prématurément.** Factorisation à partir du 5e cas similaire, jamais au 3e. Code répétitif lisible > abstraction prématurée illisible.
4. **N'ajoute pas de feature non demandée.** Périmètre strict du lot en cours.
5. **Ne mocke pas Prisma dans les tests d'intégration.** Vraie Postgres via testcontainers.
6. **N'utilise pas `unknown` puis cast.** C'est `any` déguisé. Soit tu narrows avec Zod, soit tu re-types proprement.
7. **N'empile pas les `useEffect`.** État serveur = TanStack Query. État dérivé = `useMemo`. `useEffect` réservé aux vrais side effects.
8. **N'introduis pas d'abstraction "future Stripe"** par-dessus Bictorys. YAGNI. Bictorys est le choix.
9. **Ne dogmatise pas les Server Components.** Le mockup est interactif : panier, pricing simulator, formulaires restent Client Components.
10. **Ne shortcut pas une migration destructive.** Deux temps : ajout d'abord, suppression dans une release suivante.

## F. Workflow agent

1. Lis les fichiers concernés et les sections pertinentes de `ARCHITECTURE.md`
2. Sur tâche non triviale, produis un plan et attends validation
3. Écris en respectant les conventions du repo
4. Génère les tests en même temps que le code
5. Lance `pnpm typecheck && pnpm biome check . && pnpm test` avant de présenter
6. Résume : fichiers touchés, décisions, tests, risques
7. Marque les zones d'incertitude au lieu de les masquer

## G. Règles par domaine

### G1. UI et PWA

- Palette `mata` + neutres `stone` + ombres custom = SEULE source de vérité couleurs/ombres
- Jamais de hex inline. Jamais `bg-red-*` ou `bg-rose-*` à la place de `bg-mata-*`
- Avant de créer un composant UI, vérifie `/packages/ui/components`. Si existe à 80%, étends-le. Pas de duplication.
- Tous les montants FCFA passent par `<Money amount={...} />`. Jamais `{amount} F` inline ni `toLocaleString()`.
- Mapping `productCategory → emoji` centralisé dans `/packages/shared/constants/categories.ts`. Pas d'emoji produit inline.
- Pas de shadcn/MUI/Chakra/Mantine/Radix-non-justifié. Tailwind + Lucide + Headless UI au cas par cas.
- Breakpoint principal : `lg` (1024px). Pas de breakpoint intermédiaire sans justification.
- Avant un nouvel écran, ouvre le mockup, reproduis la structure HTML/Tailwind à l'identique, adapte ensuite au framework.
- Manifest à jour, icônes 192/512 PNG + variantes maskable. SW généré par serwist/next-pwa, jamais à la main.
- Permission push demandée APRÈS action signifiante, jamais au chargement.

### G2. Code TypeScript / Node

- `tsconfig` : `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Jamais affaibli.
- Toute frontière (HTTP entrant, env, webhook, JSON parsé) passe par un schéma Zod dans `/packages/shared/schemas/`.
- Aucune logique métier dans `*.routes.ts`. Routes : parse, appelle service, retourne. Point.
- Un module métier n'accède PAS au repo d'un autre module. Passe par `modules/X/index.ts`.
- Hiérarchie `DomainError` typée. Aucun `throw new Error()` générique.
- Fonction > 50 lignes ou fichier > 500 lignes : refactore ou justifie en commentaire.
- pino uniquement, jamais `console.log`. Contexte structuré (objet en premier argument).

### G3. Architecture

- Architecture : `apps/web` (Next.js PWA) + `apps/api` (Fastify) + Postgres + Keycloak. Pas de Server Actions appelant Prisma. Pas de logique métier dans `apps/web`.
- Modules métier isolés. Communication via interfaces publiques uniquement.
- Auth = Keycloak. Toujours.
- Routes API versionnées `/v1/*`. Bump `/v2` sur breaking change confirmé.
- Toute action métier sensible écrit dans `audit_log` via `auditService.log()`. Pas d'exception.
- n8n jamais dans le chemin critique. Si n8n down, le système fonctionne.
- État serveur = TanStack Query. Pas de Redux/Zustand sauf raison documentée.
- Service worker généré par serwist/next-pwa. Personnalisation via config, pas en éditant le SW.
- Mode invité SÉPARÉ : routes `/v1/guest/*`, plugin Fastify dédié, rate-limit strict.

### G4. Base de données

- Prisma est l'UNIQUE point d'accès Postgres. Pas de pg natif, Knex, TypeORM, SQL string concaténé.
- Toute modification de schéma passe par `prisma migrate dev`. Jamais `prisma db push` en prod. Migrations commitées jamais éditées.
- Enums définis dans `schema.prisma`. Ajout de valeur = migration dédiée.
- Toute requête filtrant sur colonne non-PK doit avoir un index couvrant. Vérifie l'index AVANT.
- `pricing_snapshots` figé à la création de la commande. Jamais modifié. Changement de pricing_rule = nouvelle rule, nouveaux snapshots pour nouvelles commandes.
- `stock` et `stock_reserved` modifiés UNIQUEMENT en transaction Prisma (`$transaction`).
- Soft-deletes génériques INTERDITS. Status métier explicite.
- `audit_log` écrit pour toute action métier sensible (création/modif offre, transition order, paiement, reversement, session teleconsult, action déléguée).
- `bank_details` chiffré applicativement AES-256-GCM avant insertion, déchiffré au moment d'usage, jamais loggé.
- Seeds prod : `prod-bootstrap.ts` uniquement, refuse de tourner si DB pas vide.

### G5. Intégrations

- Bictorys est l'UNIQUE prestataire paiement. Pas de Stripe, pas de Wave SDK direct, pas d'OM API direct. Tout via `apps/api/src/lib/bictorys.ts`.
- Webhook `/v1/payments/webhook` lit RAW BODY, vérifie HMAC en TEMPS CONSTANT avant tout autre code.
- Toute opération paiement IDEMPOTENTE. Lookup par `provider_intent_id`, return early si déjà traité.
- Cloudinary : upload direct navigateur avec signature serveur. Jamais `API_SECRET` côté client. Jamais le client choisit le folder. Validation serveur du `public_id` retourné.
- resend : tous emails via template JSX versionné dans `apps/api/src/lib/emails/templates/`. Pas de string concat.
- n8n jamais appelé en attente synchrone. Pattern Outbox : event dans `outbox_events`, cron délivre. Si n8n down, retry rattrape.
- Push web : permission demandée tardivement. Endpoints 410 supprimés immédiatement.
- Clés externes validées Zod au boot. Manquante en prod = serveur refuse de démarrer.
- Toute requête sortante a timeout 10s + retry exponentiel (3 tentatives, base 500ms). Helper `httpFetch` dédié, jamais `fetch` nu.

### G6. Tests

- Aucun code métier commité sans test unitaire OU intégration. Le test n'est pas optionnel.
- Test qui échoue ne se skip pas, ne se @ts-ignore pas, ne se commente pas. Corrige ou supprime en expliquant.
- Modification du moteur pricing → au moins un test démontrant le comportement.
- Modification flux téléconseil → au moins un test vérifiant audit_log écrit avec actor + on_behalf_of corrects.
- Tout endpoint webhook a test signature invalide → 401 ET test d'idempotence.
- Tests d'intégration : testcontainers + vraie Postgres. Jamais mocker Prisma. Jamais SQLite mémoire.
- Tests flaky interdits. Diagnostic et fix AVANT toute nouvelle feature.
- Fixtures dans `__tests__/fixtures/` avec helpers `makeX()`. Pas de données inline répétitives.
- Avant "passer à autre chose", lance `pnpm test` localement.
- CI sur PR : biome + typecheck + unit + integration + E2E smoke. Pas de force-merge.

### G7. DevOps Render + Docker + GitHub

- Toute variable d'env utilisée apparaît dans `.env.example` ET dans `env.ts` Zod. Sinon refus boot.
- Secrets prod uniquement dans dashboard Render. Jamais dans code, `.env.local` commité, migration, commentaire.
- Dockerfile multi-stage. Runtime sans devDeps, sans TS source, sans Prisma CLI. Image < 200 Mo.
- Migrations via Render Pre-Deploy Command (`prisma migrate deploy`). Pas de route HTTP, pas de script ad-hoc, pas de manuel.
- Modifications destructives schéma en DEUX déploiements (ajout puis suppression).
- Cron jobs partagent le Dockerfile de l'API. Jamais d'image séparée.
- Tout endpoint exposé internet a timeout, rate-limit, log structuré pino avec requestId.
- `/health` vérifie au minimum DB et Keycloak.
- Procédure rollback documentée dans `/docs/DEPLOYMENT.md`. Testée une fois en staging.

### G8. Sécurité

- Aucune auth HORS Keycloak. Pas de bcrypt user, pas de `users.password_hash`, pas de JWT custom.
- Access token JAMAIS en localStorage / sessionStorage / IndexedDB. Mémoire pour JWT court, cookie HttpOnly Secure SameSite=Strict pour refresh.
- Webhook lit RAW BODY, vérifie HMAC en TEMPS CONSTANT. Aucune logique avant validation.
- Tout endpoint `/v1/*` (hors `/v1/health`, `/v1/guest/*`, `/v1/payments/webhook`) exige JWT valide. Sans token : 401.
- Toute route sur ressource liée à utilisateur appelle `assertOwnership(req, resourceUserId)`.
- Code téléconseil : `crypto.randomInt`, bcrypt, renvoyé une seule fois, jamais loggé, jamais relisible.
- Whitelist `TELECONSULT_FORBIDDEN_ACTIONS` respectée rigoureusement.
- `bank_details` toujours `encrypt()` avant write, `decrypt()` au moment d'usage, jamais loggé (pino redact).
- CSP active en prod. Nouvelle dépendance qui exige `'unsafe-eval'` ou nouveau host = motivation + mise à jour CSP explicite.
- Variables d'env sensibles jamais dans log, erreur retournée client, message audit. pino redact configuré.
- Tout endpoint acceptant JSON utilisateur passe par Zod. Zéro confiance dans le payload.
- Permissions par rôle vérifiées EXPLICITEMENT à chaque endpoint. Lisibles dans la route, pas dans un middleware caché.

## H. Commandes de session

Tape ces commandes (ou attends-les de l'entrepreneur) et exécute la procédure correspondante.

### Génériques

- `plan` — Plan court 3-7 étapes, attends validation avant d'écrire
- `lis d'abord` — Liste et lis les fichiers concernés AVANT toute écriture
- `résumé` — Récap fin de tâche : fichiers touchés, raisons, tests, risques
- `pourquoi` — Justifie un choix technique
- `options` — Présente 2-3 alternatives avec trade-offs
- `tests d'abord` — Génère les tests AVANT l'implémentation, attends validation, puis implémente
- `copie le mockup` — Reproduis l'écran du mockup à l'identique, sans "amélioration"

### Spécifiques MATA

- `check pricing` — Vérifie : utilisation `pricing_snapshots`, non-altération commandes passées, tests unitaires moteur
- `check teleconseil` — Vérifie : audit_log avec actor + on_behalf_of, whitelist respectée, code jamais révélé
- `check bictorys` — Vérifie : raw body + HMAC temps constant, idempotence `provider_intent_id`, `raw_webhook_payload` loggé
- `check pwa` — Vérifie : manifest à jour, icônes 192/512 + maskable PNG, SW généré, `/offline.html`, install prompt tardif
- `check secu` — Revoit : secrets, `assertOwnership`, Zod, bank_details chiffré, audit_log
- `check render` — Vérifie : `.env.example`, `env.ts` Zod, migration prête Pre-Deploy, pas de console.log
- `verrouille` — Considère un fichier/module comme stable. Lectures OK, écritures sur demande explicite uniquement

### Arrêt

- `stop` — Arrête immédiatement la tâche, sans tenter de "finir proprement"
- `recommence` — Oublie la tentative précédente, reprends de zéro sur la même tâche avec angle différent

## I. Glossaire métier MATA

À utiliser tel quel dans le code, jamais traduit ni paraphrasé.

| Français | Code |
|---|---|
| Producteur | `producer` (table `producer_profiles`) |
| Site de production | `productionSite` (table `production_sites`) |
| Offre | `offer` |
| Tournée de collecte | `pickup` |
| Livraison | `delivery` |
| Commande | `order` (numéro `CMD-2026-NNNN`) |
| Reversement | `payout` |
| Pricing semi-auto | `pricing` (`pricing_rules` + `pricing_snapshots`) |
| Marge sécurité | `safety_margin` |
| Téléconseil | `teleconsult` |
| Téléconseiller | `teleconsultant` |
| Mode invité | `guest` |
| Créneau livraison | `delivery_slot` |
| Prix final client | `final_price_fcfa` |
| Part producteur | `producer_share` |
| Part MATA | `platform_share` |
| Zone | `zone` (Pout, Dahra, Thiès, Almadies, Mermoz, ...) |
| FCFA / F | int (jamais de centimes, jamais Decimal/Float) |

Tables Postgres en `snake_case`, code TypeScript en `camelCase`. Conversion via Prisma `@map`.
