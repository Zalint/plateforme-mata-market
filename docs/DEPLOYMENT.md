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

Coût estimé : ~42 $/mois. Un éventuel `mata-n8n` viendra plus tard (Lot 7).

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

### Cron jobs (Lot 5+)

Trois cron jobs partagent l'image Docker `mata-api` (CMD différent) :

- `cleanup-expired-teleconsult` · `*/5 * * * *`
- `retry-outbox` · `* * * * *`
- `process-payouts` · `0 6 * * *` (6h UTC)

À ajouter dans `render.yaml` à leur Lot dédié.

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
