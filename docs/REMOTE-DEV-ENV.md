# Environnement de test en ligne (VPS) — exploitation au quotidien

Mémo opérationnel du VPS de test MATA (stack « mode dev » complète : web + API +
Postgres + Keycloak + n8n + MailHog + Caddy). Pour la mise en place initiale du
serveur, voir [`DEPLOY-VPS.md`](./DEPLOY-VPS.md).

- **Serveur** : Hetzner CPX32 — `root@78.47.136.147`
- **Domaines** : `app.` / `api.` / `auth.` / `n8n.` / `mail.` `.mata.keurbally.com`
- **Branche déployée** : `main`

## Déployer la dernière version de `main`

```bash
ssh root@78.47.136.147
cd ~/plateforme-mata-market && git fetch origin && git reset --hard origin/main
cd infra/deploy && docker compose up -d --build
docker compose logs -f app      # surveiller, Ctrl+C pour quitter les logs
```

> `git reset --hard origin/main` aligne le serveur sur `main`. Le fichier `.env`
> (secrets, non suivi par git) est **préservé**.

## Commandes courantes

Toutes lancées depuis `~/plateforme-mata-market/infra/deploy`.

| Situation | Commande |
|---|---|
| Changement de code (après un `git reset`) | `docker compose up -d --build` |
| Changement `.env` seulement (secrets, clés) | `docker compose up -d` |
| Juste (re)démarrer sans rien changer | `docker compose up -d` |
| Voir les logs de l'app | `docker compose logs -f app` |
| État des conteneurs | `docker compose ps` |
| Tout arrêter (garde les données) | `docker compose down` |
| Tout relancer après un `down` | `docker compose up -d` |
| ⚠️ Reset total (efface DB/volumes) | `docker compose down -v` |
