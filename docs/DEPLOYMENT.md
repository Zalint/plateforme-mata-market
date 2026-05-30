# Déploiement MATA · Render

Procédure de mise en place et opérations courantes pour l'infrastructure
Render. À lire avant la première mise en production.

## Architecture cible

5 services Render (cf. `render.yaml` et ARCHITECTURE.md §11) :

| Service           | Type      | Plan    | Rôle                          |
| ----------------- | --------- | ------- | ----------------------------- |
| mata-api          | Web (docker)  | Starter | Fastify · API REST `/v1/*` |
| mata-web          | Web (docker)  | Starter | Next.js · PWA              |
| mata-keycloak     | Web (image)   | Starter | SSO Keycloak               |
| mata-db           | Postgres  | Starter | DB applicative              |
| mata-keycloak-db  | Postgres  | Starter | DB Keycloak (isolée)        |

À quoi s'ajoutent **4 cron jobs** (`mata-cron-*`) qui réutilisent l'image Docker
de `mata-api` — cf. § Cron jobs.

Coût estimé : ~42 $/mois (crons facturés à l'usage). Un éventuel `mata-n8n`
viendra plus tard (Lot 7).

## Première mise en place (Lot 0)

### 1. Préparer le repo

Le repo `Zalint/plateforme-mata-market` doit contenir `render.yaml` à la
racine et les Dockerfiles dans `infra/docker/`.

```bash
git push origin main
```

### 2. Appliquer le blueprint

Sur [render.com](https://render.com) :

1. **New** → **Blueprint**.
2. Sélectionner le repo `Zalint/plateforme-mata-market`, branche `main`.
3. Render détecte `render.yaml` et liste les 5 services à créer.
4. Cliquer **Apply Blueprint**.

Render crée les services et lance les premiers builds. Comptez ~10 min
pour le premier déploiement complet (image Docker à construire pour
api et web).

### 3. Configurer les variables d'environnement secrètes

Render demande les variables marquées `sync: false` au moment de
l'application du blueprint. À fournir manuellement :

| Variable                    | Où / comment l'obtenir                            |
| --------------------------- | -------------------------------------------------- |
| `PUBLIC_WEB_URL`            | URL publique de mata-web (`https://mata-web.onrender.com` ou domaine custom) |
| `KEYCLOAK_URL`              | URL publique de mata-keycloak (`https://mata-keycloak.onrender.com`) |
| `KC_BOOTSTRAP_ADMIN_USERNAME` | Admin Keycloak initial — choisir un identifiant fort |
| `KC_BOOTSTRAP_ADMIN_PASSWORD` | Admin Keycloak initial — mot de passe fort, à archiver dans le coffre |
| `BICTORYS_API_KEY`          | Dashboard Bictorys → API keys (Lot 5)             |
| `BICTORYS_WEBHOOK_SECRET`   | Dashboard Bictorys → Webhooks (Lot 5)             |
| `CLOUDINARY_*`              | Dashboard Cloudinary → Settings → API Keys (Lot 2) |
| `RESEND_API_KEY`            | Dashboard resend.com → API keys (Lot 5+)          |
| `EMAIL_FROM`                | Adresse expéditeur validée (ex. `noreply@mata.sn`)|
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (Lot 7) |
| `VAPID_SUBJECT`             | `mailto:tech@mata.sn` (Lot 7)                     |
| `HCAPTCHA_SECRET`           | Dashboard hCaptcha (Lot 8)                        |
| `SENTRY_DSN`                | Dashboard Sentry (optionnel)                      |

`ENCRYPTION_KEY` est généré automatiquement par Render via `generateValue: true`.

### 4. Importer le realm Keycloak

Une fois `mata-keycloak` démarré et l'admin initial configuré :

1. Se connecter à `https://mata-keycloak.onrender.com` avec `KC_BOOTSTRAP_ADMIN_*`.
2. **Add Realm** → **Import** → uploader `infra/keycloak/realm-export.json`.
3. Vérifier que les 3 clients et 6 rôles sont créés.
4. Mettre à jour les `redirectUris` et `webOrigins` du client `mata-web` pour pointer vers l'URL Render finale.

### 5. Vérifier la chaîne complète

```bash
curl https://mata-api.onrender.com/v1/health
# attendu : { "status": "ok", "checks": { "db": "ok", "keycloak": "skipped" } }

curl -I https://mata-web.onrender.com
# attendu : HTTP/2 200
```

Si `db` n'est pas `ok`, vérifier que `DATABASE_URL` est bien câblé et que la
Pre-Deploy Command `prisma migrate deploy` s'est exécutée sans erreur dans les
logs de `mata-api`.

## Opérations courantes

### Déploiement

Auto-deploy activé sur `main`. Tout push déclenche un build. Suivre dans
Render → Service → **Events**.

### Migrations

Toute migration locale (`pnpm --filter @mata/api prisma migrate dev`)
commitée sur `main` est appliquée automatiquement au prochain deploy via
la Pre-Deploy Command de `mata-api`.

**Règle CLAUDE.md §G4** : migrations destructives en DEUX déploiements
(ajout d'abord, suppression dans une release suivante) pour permettre le
rollback DB.

#### Procédure migrations destructives en deux temps

Une migration est *destructive* si elle supprime ou renomme une colonne, un
type ou une table déjà déployés en prod. Un déploiement unique qui ajoute la
nouvelle forme **et** supprime l'ancienne rend impossible le rollback du code :
si le déploiement N introduit un bug applicatif, revenir au code N-1 ne suffit
pas car la colonne qu'il lisait n'existe plus.

La règle : **part1 (additif) au déploiement N, part2 (destructif) au
déploiement N+1**, une fois N validé stable en prod.

- **Déploiement N (part1, additif, réversible)** : crée la nouvelle colonne /
  type / table, backfill les données, garde l'ancienne forme en place comme
  fallback. Le code N sait lire la nouvelle forme tout en tolérant l'ancienne.
  Si N régresse → rollback du code seul, la DB reste compatible.
- **Validation** : laisser tourner N en prod le temps de confirmer (logs,
  `/v1/health`, parcours critiques). Pas de part2 tant que N n'est pas jugé sain.
- **Déploiement N+1 (part2, destructif)** : supprime l'ancienne colonne /
  type, renomme la nouvelle vers son nom final. À partir d'ici, rollback du
  code seul ne suffit plus — un rollback nécessiterait `prisma migrate resolve
  --rolled-back` + une migration inverse (cf. § Rollback).

##### Cas concret · `lot5_payments_part2` (release SÉPARÉE)

Le passage de `orders.payment_status` TEXT → enum `PaymentStatus` est livré en
deux migrations (cf. BACKLOG `[lot-5→lot-9]`, résolu) :

| Migration | Effet | Déploiement |
| --- | --- | --- |
| `20260530100000_lot5_payments_part1_add_enum` | crée l'enum, ajoute `payment_status_v2`, backfill depuis TEXT, NOT NULL + DEFAULT, **garde la TEXT** | N |
| `20260530100100_lot5_payments_part2_drop_text` | DROP la colonne TEXT + rename `_v2` → `payment_status` | **N+1, release distincte** |

En local/dev/test les deux s'enchaînent via `prisma migrate deploy` (séquence
OK). **En prod, ne pas déployer les deux ensemble** : pousser d'abord un commit
contenant uniquement `part1`, valider, puis pousser `part2` dans un commit
ultérieur. Le `schema.prisma` reflète déjà l'état final post-part2 ; la
contrainte est sur l'ordre de déploiement des fichiers de migration, pas sur le
schéma.

##### Cas concret · rename `lot2_rename_producer_id`

Le rename `producer_id` → `producer_user_id` (migration
`20260529202110_lot2_rename_*`) est un rename direct **uniquement parce que ce
schéma n'a jamais été déployé en prod** (cf. BACKLOG `[lot-2→lot-9]`, résolu).
Pour tout rename futur d'une colonne **déjà en prod**, appliquer la procédure
deux temps : part1 ajoute la nouvelle colonne + backfill + double-écriture côté
code, part2 (release suivante) supprime l'ancienne.

### Rollback

Render → Service → **Events** → bouton **Rollback** sur le commit cible.
Attention : un rollback de code ne reverte pas la DB. Si une migration
destructive est intercalée, il faut d'abord rollback la migration
manuellement via `prisma migrate resolve --rolled-back`.

### Backups DB

Plan Starter : backups quotidiens automatiques, rétention 7 jours.
**À vérifier dans le dashboard Render** : Database → Backups → activé.

### Logs

Render → Service → **Logs** (rétention 7 jours sur Starter).
Format pino JSON. Filtrer par `requestId` pour suivre une requête.

### Cron jobs

Quatre cron jobs partagent l'image Docker `mata-api` (`api.Dockerfile`), avec
un `dockerCommand` override (cf. `render.yaml`) :

| Service Render | Commande | Schedule (UTC) | Rôle |
| --- | --- | --- | --- |
| `mata-cron-retry-outbox` | `node dist/jobs/retry-outbox.js` | `*/1 * * * *` | délivre `outbox_events` → n8n |
| `mata-cron-process-payouts` | `node dist/jobs/process-payouts.js` | `0 6 * * *` | agrège items livrés, déclenche reversements |
| `mata-cron-cleanup-teleconsult` | `node dist/jobs/cleanup-expired-teleconsult.js` | `*/5 * * * *` | ferme sessions expirées, purge codes |
| `mata-cron-cleanup-idempotency` | `node dist/jobs/cleanup-idempotency.js` | `0 3 * * *` | purge `idempotency_records` > 24h |

**Pourquoi `node dist/jobs/...` et pas `pnpm <job>:cron`** : l'image runtime est
produite par `pnpm --prod deploy` (sans devDeps → pas de `tsx`) et ne copie que
`dist/` + `prisma/`, sans les sources TS. Les scripts `*:cron` du `package.json`
(`tsx src/jobs/...`) ne fonctionnent qu'en dev local où les sources sont présentes.

**Pause manuelle** : poser `CRON_DISABLED=true` sur le service → le job log
`cron.disabled_via_env` et sort en exit 0 sans rien traiter.

**Env vars par cron** : tous reçoivent `DATABASE_URL`. `retry-outbox` a besoin
de `N8N_BASE_URL`/`N8N_WEBHOOK_SECRET` (sinon il skip, n8n hors chemin critique).
`process-payouts` a besoin des clés `BICTORYS_*` pour les disbursements et
accepte `CRON_ACTOR_USER_ID` (optionnel ; à défaut, premier admin actif).

## Dev local

`render.yaml` n'est **pas utilisé en dev local**. En local on utilise
`docker-compose.yml` (Postgres + Keycloak + Mailhog) et `pnpm dev` pour
api et web.

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm dev
```

API sur `http://localhost:4000`, Web sur `http://localhost:3000`,
Keycloak sur `http://localhost:8080`, Mailhog sur `http://localhost:8025`.
