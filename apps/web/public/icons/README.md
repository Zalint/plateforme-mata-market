# Icônes PWA MATA

Sources SVG conservées dans `src/`. Pour le Lot 0 le manifest utilise des
data-URI SVG (rendu correct sur Chrome / Edge / Safari récents). Les vrais
fichiers PNG `192.png`, `192-maskable.png`, `512.png`, `512-maskable.png`
seront générés au Lot 1 via `pnpm --filter @mata/web icons:generate` (script
à écrire en s'appuyant sur `sharp` ou `@resvg/resvg-js`).

Référence : ARCHITECTURE.md §4 « Manifest ».
