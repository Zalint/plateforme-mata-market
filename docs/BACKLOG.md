# BACKLOG — dette technique + reports inter-lots

> **À lire avant de démarrer un lot.** Cherche les entrées `[lot-X→lot-courant]`
> et traite-les ou explicite pourquoi tu les repousses encore.
>
> Référence : CLAUDE.md §F (Workflow agent).

## Format des entrées

```
## [lot-DECOUVERT→lot-CIBLE] titre court

- **Découvert** : Lot N (contexte / commit / PR)
- **Cible** : Lot M (le lot où on doit traiter)
- **Pourquoi reporté** : raison concrète (pas "manque de temps")
- **Fichiers** : chemin:ligne (cliquable depuis IDE)
- **Garde-fou actuel** : ce qui empêche le bug d'être nuisible aujourd'hui
- **Risque si non traité** : impact réel (sécurité, UX, dette qui s'accumule)
```

Les entrées **résolues** restent en bas du fichier dans `## Résolues` avec
le lot et la date de résolution, pour pouvoir tracer l'historique sans
polluer la liste active.

Convention : `grep -rn "TODO(lot-N)" .` dans le code renvoie aux endroits
exacts où ces dettes sont marquées en commentaire inline.

---

# En cours

## [lot-2→lot-9] Édition champs cosmétiques d'une offre validée

