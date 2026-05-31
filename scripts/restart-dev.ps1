# Restart le stack dev MATA pour les tests manuels.
#
# Usage :
#   pnpm dev:up                             # stack complète (infra + mock + dev)
#   pnpm dev:up:reseed                      # + re-seed dev (idempotent, 1er lancement)
#   ou directement :
#     powershell.exe -ExecutionPolicy Bypass -File scripts/restart-dev.ps1 [-Reseed] [-NoBuild] [-NoDev] [-NoMock] [-WithN8n]
#
# Étapes (5 + reseed optionnel) :
#   1. Termine les process node.exe (api/web/tsx/mock) restés ouverts
#   2. Démarre l'infra docker (postgres + keycloak-db + keycloak + mailhog) en
#      attendant les healthchecks DB ET la disponibilité réelle du realm Keycloak
#      (poll du realm public, comme le global-setup E2E). -WithN8n ajoute n8n.
#   3. Rebuild les packages partagés (shared + ui) pour que les .d.ts soient à jour
#   4. Regen le client Prisma (au cas où le schema aurait changé entre 2 sessions)
#   5. (optionnel -Reseed) Applique les migrations + relance le seed dev
#   6. Démarre le mock Bictorys (port 4001) dans une fenêtre dédiée — sauf -NoMock.
#      L'API pointe déjà dessus via BICTORYS_API_BASE_URL=http://localhost:4001.
#   7. Lance `pnpm dev` (turbo orchestre api + web + watch des packages)
#
# Ctrl+C dans le terminal pour arrêter api/web. Ferme la fenêtre du mock pour
# l'arrêter (ou relance ce script : l'étape 1 tue tous les process node).

[CmdletBinding()]
param(
    [switch]$Reseed,
    [switch]$NoBuild,
    [switch]$NoDev,
    [switch]$NoMock,
    [switch]$WithN8n
)

$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..')

Write-Host "`n=== MATA dev restart ===`n" -ForegroundColor Cyan

# ── 1. Kill processes occupant les ports dev ───────────────────────
# Ciblé sur les ports dev (web 3000, api 4000, mock Bictorys 4001) plutôt que
# `Get-Process node | Stop-Process` qui tuait TOUS les node.exe de la machine
# (éditeur, autres outils, session Claude Code…). On ne tue que ce qu'on relance.
Write-Host "[1/5] Freeing dev ports (3000, 4000, 4001)..." -ForegroundColor Yellow
$devPorts = @(3000, 4000, 4001)
$pids = @()
foreach ($port in $devPorts) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) { $pids += ($conns | Select-Object -ExpandProperty OwningProcess) }
}
$pids = $pids | Sort-Object -Unique
if ($pids) {
    foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
    Write-Host "      $($pids.Count) process(es) on dev ports killed" -ForegroundColor Green
    Start-Sleep -Milliseconds 800
} else {
    Write-Host "      no process on dev ports" -ForegroundColor Gray
}

# ── 2. Docker infra (DB + Keycloak + Mailhog) ──────────────────────
Write-Host "`n[2/5] Starting docker infra..." -ForegroundColor Yellow
# DBs : on attend les healthchecks compose. Keycloak : on le démarre puis on
# sonde le realm public (signal de readiness fiable — /health est sur le port
# 9000 non mappé). Idempotent : `up` réutilise les conteneurs déjà lancés.
docker compose up -d --wait postgres keycloak-db mailhog
docker compose up -d keycloak

$realmUrl = 'http://localhost:8081/realms/mata'
$deadline = (Get-Date).AddSeconds(120)
$ready = $false
Write-Host "      Waiting for Keycloak realm ($realmUrl)..." -ForegroundColor Gray
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri $realmUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) {
    throw "Keycloak realm injoignable apres 120s ($realmUrl). Voir 'docker compose logs keycloak'."
}
Write-Host "      OK (postgres, keycloak-db, keycloak, mailhog)" -ForegroundColor Green

if ($WithN8n) {
    Write-Host "      Starting n8n (workflow a importer, cf. infra/n8n/README.md)..." -ForegroundColor Gray
    docker compose up -d n8n
}

# ── 3. Rebuild shared packages ─────────────────────────────────────
if ($NoBuild) {
    Write-Host "`n[3/5] Skipped (-NoBuild)" -ForegroundColor Gray
} else {
    Write-Host "`n[3/5] Rebuilding @mata/shared and @mata/ui..." -ForegroundColor Yellow
    pnpm --filter @mata/shared build | Out-Null
    pnpm --filter @mata/ui build | Out-Null
    Write-Host "      done" -ForegroundColor Green
}

# ── 4. Regen Prisma client ─────────────────────────────────────────
Write-Host "`n[4/5] Regenerating Prisma client..." -ForegroundColor Yellow
pnpm --filter @mata/api prisma:generate | Out-Null
Write-Host "      done" -ForegroundColor Green

# ── 4bis. Re-seed (optionnel) ──────────────────────────────────────
if ($Reseed) {
    Write-Host "`n[4bis] Applying migrations + db:seed..." -ForegroundColor Yellow
    pnpm --filter @mata/api prisma:migrate:deploy | Out-Null
    pnpm --filter @mata/api db:seed
    Write-Host "      done" -ForegroundColor Green
}

# ── 4ter. Mock Bictorys (optionnel, défaut ON) ─────────────────────
# Fenêtre dédiée pour voir ses logs ; l'API y est déjà aiguillée via
# BICTORYS_API_BASE_URL=http://localhost:4001 (apps/api/.env). Sans ce mock,
# le bouton « Payer en ligne » échoue (aucun endpoint Bictorys joignable).
if ($NoMock) {
    Write-Host "`n[mock] Skipped (-NoMock)." -ForegroundColor Gray
} else {
    Write-Host "`n[mock] Starting Bictorys mock (port 4001) in a new window..." -ForegroundColor Yellow
    $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell.exe' }
    Start-Process -FilePath $shell `
        -ArgumentList '-NoExit', '-Command', 'pnpm --filter @mata/api bictorys:mock' `
        -WorkingDirectory (Get-Location)
    Write-Host "      launched ($shell) — /_health sur http://localhost:4001" -ForegroundColor Green
}

# ── 5. Start dev ───────────────────────────────────────────────────
if ($NoDev) {
    Write-Host "`n[5/5] Skipped (-NoDev). Stack prête pour ``pnpm dev``." -ForegroundColor Gray
    return
}

Write-Host "`n[5/5] Starting dev servers (turbo)...`n" -ForegroundColor Yellow
Write-Host "  API ──────────── http://localhost:4000   /v1/health  /v1/zones" -ForegroundColor Cyan
Write-Host "  Web ──────────── http://localhost:3000   /auth/login" -ForegroundColor Cyan
Write-Host "  Keycloak admin ─ http://localhost:8081   admin / admin" -ForegroundColor Cyan
Write-Host "  Mailhog ──────── http://localhost:8025" -ForegroundColor Cyan
if (-not $NoMock) {
    Write-Host "  Bictorys mock ── http://localhost:4001   (fenêtre dédiée)" -ForegroundColor Cyan
}
if ($WithN8n) {
    Write-Host "  n8n ──────────── http://localhost:5678" -ForegroundColor Cyan
}
Write-Host "`n  Ctrl+C pour arrêter api/web · ferme la fenêtre du mock pour l'arrêter`n" -ForegroundColor Gray

pnpm dev
