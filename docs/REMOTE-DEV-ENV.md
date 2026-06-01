# Environnement de test en ligne (VPS) — exploitation au quotidien

Mémo opérationnel du VPS de test MATA (stack « mode dev » complète : web + API +
Postgres + Keycloak + n8n + MailHog + Caddy). Pour la mise en place initiale du
serveur, voir [`DEPLOY-VPS.md`](./DEPLOY-VPS.md).

- **Serveur** : Hetzner CPX32 — `root@78.47.136.147`
- **Domaines** : `app.` / `api.` / `auth.` / `n8n.` / `mail.` `.mata.keurbally.com`
- **Branche déployée** : `main`

## Connexion SSH

Connexion (depuis PowerShell sur ta machine) :

```powershell
ssh root@78.47.136.147
```

Aucun mot de passe : la clé SSH t'authentifie. La première connexion à un
serveur demande de confirmer son empreinte → taper `yes`.

### (Re)créer une clé SSH

Si tu n'as pas (ou plus) de clé sur la machine :

```powershell
# 1. Générer une paire de clés ed25519 (laisser le chemin par défaut, passphrase optionnelle)
ssh-keygen -t ed25519

# 2. Afficher la clé PUBLIQUE à copier
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

- Clé privée : `C:\Users\<toi>\.ssh\id_ed25519` (ne JAMAIS la partager).
- Clé publique : `…\id_ed25519.pub` (c'est celle qu'on copie).

### Autoriser la clé sur le serveur

- **À la création du serveur (Hetzner)** : coller la clé publique dans la section
  *SSH Keys* — c'est ce qui a été fait pour ce VPS.
- **Sur un serveur déjà créé** : ajouter la clé publique à
  `~/.ssh/authorized_keys` du serveur (une clé par ligne).

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