- **Découvert** : Lot 2 (décision figée plan d'attaque)
- **Cible** : Lot 9 durcissement UX (repoussée Lot 3 → Lot 9 le 2026-05-29)
- **Pourquoi reporté** : décision en début Lot 3 — le scope du Lot 3 est pur
  pricing. Mélanger l'édition cosmétique offre (préoccupation offers) avec
  les règles pricing ajouterait du scope sans bénéfice métier. Le workaround
  (suspend → recréer) reste utilisable. La race condition citée au Lot 2
  pourra être abordée au Lot 9 quand les orders (Lot 4) seront stables et
  qu'on aura une vraie politique de verrouillage.
- **Fichiers** : apps/api/src/modules/offers/offer-service.ts:152-156
  (refus 409 CONFLICT)
- **Garde-fou actuel** : producteur peut suspend → créer nouvelle offre.
- **Risque si non traité** : friction UX mineure pour le producteur.

## [lot-3→lot-9] Bouton "Historique" /admin/pricing désactivé

- **Découvert** : Lot 3 (page admin/pricing)
- **Cible** : Lot 9 durcissement UX
- **Pourquoi reporté** : l'historique des modifications d'une rule existe
  déjà dans `audit_log` (`pricing.rule.create` + `pricing.rule.update`).
  Ce qui manque c'est l'écran qui les liste : timeline `targetType='pricing_rule'`,
  diff oldValue/newValue. Hors scope MVP — `audit_log` reste consultable
  via Prisma Studio ou requête SQL en attendant.
- **Fichiers** : apps/web/app/(chromed)/admin/pricing/page.tsx (bouton disabled)
- **Garde-fou actuel** : audit_log écrit pour chaque create/update,
  consultable hors UI.
- **Risque si non traité** : friction admin pour traçabilité. Pas bloquant.

## [lot-2→lot-9] Note moyenne producteur (★ 4.8 dans mockup) absente

- **Découvert** : Lot 2 (le mockup affiche `★ 4.8`)
- **Cible** : Lot 9 (post-reviews, repoussée Lot 4 → Lot 9 le 2026-05-30)
- **Pourquoi reporté** : décision en début Lot 4 — il n'y a pas de reviews
  post-livraison au Lot 4 (les orders se terminent à `delivered`, pas de
  table reviews). Mettre un proxy basé sur le ratio livré/total tromperait
  les clients. Le placeholder UI reste, l'entrée se traite Lot 9 quand la
  feature reviews (post-livraison) sera spécifiée.
- **Fichiers** : packages/ui/src/offer-card.tsx (UI placeholder "—")
- **Garde-fou actuel** : aucun, juste placeholder.
- **Risque si non traité** : différence visible avec mockup, à expliquer.

## [lot-5→lot-9] Déployer migration `lot5_payments_part2` en release séparée prod

- **Découvert** : Lot 5 (migration deux temps payment_status TEXT → enum)
- **Cible** : Lot 9 (procédure prod)
- **Pourquoi reporté** : Pour la mise en prod du Lot 5, la migration `part2`
  (drop colonne TEXT + rename enum → `payment_status`) doit être déployée
  DANS UNE RELEASE DISTINCTE de `part1` (CLAUDE.md §G4 « DEUX déploiements »).
  En local dev/test elles s'enchaînent en séquence via `prisma migrate deploy`.
  En prod : `part1` au déploiement N (compatible avec le code N qui lit déjà
  la nouvelle colonne mais garde la TEXT comme fallback), puis `part2` au
  déploiement N+1 (drop TEXT) une fois le déploiement N validé stable.
- **Fichiers** : apps/api/prisma/migrations/20260530100000_lot5_payments_part1_add_enum/,
  apps/api/prisma/migrations/20260530100100_lot5_payments_part2_drop_text/
- **Garde-fou actuel** : pas encore en prod. Local : OK les deux migrations
  passent en séquence.
- **Risque si non traité** : déploiement prod direct des deux migrations
  ensemble = rollback impossible si bug applicatif post-déploiement N
  (la TEXT a déjà été droppée).

## [lot-5→lot-9] Config Render cron pour `process-payouts`

- **Découvert** : Lot 5 (job process-payouts livré sans config Render)
- **Cible** : Lot 9 (config infra Render)
- **Pourquoi reporté** : le job `apps/api/src/jobs/process-payouts.ts` est
  livré et invocable via `pnpm payouts:cron` (testé OK). La config Render
  Cron Job (schedule `0 6 * * *` UTC, même image Docker que l'API, command
  override) sera ajoutée avec les deux autres crons du Lot 9 (retry-outbox
  Lot 7, cleanup-expired-teleconsult Lot 6) dans un docs/DEPLOYMENT.md
  ou render.yaml unifié.
- **Fichiers** : apps/api/src/jobs/process-payouts.ts, apps/api/package.json
  (`payouts:cron` script), CRON_ACTOR_USER_ID env var optionnelle.
- **Garde-fou actuel** : MVP local, déclenchement manuel suffit. Idempotent
  par construction (`payout_items.order_item_id` UNIQUE).
- **Risque si non traité** : prod sans cron = reversements non déclenchés
  automatiquement, admin doit cliquer "Reverser (N)" manuellement chaque jour.

## [lot-6→lot-9] Config Render cron pour `cleanup-expired-teleconsult`

- **Découvert** : Lot 6 (job cleanup livré sans config Render)
- **Cible** : Lot 9 (config infra Render — même PR que process-payouts + retry-outbox)
- **Pourquoi reporté** : le job `apps/api/src/jobs/cleanup-expired-teleconsult.ts`
  est livré et invocable via `pnpm teleconsult:cleanup` (testé via les
  tests integration `expireOverdue` + `cleanupExpired`). La config Render
  Cron Job (schedule `*/5 * * * *` UTC, même image Docker, command override)
  sera mutualisée avec les deux autres crons (process-payouts, retry-outbox).
- **Fichiers** : apps/api/src/jobs/cleanup-expired-teleconsult.ts,
  apps/api/package.json (`teleconsult:cleanup` script).
- **Garde-fou actuel** : MVP local. Les sessions expirées sont quand même
  refusées au plugin auth (resolveActiveForTeleconsultant verifie expires_at),
  donc une session expirée ne peut pas continuer à agir même sans le cron.
  Le cron ne sert qu'à libérer les rows et le UI badge "Session active".
- **Risque si non traité** : prod sans cron = les sessions techniquement
  expirées restent `closed_at NULL` dans `teleconsult_sessions`, polluant
  les requêtes admin (filtre "active"). Pas de surface sécurité car le
  plugin auth bloque l'usage.

## [lot-6→lot-7] Outbox `teleconsult.action.performed` → push web + email

- **Découvert** : Lot 6 (event outbox émis à chaque action déléguée mais
  non encore consommé par n8n)
- **Cible** : Lot 7 (tournées + push + n8n)
- **Pourquoi reporté** : Lot 6 livre l'émission de l'event (cf.
  `teleconsult-plugin.ts` hook onResponse — chaque mutation 2xx avec
  `req.actingOnBehalfOf` insère une row `outbox_events` typée
  `teleconsult.action.performed`). Le dispatch vers n8n + push web producteur
  + email récap fin de session relèvent du Lot 7 (cron retry-outbox + n8n
  flows). En attendant, l'event est juste persistant, audit_log reste le
  canal principal de traçabilité.
- **Fichiers** : apps/api/src/modules/teleconsult/teleconsult-plugin.ts
  (hook onResponse), table `outbox_events`.
- **Garde-fou actuel** : audit_log capture déjà chaque action sensible avec
  `on_behalf_of_user_id` — le producteur peut consulter à tout moment.
  L'email récap fin de session viendra en bonus quand n8n sera câblé.
- **Risque si non traité** : pas de notification push temps réel pour le
  producteur. Acceptable au MVP (l'audit log reste consultable).

## [lot-5→lot-9] KPIs admin/payments calculés côté front

- **Découvert** : Lot 5 (page admin/payments)
- **Cible** : Lot 9 (durcissement perf + agrégats côté API)
- **Pourquoi reporté** : les KPIs « Encaissé mois / Commission MATA /
  Frais logistique » sont calculés à la volée côté front depuis la liste
  payments (avec approximation 10% commission et 5% frais — pas les vrais
  pricing_snapshots). Pour le MVP c'est acceptable (volume faible).
  En prod, calculer côté front sur 1000+ rows devient lent et imprécis :
  exposer une route `/v1/payments/kpis?period=month` côté API avec
  agrégation SQL (SUM des snapshot.commissionFcfa × quantity).
- **Fichiers** : apps/web/app/(chromed)/admin/payments/page.tsx (KpiTile
  calculs lignes 46-58)
- **Garde-fou actuel** : approximation 10%/5% acceptable visuellement,
  pas de décision financière basée dessus.
- **Risque si non traité** : drift visible entre KPI affiché et compta
  réelle quand pricing_rules varient par catégorie.

## [lot-5→lot-9] E2E Playwright complet checkout + admin payments

- **Découvert** : Lot 5 (E2E Puppeteer initialement prévu)
- **Cible** : Lot 9 (suite E2E Playwright complète — cf. ARCHITECTURE.md §10)
- **Pourquoi reporté** : les tests d'intégration testcontainers couvrent
  déjà le flow API critique (8 tests payments + 8 tests payouts, mock fetch
  Bictorys). Le test E2E browser (login Keycloak → catalogue → cart →
  bouton « Payer maintenant » → simul webhook → retour /payment/return →
  admin/payments voit la commande → admin déclenche reversement) demande
  une orchestration Playwright + un realm Keycloak de test peuplé. C'est
  un travail Lot 9 (cf. ARCHITECTURE.md §13 : « Lot 9 = Tests E2E
  Playwright complet »).
- **Fichiers** : à créer apps/web/e2e/payments-checkout.spec.ts (Lot 9)
- **Garde-fou actuel** : tests integration API couvrent le métier critique.
- **Risque si non traité** : régression UI checkout possible non détectée
  par les tests integration (ex: hook qui ne câble pas correctement
  paymentUrl).

## [lot-4→lot-9] Cron cleanup `idempotency_records` TTL 24h

- **Découvert** : Lot 4 (table idempotency_records)
- **Cible** : Lot 9 (cron jobs Render)
- **Pourquoi reporté** : la table grossit lentement (1 row par order créé).
  Pas critique au MVP. Le cron sera ajouté avec les autres crons Render
  (cleanup-expired-teleconsult, retry-outbox, process-payouts).
- **Fichiers** : apps/api/src/modules/orders/idempotency.ts (commentaire),
  apps/api/prisma/schema.prisma (model IdempotencyRecord, index createdAt)
- **Garde-fou actuel** : index `created_at` posé pour permettre un cron rapide.
- **Risque si non traité** : croissance lente (~30 rows/mois MVP), pas bloquant.

## [lot-2→lot-7] Coordonnées centroid_lat/lng des zones laissées NULL

- **Découvert** : Lot 2 (création table `zones`)
- **Cible** : Lot 7 (tournées de collecte → calcul distance haversine)
- **Pourquoi reporté** : pas d'usage métier au Lot 2. Saisir les
  coordonnées à la main pour 13 zones prend du temps inutile.
- **Fichiers** : apps/api/prisma/seeds/dev-seed.ts:60-72 (les `ZONES`)
- **Garde-fou actuel** : champs `Float?` nullable, code Lot 7 doit gérer
  le cas `null` avec fallback (ex: ignorer cette zone dans le routing).
- **Risque si non traité** : Lot 7 bloqué si on lance les tournées.

## [lot-2→lot-9] CSP `'unsafe-inline'` et `'unsafe-eval'` autorisés en dev

- **Découvert** : Lot 2 (test E2E manuel — DevTools console "Refused to
  execute inline script")
- **Cible** : Lot 9 durcissement
- **Pourquoi reporté** : Next 15 RSC streaming + React Refresh exigent
  ces directives en dev. Migration vers nonces Next demande un middleware
  Edge runtime avec injection du nonce sur chaque script tag — non
  triviale et non bloquante pour le MVP.
- **Fichiers** : apps/web/middleware.ts:50-58 (commentaire inline)
- **Garde-fou actuel** : override conditionnel `NODE_ENV !== 'production'`.
  En prod le CSP retombe sur `script-src 'self' 'wasm-unsafe-eval'` strict.
- **Risque si non traité** : si on déploie en prod sans valider que le
  bundle Next prod load correctement avec le CSP strict, white screen.
  À tester impérativement au Lot 9.

## [lot-2→lot-9] Règles a11y Biome désactivées

- **Découvert** : Lot 2 (étape Fix 5)
- **Cible** : Lot 9 durcissement UX/a11y
- **Pourquoi reporté** : fixer tous les `<label>` orphelins, convertir
  les `<div onClick>` en `<button>`, migrer vers `useId()` aurait gonflé
  le PR Lot 2 sans valeur métier visible.
- **Fichiers** : biome.json:80-95 (overrides `**/*.tsx`)
- **Règles off** :
  - `a11y/noLabelWithoutControl` — labels manuels reliés visuellement
  - `a11y/noStaticElementInteractions` — div conteneurs interactifs
  - `a11y/useKeyWithClickEvents` — pas de handlers clavier custom
  - `correctness/useUniqueElementIds` — ids statiques (vs `useId()`)
  - `suspicious/noAlert` — `alert()`/`confirm()` natifs MVP
- **Garde-fou actuel** : aucun (la dette est sur l'a11y elle-même).
- **Risque si non traité** : non-conformité accessibilité WCAG. Important
  pour le contexte Sénégal où certains producteurs ont des téléphones
  bas de gamme + lecteurs d'écran possibles.

## [lot-2→lot-9] `alert()`/`confirm()` natifs (vs toast/dialog system)

- **Découvert** : Lot 2 (étape Fix 4, /producer/sites archive + admin reveal)
- **Cible** : Lot 9
- **Pourquoi reporté** : pas de toast/dialog component dans `packages/ui`.
  Construire un système Headless UI Dialog + portail prend du temps.
- **Fichiers** : apps/web/app/(chromed)/producer/sites/page.tsx:34
  + apps/web/app/(chromed)/admin/producers/[userId]/page.tsx:43,51,61
  + apps/web/app/(chromed)/admin/offers/page.tsx:21
- **Garde-fou actuel** : règle `suspicious/noAlert` désactivée dans biome.
- **Risque si non traité** : UX inconsistante, mauvaise expérience mobile
  (les alerts natives mobile sont pénibles).

## [lot-2→lot-9] Migrations destructives à valider en deux temps

- **Découvert** : Lot 2 (rename `producer_id` → `producer_user_id`)
- **Cible** : Lot 9 (procédure prod)
- **Pourquoi reporté** : pas encore en prod, donc rename direct OK.
  CLAUDE.md §G4 impose deux temps pour les migrations destructives en prod.
- **Fichiers** : apps/api/prisma/migrations/20260529202110_lot2_rename_*/
- **Garde-fou actuel** : pas encore déployé.
- **Risque si non traité** : oubli au moment du Lot 9 → downtime au déploiement.

## [lot-2→lot-?] Édition d'un site existant (PATCH /v1/sites/:id)

- **Découvert** : Lot 2 (étape 4, bouton "Modifier" sur SiteCard est `disabled`)
- **Cible** : pas urgent, à activer dès qu'on touche la page sites
- **Pourquoi reporté** : la route API existe et marche, juste l'UI form
  edit pas faite (form create est inline, edit nécessiterait un mode
  `editingId` dans la page).
- **Fichiers** : apps/web/app/(chromed)/producer/sites/page.tsx:88
  ("À venir" disabled button) + apps/web/src/lib/api/hooks/use-sites.ts
  (`useUpdateSite` non câblé)
- **Garde-fou actuel** : producteur peut archive + créer un nouveau site.
- **Risque si non traité** : friction UX mineure.

## [lot-2→lot-6] Validation Cloudinary publicId côté API (avant attach)

- **Découvert** : Lot 2 (étape 6 Cloudinary)
- **Cible** : Lot 6 (déjà fait pour le reste) ou Lot 9
- **Pourquoi reporté** : on attache les `publicId[]` reçus du client sans
  vérifier via `cloudinary.api.resource` qu'ils existent vraiment et
  appartiennent au bon folder. Le folder est figé serveur (signature),
  donc un client malicieux ne peut PAS uploader hors folder, mais
  pourrait techniquement attacher un `publicId` inventé.
- **Fichiers** : apps/api/src/modules/offers/offer-service.ts:227-239
  (attachPhotos sans validation Cloudinary)
- **Garde-fou actuel** : front upload via signature serveur (folder figé),
  donc publicId valide en pratique.
- **Risque si non traité** : possible attaque où un producer attache des
  `publicId` qui n'existent pas → erreur lors de l'affichage côté front
  (image cassée). Pas de risque sécurité grave car le folder est privé.

## [lot-2→lot-?] Schemas Output exposent `displayName` partout

- **Découvert** : Lot 2 (Fix 1, enrichissement mappers)
- **Cible** : à voir au Lot 4 quand on aura les orders catalogue public guest
- **Pourquoi reporté** : `ProducerProfilePublic.displayName` est exposé
  sur des routes lues par tout JWT valide (catalogue), donc visible à un
  client_particulier. Pas un problème en soi mais à confirmer que c'est
  le comportement souhaité.
- **Fichiers** : packages/shared/src/schemas/producer.ts:120
- **Garde-fou actuel** : seul `displayName` (déjà public sur Keycloak), pas
  le `phone`/`email` réservés à `ProducerProfileAdmin`.
- **Risque si non traité** : aucun majeur. À documenter Lot 8 (guest)
  pour décider si guest catalog masque les noms.

---

# Résolues

## [lot-2→lot-3] Édition cosmétique offre validée — résolue 2026-05-29 (Lot 3)

Décision prise en début de Lot 3 : repoussée au Lot 9 (cf. entrée active
`[lot-2→lot-9]` ci-dessus). Reformulation explicite plutôt que double-traitement.

## [lot-2→lot-4] OfferStatus `reserved` et `sold` — résolue 2026-05-30 (Lot 4)

Les deux valeurs ont été ajoutées à l'enum `OfferStatus` (cf. migration
`lot4_orders` + commentaire schema.prisma). Transitions automatiques en
service `orderService` :
- `validated → reserved` quand `quantityReserved === quantity` après create
- `reserved → validated` quand un cancel libère assez de stock
- `sold` réservé Lot 5/9 (transition manuelle post-livraison définitive,
  pas encore déclenchée automatiquement).

L'enum-coherence test couvre les 7 valeurs OfferStatus.

## [lot-2→lot-4] Note moyenne producteur — repoussée Lot 9 (Lot 4)

Décision : pas de reviews au Lot 4, repoussée vers Lot 9 (cf. entrée active
`[lot-2→lot-9]` Note moyenne producteur).

## [lot-4→lot-5] `orders.payment_status` stub TEXT → enum PaymentStatus — résolue 2026-05-30 (Lot 5)

Migration en DEUX TEMPS livrée :
- `20260530100000_lot5_payments_part1_add_enum` : crée enum `payment_status`,
  ajoute colonne `payment_status_v2`, backfill depuis TEXT, NOT NULL + DEFAULT.
  Garde la TEXT en place pour rollback applicatif possible.
- `20260530100100_lot5_payments_part2_drop_text` : drop TEXT + rename v2 → `payment_status`.
  Pour la prod, déployer dans une release distincte (entrée backlog
  `[lot-5→lot-9]` Déployer migration `lot5_payments_part2` en release séparée).

Le schema.prisma reflète l'état final post-part2 : `paymentStatus PaymentStatus
@default(pending) @map("payment_status")`. Test enum-coherence couvre les 4 valeurs
(`pending`, `paid`, `refunded`, `disputed`). Lecture/écriture côté code uniformément
via le type enum Prisma. CHECK constraint Lot 4 supprimée par DROP TEXT.

## [lot-4 fix] Seed dev idempotent + rules pricing par défaut — 2026-05-30 (Lot 4)

Deux bugs du `dev-seed.ts` fixés pendant le test E2E :

1. **Lookups cassés après alignement UUIDs Keycloak** : la Map `userIdByKeycloakStub`
   était indexée par les UUIDs (`6e426967-...`) depuis les Lots 3-4, mais les
   lookups utilisaient encore les anciens stubs (`'dev:producer:mor-diop'`).
   Fix : alias `slug` local stable indépendant du keycloakId
   (`mor-diop`, `aissatou-sow`, `la-calebasse`) + Map renommée `userIdBySlug`.

2. **FK RESTRICT bloquait le delete des offres** quand un order_item les
   référençait. Fix : wipe en cascade `order_items → orders → pricing_snapshots`
   avant de delete les offres de Mor. PROD reste safe (seed prod séparé).

3. **6 rules pricing par défaut** (1 par catégorie, model commission_pct 10%
   + safety 3% + collecte 120 + livraison 200 + stockage 50) ajoutées au seed.
   POST /v1/orders trouve toujours une rule active sans bootstrap manuel via UI.

Re-runs successifs vérifiés idempotents.

---

# Notes opérationnelles

## Setup local Keycloak

Si la DB Keycloak est wipée (`docker compose down -v`), le realm `mata` doit
être ré-importé via l'UI admin :

1. http://localhost:8081/admin/master/console/ (login `admin`/`admin`)
2. Create Realm → Browse → `infra/keycloak/realm-export.json`

Depuis le Lot 3, le realm-export embarque deux users avec UUID stables
et password `mata` (cf. `infra/keycloak/realm-export.json` § `users`) :

| Username       | Role     | UUID Keycloak                          |
|----------------|----------|----------------------------------------|
| `mor.diop`     | producer | `6e426967-1bae-4280-8b7d-6597a020416c` |
| `aissatou.sow` | admin    | `10a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6` |

Les mêmes UUIDs sont câblés en dur dans `apps/api/prisma/seeds/dev-seed.ts`,
donc un wipe complet (`docker compose down -v` + `pnpm db:seed` + re-import
realm) restore un état fonctionnel sans manipulation manuelle SQL.

Pour ajouter un user à postériori sans wipe (sans perdre l'UUID), passer
par l'API admin avec `POST /admin/realms/mata/partialImport` et un body
`{ "ifResourceExists": "OVERWRITE", "users": [{...avec id explicite...}] }`.
Le POST direct sur `/users` ignore l'`id` fourni — partialImport le respecte.

## Port Keycloak sur cette machine

EnterpriseDB squatte le port 8080 sur le poste de dev → Keycloak mappé sur
`8081:8080` dans docker-compose.yml. Si tu démarres MATA sur une autre
machine sans EDB, repasse à `8080:8080` et aligne :
- `apps/api/.env` : `KEYCLOAK_URL=http://localhost:8080`
- `apps/web/.env.local` : `KEYCLOAK_URL` + `NEXT_PUBLIC_KEYCLOAK_URL`
