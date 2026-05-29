# Restart le stack dev MATA pour les tests manuels.
#
# Usage :
#   pnpm restart                            # restart complet
#   pnpm restart:reseed                     # + re-seed dev (idempotent)
#   ou directement : pwsh -File scripts/restart-dev.ps1 [-Reseed] [-NoBuild] [-NoDev]
#                    powershell.exe -ExecutionPolicy Bypass -File scripts/restart-dev.ps1
#
# Étapes (5 + reseed optionnel) :
#   1. Termine les process node.exe (api/web/tsx) restés ouverts
#   2. Vérifie que docker compose tourne (postgres + keycloak + mailhog)
#   3. Rebuild les packages partagés (shared + ui) pour que les .d.ts soient à jour
#   4. Regen le client Prisma (au cas où le schema aurait changé entre 2 sessions)
#   5. (optionnel -Reseed) Applique les migrations + relance le seed dev
#   6. Lance `pnpm dev` (turbo orchestre api + web + watch des packages)
#
# Ctrl+C dans le terminal pour arrêter le stack après usage.

[CmdletBinding()]
param(
    [switch]$Reseed,
    [switch]$NoBuild,
    [switch]$NoDev
)

$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..')

Write-Host "`n=== MATA dev restart ===`n" -ForegroundColor Cyan

# ── 1. Kill node processes ─────────────────────────────────────────
Write-Host "[1/5] Terminating node.exe processes..." -ForegroundColor Yellow
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcs) {
    $count = ($nodeProcs | Measure-Object).Count
    $nodeProcs | Stop-Process -Force
    Write-Host "      $count process(es) killed" -ForegroundColor Green
    Start-Sleep -Milliseconds 800
} else {
    Write-Host "      no node process running" -ForegroundColor Gray
}

# ── 2. Docker compose check ────────────────────────────────────────
Write-Host "`n[2/5] Checking docker compose services..." -ForegroundColor Yellow
$services = docker compose ps --services --status running 2>$null
$needed = @('postgres', 'keycloak', 'keycloak-db', 'mailhog')
$missing = $needed | Where-Object { $services -notcontains $_ }
if ($missing) {
    Write-Host "      Starting: $($missing -join ', ')" -ForegroundColor Yellow
    docker compose up -d
    Write-Host "      Waiting 5s for services to be ready..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
} else {
    Write-Host "      OK (postgres, keycloak, keycloak-db, mailhog)" -ForegroundColor Green
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

# ── 5. Start dev ───────────────────────────────────────────────────
if ($NoDev) {
    Write-Host "`n[5/5] Skipped (-NoDev). Stack prête pour ``pnpm dev``." -ForegroundColor Gray
    return
}

Write-Host "`n[5/5] Starting dev servers (turbo)...`n" -ForegroundColor Yellow
Write-Host "  API ──────────── http://localhost:4000   /v1/health  /v1/zones" -ForegroundColor Cyan
Write-Host "  Web ──────────── http://localhost:3000   /auth/login" -ForegroundColor Cyan
Write-Host "  Keycloak admin ─ http://localhost:8080   admin / admin" -ForegroundColor Cyan
Write-Host "  Mailhog ──────── http://localhost:8025" -ForegroundColor Cyan
Write-Host "`n  Ctrl+C pour arrêter`n" -ForegroundColor Gray

pnpm dev
