#!/usr/bin/env bash
#
# bootstrap-vps.sh — prépare un VPS Ubuntu 24.04 (ex. Hetzner CX32) pour faire
# tourner la stack MATA de test. À lancer EN ROOT sur le serveur fraîchement créé :
#
#   ssh root@<IP>
#   curl -fsSL https://raw.githubusercontent.com/Zalint/plateforme-mata-market/development/infra/deploy/bootstrap-vps.sh | bash
#   # (ou : git clone … puis  sudo bash infra/deploy/bootstrap-vps.sh)
#
# Idempotent : relançable sans danger.
set -euo pipefail

echo "[1/4] Mise à jour du système…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y

echo "[2/4] Swap 4 Go (marge pour le build / next dev)…"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "      swap activé."
else
  echo "      swap déjà présent."
fi

echo "[3/4] Pare-feu (ufw) : SSH + 80 + 443…"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[4/4] Docker Engine + plugin compose…"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker --version
docker compose version

cat <<'NEXT'

✅ VPS prêt. Suite (cf. docs/DEPLOY-VPS.md) :

  git clone https://github.com/Zalint/plateforme-mata-market.git
  cd plateforme-mata-market/infra/deploy
  cp .env.example .env && nano .env        # domaine + secrets
  docker compose up -d --build

Puis sur https://auth.<domaine> : ajouter les redirect URIs publiques au client mata-web.
NEXT
