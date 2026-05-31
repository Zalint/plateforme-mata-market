# Déploiement de TEST en ligne (VPS) — stack « mode dev » complète

But : tester MATA en ligne **avec tous les services ensemble** (web, api, Postgres,
Keycloak avec realm importé, n8n, MailHog), au plus proche du dev local. C'est un
environnement de **test**, pas de production (voir `render.yaml` + `DEPLOYMENT.md`
pour la prod prod-like).

Tout est dans `infra/deploy/` : `docker-compose.yml`, `Dockerfile.devstack`,
`Caddyfile`, `.env.example`.

## Architecture

```
                Internet (HTTPS, Let's Encrypt via Caddy)
   app.<domaine> ─► web (Next dev, 3000) ─┐
   api.<domaine> ─► api (Fastify, 4000) ──┤  (même conteneur « app »)
   auth.<domaine>─► Keycloak (8080, realm mata importé)
   n8n.<domaine> ─► n8n            mail.<domaine> ─► MailHog
                         │
              Postgres (app) · Postgres (Keycloak)
```

Le navigateur appelle l'API **en direct** sur `api.<domaine>` (CORS autorisé via
`PUBLIC_WEB_URL`). L'app tourne en **mode dev** (les `NEXT_PUBLIC_*` sont lues au
runtime → reconfigurables sans rebuild).

## 1. Pré-requis

- Un VPS (ex. Hetzner CX22, DigitalOcean) avec **Docker + Docker Compose**.
- Ports **80 et 443** ouverts.
- Un domaine avec **3 enregistrements DNS A** (+2 optionnels) vers l'IP du VPS :
  `app.`, `api.`, `auth.` (et `n8n.`, `mail.`).

## 2. Récupérer le code + configurer

```bash
git clone https://github.com/Zalint/plateforme-mata-market.git
cd plateforme-mata-market/infra/deploy
cp .env.example .env
nano .env            # domaine, mots de passe, clés Cloudinary/Bictorys, ENCRYPTION_KEY…
```

Générer `ENCRYPTION_KEY` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`KC_ADMIN_BOOTSTRAP_SECRET` doit valoir **le secret du client `mata-admin-bootstrap`**
du realm (`change-me-in-prod` par défaut dans `infra/keycloak/realm-export.json`).

## 3. Démarrer

```bash
docker compose up -d --build      # build l'app + lance tout
docker compose logs -f app        # suivre migrations + seed + dev
```

Au 1er démarrage : migrations Prisma + seed (comptes `mor.diop`, `aissatou.sow`…,
mot de passe `mata`) + import du realm Keycloak (clients, rôles du service account).

## 4. ⚠️ Étape unique Keycloak — URLs de redirection

Le realm importé a des `redirectUris` en `localhost` (dev). Pour que l'OIDC marche
en ligne, sur **https://auth.&lt;domaine&gt;** (console admin, identifiants `KC_ADMIN_*`) :

1. Realm **mata** → Clients → **mata-web** :
   - **Valid redirect URIs** : ajouter `https://app.<domaine>/*`
   - **Valid post logout redirect URIs** : `https://app.<domaine>`
   - **Web origins** : `https://app.<domaine>`
2. Enregistrer.

(Étape manuelle car le domaine varie par déploiement — l'import de realm ne
substitue pas les variables.)

## 5. Vérifier

- `https://app.<domaine>` → page d'accueil → **Se connecter** → login Keycloak
  (`mor.diop` / `mata`, ou `aissatou.sow` / `mata` pour l'admin).
- `https://api.<domaine>/v1/health` → `{"status":"ok"}`.
- `https://auth.<domaine>` → console Keycloak.

## Notes & limites

- **Serveur de développement** (`next dev` / `tsx watch`) : pour tester, pas du
  trafic réel. Pour la prod → `render.yaml` (build optimisé).
- **Crons non lancés** automatiquement ici (retry-outbox, payouts…). Pour les
  jouer : `docker compose exec app pnpm --filter @mata/api outbox:cron` (etc.).
- **n8n** : importer le workflow depuis `infra/n8n/` dans l'UI `n8n.<domaine>`.
- **Secrets** : `.env` n'est jamais commité (déjà dans `.dockerignore` / `.gitignore`).
- **Mise à jour** : `git pull && docker compose up -d --build`.
- **Reset complet** : `docker compose down -v` (efface les volumes/DB).
