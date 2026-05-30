#!/usr/bin/env bash
# restart-dev.sh — équivalent Git Bash du restart-dev.ps1.
#
# Usage :
#   bash scripts/restart-dev.sh              # restart complet
#   bash scripts/restart-dev.sh --reseed     # + re-seed dev
#   bash scripts/restart-dev.sh --no-build   # skip rebuild shared+ui
#   bash scripts/restart-dev.sh --no-dev     # juste nettoyer

set -euo pipefail
cd "$(dirname "$0")/.."

RESEED=false
NO_BUILD=false
NO_DEV=false
for arg in "$@"; do
    case "$arg" in
        --reseed)   RESEED=true ;;
        --no-build) NO_BUILD=true ;;
        --no-dev)   NO_DEV=true ;;
        *) echo "Unknown arg: $arg"; exit 1 ;;
    esac
done

step() { printf "\033[36m==> %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m    %s\033[0m\n" "$1"; }
warn() { printf "\033[33m    %s\033[0m\n" "$1"; }

# 1. Kill node processes (Windows via Git Bash : taskkill, sinon pkill)
step 'Killing node processes'
if command -v taskkill >/dev/null 2>&1; then
    taskkill //F //IM node.exe >/dev/null 2>&1 || ok 'no node process was running'
else
    pkill -f 'tsx watch'  2>/dev/null || true
    pkill -f 'next dev'   2>/dev/null || true
    pkill -f 'tsc.*watch' 2>/dev/null || true
fi
sleep 1

# 2. Docker compose
step 'Checking docker compose services'
running=$(docker compose ps --status running --services 2>/dev/null || true)
missing=()
for svc in postgres keycloak; do
    echo "$running" | grep -q "^${svc}$" || missing+=("$svc")
done
if [ ${#missing[@]} -gt 0 ]; then
    warn "Services manquants : ${missing[*]}"
    step 'Starting docker compose up -d'
    docker compose up -d
    ok 'Waiting 10s for services to be ready'
    sleep 10
else
    ok 'postgres + keycloak running'
fi

# 3. Rebuild shared + ui
if [ "$NO_BUILD" = false ]; then
    step 'Rebuilding @mata/shared'
    pnpm --filter @mata/shared build >/dev/null
    ok 'shared OK'

    step 'Rebuilding @mata/ui'
    pnpm --filter @mata/ui build >/dev/null
    ok 'ui OK'
else
    step 'Build skipped (--no-build)'
fi

# 4. Prisma generate
step 'Regenerating Prisma client'
pnpm --filter @mata/api prisma:generate >/dev/null
ok 'prisma client regenerated'

# 5. Re-seed (optionnel)
if [ "$RESEED" = true ]; then
    step 'Re-applying migrations + seed'
    pnpm --filter @mata/api prisma:migrate:deploy >/dev/null
    pnpm --filter @mata/api db:seed
    ok 'db seeded'
fi

# 6. Lance la stack dev
if [ "$NO_DEV" = true ]; then
    step 'Dev start skipped (--no-dev). Stack prête pour `pnpm dev`.'
    exit 0
fi

step 'Starting dev servers (turbo)'
printf "    %-22s%s\n" 'API'              'http://localhost:4000/v1/health'
printf "    %-22s%s\n" 'Web'              'http://localhost:3000'
printf "    %-22s%s\n" 'Keycloak admin'   'http://localhost:8080  (admin / admin)'
printf "    %-22s%s\n" 'Mailhog'          'http://localhost:8025'
echo ''
echo '    Ctrl+C pour arrêter toute la stack.'
echo ''

pnpm dev
