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

## [pivot-tc→lot-?] Ajustement de prix : part producteur non recalculée

- **Découvert** : pivot téléconseiller, Lot D (`POST /v1/orders/:id/adjust-price`, commit 716fe9a).
- **Cible** : ultérieur — quand le reversement devra refléter un prix renégocié.
- **Pourquoi reporté** : l'ajustement de prix (Lot D) ne touche QUE le total client
  (`adjustedTotalFcfa`), pas les `pricing_snapshots` (immuables, §G4). La part producteur
  (`producerShare`) et la commission MATA restent calculées sur les snapshots d'origine.
  Donc si le téléconseiller renégocie le prix à la hausse/baisse avec le producteur, le
  **reversement** producteur ne bouge pas — seul le client paie le nouveau total. Recalculer
  proprement la répartition (nouvelle part producteur + commission) sans casser l'immuabilité
  des snapshots demande un modèle d'« avenant de pricing » non spécifié au MVP.
- **Fichiers** : apps/api/src/modules/orders/order-service.ts (`adjustPriceInternal`),
  payment-service.ts (`effectiveTotalFcfa = adjustedTotalFcfa ?? totalFcfa` côté encaissement),
  payouts (calcul sur snapshots inchangé).
- **Garde-fou actuel** : l'ajustement est refusé après paiement (`paymentStatus='paid'` → 409),
  donc pas d'incohérence sur une commande déjà encaissée. Le cas couvert au MVP = renégociation
  AVANT paiement, où seul le total client importe (paiement à la livraison ou en ligne).
- **Risque si non traité** : si MATA veut répercuter une renégociation sur la part producteur,
  il faudra le faire à la main (ou via un avenant). Pas bloquant tant que l'ajustement sert à
  corriger le prix CLIENT (cas d'usage validé : « le producteur a annoncé un nouveau prix »).

## [lotcat→lotcat+1] Catégories produit data-driven — Lot 2 (frontend) + Lot 3 (cleanup)

- **Découvert** : lotcat (passage de l'enum `ProductCategory` à une table `product_categories` gérée par l'admin).
- **Cible** : lot suivant (Lot 2 frontend, puis Lot 3 cleanup).
- **Fait (Lot 1, backend)** : table `product_categories` + migration `20260531230244_lotcat_categories_part1` (création table + seed 6 catégories + colonne `category_slug` FK sur `offers`/`pricing_rules` + backfill + bascule de la CHECK XOR `pricing_rules` sur `category_slug`) ; module `categories` (service + routes `GET /v1/categories`, `GET/POST/PATCH /v1/admin/categories`) ; `ProductCategorySchema` = slug (format Zod + existence via FK/service) ; `assertCategoryActive` à la création/édition d'offre ; seed + tests d'intégration adaptés ; `ProductCategory` (TS) élargi à `string`, `CATEGORY_EMOJI`/`CATEGORY_LABEL_FR` en `Record<string,string>` fallback.
- **Fait (Lot 2, frontend)** : endpoint guest `GET /v1/guest/categories` (+ test) ; hooks `useGuestCategories` / `useCategories` / `useAdminCategories` / `useCreateCategory` / `useUpdateCategory` ; listes dynamiques (`page.tsx`, `client/catalog`, `producer/offers/new`) ; emoji/label depuis l'API (prop `emoji` sur `ProductCard`/`OfferCard` + fallbacks) ; écran **Admin → Catégories** (CRUD : créer, éditer label/emoji/ordre, activer/désactiver) + lien sidebar.
- **À faire — Lot 3 (cleanup)** : 2e migration (release 2) qui SUPPRIME la colonne enum `category` de `offers`/`pricing_rules` + le type Postgres `product_category` + l'index `pricing_rules_category_valid_from_idx` ; retirer les fallbacks `categorySlug ?? category` (mappers offer/pricing, pricing-service/snapshot).
- **Garde-fou actuel** : colonne enum `category` conservée (nullable) + coalescence `categorySlug ?? category` partout → aucune offre/règle existante cassée.
- **Risque si non traité** : double source (enum + slug) qui traîne jusqu'au Lot 3 (cleanup).
- **Validation** : typecheck (api+web+shared) + biome OK ; unit shared 72/72 + api 88/88 ; **suite d'intégration 19 fichiers / 125 tests verte** (testcontainers). Note Windows : testcontainers exige `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine` (+ `TESTCONTAINERS_RYUK_DISABLED=true`) car le pipe Docker Desktop n'est pas celui par défaut.
- **Opérationnel** : toute nouvelle catégorie exige une **règle de pricing** (Admin → Pricing, scope category) avant qu'un client puisse commander, sinon `findActiveRule` → `NOT_FOUND`.

## [lot-9→lot-?] Délégation téléconseil : course au rechargement d'une page producteur

- **Découvert** : Lot 9 (test Puppeteer du flux « Assister un producteur » → « Offres de Mor »).
- **Pourquoi reporté** : la sessionId téléconseil est stockée EN MÉMOIRE only (sécurité,
  ne survit pas au refresh). Sur un **rechargement complet** d'une page producteur
  (`/producer/offers`, `/producer/sites`) pendant une session, la requête `/v1/producers/me`
  part AVANT que `useActiveTeleconsultSession` ait re-rempli le singleton → pas d'en-tête
  `X-Teleconsult-Session-Id` → écran « créez votre profil ». Corrigé pour la nav INTERNE
  (liens `<Link>` client-side qui préservent le singleton), mais un **F5 / accès URL directe**
  sur ces pages reproduit la course.
- **Fichiers** : apps/web/app/(chromed)/admin/teleconseil/page.tsx (liens), hooks producteur.
- **Garde-fou actuel** : le flux normal (téléconseil → liens) marche ; après F5, re-cliquer
  le lien depuis la page téléconseil rétablit le contexte.
- **Risque si non traité** : confusion UX si le conseiller rafraîchit une page producteur en
  session. Fix propre : gater les requêtes des pages producteur sur la résolution de la
  session active (quand rôle = teleconsultant/admin) avant de fire `/me`.

## [lot-9→lot-?] Keycloak Admin API en prod (service account + reseed realm)

- **Découvert** : Lot 9 (onboarding producteur/téléconseiller + création de comptes par admin via Keycloak Admin API).
- **Cible** : déploiement prod (Render).
- **Pourquoi reporté** : en local le service account `mata-admin-bootstrap` a reçu `manage-users` + `view-realm` (réalisé EN LIVE via l'API master admin ; le `realm-export.json` est aussi mis à jour mais ne s'applique qu'à un **ré-import** du realm — un volume Keycloak déjà initialisé ne ré-importe pas).
- **Fichiers** : `infra/keycloak/realm-export.json`, `apps/api/src/lib/keycloak-admin.ts`, `apps/api/.env`.
- **Garde-fou actuel** : `requireKeycloakAdminConfig()` refuse l'onboarding si les vars manquent (message explicite, pas de 500 silencieux).
- **Risque si non traité** : en prod, sans `KEYCLOAK_ADMIN_CLIENT_SECRET` réel + service account correctement doté (`manage-users`, `view-realm`), toute création de compte échoue (EXTERNAL_FAILURE). À provisionner dans le dashboard Render + vérifier l'import realm prod.

## [lot-9→lot-?] Pas de self-signup public (décision V1)

- **Découvert** : Lot 9 (arbitrage inscription).
- **Pourquoi reporté** : décision produit — les producteurs sont onboardés par le téléconseiller, les autres comptes par l'admin, les clients peuvent commander en **invité** sans compte. Pas d'écran d'inscription public.
- **Risque si non traité** : aucun à court terme. Si on veut du self-service client plus tard : soit registration native Keycloak, soit écran custom (déjà étudié).

## [lot-9→lot-?] Pas de "réinitialiser le mot de passe" (compte créé par le staff)

- **Découvert** : Lot 9 (mot de passe temporaire affiché une seule fois).
- **Pourquoi reporté** : MVP — si le mdp temporaire est perdu avant 1re connexion, l'admin doit le réinitialiser directement dans la console Keycloak.
- **Risque si non traité** : friction support léger. Prévoir un bouton "régénérer le mot de passe" (Keycloak Admin API `reset-password`) si le besoin se confirme.

## [lot-9→lot-?] Différenciation client_pro / client_particulier non implémentée

- **Découvert** : Lot 9.
- **Pourquoi reporté** : décision "on laisse tel quel". Les deux rôles ont aujourd'hui exactement les mêmes droits/parcours/pricing ; le rôle distinct est un marqueur de segmentation.
- **Risque si non traité** : aucun. Évolution future possible : pricing pro / facturation (TVA, NINEA) / conditions de paiement.

## [lot-2→lot-?] Édition champs cosmétiques d'une offre validée

- **Découvert** : Lot 2 (décision figée plan d'attaque)
- **Cible** : repoussée Lot 9 → ultérieur le 2026-05-31 (besoin d'une politique
  de verrouillage non spécifiée)
- **Pourquoi reporté** : revue au Lot 9 — autoriser l'édition d'une offre déjà
  `validated`/`reserved` rouvre la race condition citée au Lot 2 (un champ
  cosmétique modifié pendant qu'un order se crée sur le `pricing_snapshot`).
  La résoudre proprement exige une politique de verrouillage (quels champs sont
  éditables après validation, et sous quelle transaction) — décision produit
  non tranchée, hors du périmètre durcissement du Lot 9. Le workaround
  (suspend → recréer) reste utilisable et sûr.
- **Fichiers** : apps/api/src/modules/offers/offer-service.ts:152-156
  (refus 409 CONFLICT)
- **Garde-fou actuel** : producteur peut suspend → créer nouvelle offre.
- **Risque si non traité** : friction UX mineure pour le producteur.

## [lot-3→lot-?] Bouton "Historique" /admin/pricing désactivé

- **Découvert** : Lot 3 (page admin/pricing)
- **Cible** : repoussée Lot 9 → ultérieur le 2026-05-31 (écran admin dédié,
  hors slice durcissement)
- **Pourquoi reporté** : l'historique des modifications d'une rule existe
  déjà dans `audit_log` (`pricing.rule.create` + `pricing.rule.update`).
  Ce qui manque c'est l'écran qui les liste : timeline `targetType='pricing_rule'`,
  diff oldValue/newValue. Hors scope MVP — `audit_log` reste consultable
  via Prisma Studio ou requête SQL en attendant.
- **Fichiers** : apps/web/app/(chromed)/admin/pricing/page.tsx (bouton disabled)
- **Garde-fou actuel** : audit_log écrit pour chaque create/update,
  consultable hors UI.
- **Risque si non traité** : friction admin pour traçabilité. Pas bloquant.

## [lot-9→lot-?] Note producteur : affichage catalogue + notation invité

- **Découvert** : Lot 9 (système de notation livré — voir Résolues)
- **Cible** : ultérieur (UX catalogue + parcours invité)
- **Pourquoi reporté** : le système de notation existe (table `producer_ratings`,
  endpoint, notation client post-livraison, moyenne exposée + colonne admin).
  Restent deux compléments non bloquants :
  1. afficher la moyenne (★) sur la carte catalogue (`ProductCard`/`OfferCard`)
     — aujourd'hui pas de note affichée côté client/guest ;
  2. permettre la notation par un **invité** (pas de session → ownership par
     orderId + téléphone à concevoir).
- **Fichiers** : packages/ui/src/product-card.tsx (pas de ★), apps/api guest.
- **Garde-fou actuel** : la note moyenne est déjà visible côté **admin**
  (liste + détail Producteurs) ; le besoin métier principal est couvert.
- **Risque si non traité** : léger écart mockup (★ catalogue), invités non notés.

## [lot-7→lot-?] E2E browser push web réel (souscription navigateur)

- **Découvert** : Lot 7 (notifications push web livrées + testées côté API)
- **Cible** : repoussée Lot 9 → ultérieur le 2026-05-30 (3 blockers techniques
  confirmés, cf. ci-dessous — un E2E déterministe n'est PAS faisable contre la
  stack dev actuelle sans infra push supplémentaire)
- **Pourquoi reporté** : tentative au Lot 9 d'écrire `push-subscription.spec.ts`
  contre la stack full-stack (`playwright.fullstack.config.ts`). Trois blockers
  rendent une souscription push réelle non déterministe (CLAUDE.md §G6 « tests
  flaky interdits » + §D5 « jamais de test creux ») :
  1. **Pas de Service Worker en dev** : `next.config.mjs:14` désactive serwist
     (`disable: NODE_ENV === 'development'`) et la config full-stack lance
     `pnpm --filter @mata/web dev`. Donc `navigator.serviceWorker.ready` ne
     résout jamais → `subscribeToPush()` (web-push-client.ts) ne peut pas avancer.
  2. **Pas de service push dans Chromium headless** : `PushManager.subscribe()`
     exige un endpoint FCM réel (externe). Aucun en local → non déterministe et
     dépendance externe interdite.
  3. **Le prompt ne se monte pas** : `NotificationPermissionPrompt` n'est rendu
     que si `pickups.length > 0` (producer/pickups/page.tsx:46) ET
     `Notification.permission === 'default'` ; or le `dev-seed.ts` ne crée AUCUNE
     tournée pour mor.diop, et pré-accorder la permission via Playwright bascule
     `permission` à `granted` → le prompt disparaît (anti-nag voulu).
- **Prérequis pour le faire proprement (ultérieur)** : build web PROD (SW
  serwist actif) + un endpoint push mocké (ou Chrome-for-Testing avec service
  push de test) + une tournée seedée pour mor.diop. Travail conséquent, hors
  slice E2E du Lot 9.
- **Fichiers** : non créé (push-subscription.spec.ts). web-push-client.ts,
  notification-permission-prompt.tsx, next.config.mjs:14.
- **Garde-fou actuel** : service + déclenchement couverts par tests integration
  (`notifications-flow` : subscribe/unsubscribe/preferences/sendToUser ;
  `pickup-flow` vérifie l'appel `sendToUser`) ; `sendToUser` ne throw jamais
  (hors chemin critique). Le contrat serveur (POST/DELETE
  /v1/notifications/push/subscribe + Zod) est donc verrouillé.
- **Risque si non traité** : régression possible dans le flux navigateur
  (permission/SW/souscription) non détectée par les tests integration API.

## [lot-9→lot-?] Suite E2E full-stack non câblée en CI

- **Découvert** : Lot 9 (création `playwright.fullstack.config.ts` +
  `global-setup.ts` + `payments-checkout.spec.ts`)
- **Cible** : ultérieur (durcissement CI)
- **Pourquoi reporté** : le job e2e GitHub Actions garde le smoke léger
  (`playwright.config.ts`, `pnpm start`). Câbler la suite full-stack en CI
  impose Postgres + Keycloak 26 + seed + mock Bictorys + 3 dev servers dans le
  runner — lourd et lent. La suite est conçue LOCAL-ONLY (les deux configs sont
  distinctes ; le smoke ignore `**/fullstack/**`).
- **Fichiers** : apps/web/playwright.fullstack.config.ts, .github/workflows/*.
- **Garde-fou actuel** : la suite full-stack tourne en local sur demande
  (`pnpm --filter @mata/web test:e2e:fullstack`) ; le métier critique paiement
  reste couvert en CI par les tests integration testcontainers.
- **Risque si non traité** : une régression UI checkout n'est pas attrapée par
  la CI (seulement au run local manuel).

---

# Résolues

## [pivot-tc] Pivot téléconseiller : cycle 4 états + producteur masqué + self-assignation + paiement déféré + ajustement prix + notif — résolue 2026-06-02

Refonte du flux commande autour du téléconseiller (TC), en 6 lots livrés et poussés
sur `development` :

- **Lot 0 — cycle 4 états** (commit a7f93a6) : `ORDER_TRANSITIONS` simplifié à
  `created → confirmed → delivering → delivered` (+ `cancelled` jusqu'en livraison).
  Les tournées (`pickups`) sont **découplées** du statut commande (plus aucune
  transition `collecting/collected/stored` pilotée par `pickup-service`). Les 3
  valeurs d'enum orphelines sont conservées en base (pas de migration destructive,
  §G4/§D10) ; nettoyage enum possible ultérieurement.
- **Lot A — producteur masqué** (commit b75f61d) : le client (pro/particulier) ne
  voit JAMAIS l'identité producteur. Masquage **côté serveur par rôle** (`showProducer`
  dans catalog + orders mappers ; `canSeeProducer`/`showProducerFor` = staff + producteur
  uniquement). Le client note désormais **la commande** (note interne répartie sur chaque
  producteur, commit a47ed58) sans choisir ni voir le producteur.
- **Lot B — self-assignation** (commit 4b50e6e) : une commande est visible par TOUS les
  TC ; chacun se l'assigne (`claim`, compare-and-swap) / la relâche (`release`, assigné ou
  admin). Migration `order_self_assignment` (assignedTeleconsultantUserId + assignedAt).
  Audit `order.assign`/`order.unassign`.
- **Lot C — confirmation TC + paiement déféré** (commit 7f0e1d8) : garde-fou confirmation
  (un TC ne confirme pas une commande assignée à un AUTRE TC) ; **paiement après confirmation
  OU à la livraison** (gate `delivering` si `online` non payé). Le webhook Bictorys branche
  invité (created→confirm) vs authentifié (confirmed→paid only).
- **Lot D — ajustement de prix audité** (commit 716fe9a) : le TC ajuste le total client
  (`adjustedTotalFcfa` + motif), **snapshots et total d'origine préservés** (immuables).
  Refusé après paiement. Audit `order.price_adjust`. Limite connue (part producteur non
  recalculée) suivie dans l'entrée active `[pivot-tc→lot-?]`.
- **Lot E — notification client simple** (ce commit) : trace « client contacté »
  (`clientNotifiedAt` + audit `order.notify_client`) ; le staff voit le téléphone client
  (`showContact`, masqué au reste) ; UI admin avec liens **WhatsApp** (`wa.me`) + **Appeler**
  (`tel:`) qui marquent la commande notifiée. Solution volontairement simple (pas d'envoi
  automatisé) conforme à la demande « une solution simple au début ».

**Validation finale** : typecheck (api+web+shared) + biome OK ; unit shared 73/73 + api
90/90 ; **intégration 21 fichiers / 155 tests verts** (testcontainers). Note : 2 tests unit
`order.test.ts` (ORDER_TRANSITIONS) hérités de l'ancien cycle ont été corrigés au cycle 4
états (cf. entrée déc. ci-dessous).

## [tech] Tests unit ORDER_TRANSITIONS hérités de l'ancien cycle — résolue 2026-06-02

Découvert en lançant la suite unit `@mata/shared` pendant le Lot E : deux tests de
`packages/shared/src/schemas/order.test.ts` (« cycle nominal complet » et « cancel
possible depuis created et confirmed seulement ») asseyaient encore l'ANCIEN cycle
(`created → confirmed → collecting → collected → stored → delivering → delivered`) — Lot 0
l'avait réduit à 4 états sans mettre à jour cette suite unit (seules les intégrations
l'avaient été). Corrigés au cycle réel : cycle nominal `created → confirmed → delivering →
delivered`, nouveau test « statuts orphelins sans transition sortante », et « cancel possible
jusqu'en livraison (created, confirmed, delivering) ». Aucun test supprimé/skippé (§D5/§G6).

## [pivot-tc] Commande multi-tournées débloquée par le découplage — résolue 2026-06-02

L'entrée active `[lot-9→lot-?] Une commande répartie sur plusieurs tournées` est levée
par le **découplage** du Lot 0. Avant : `createPickup` faisait passer la commande en
`collecting`, donc une 2e tournée pour d'autres items de la même commande était refusée
(statut ≠ `confirmed`). Après Lot 0, `pickup-service` ne transitionne plus la commande :
elle **reste `confirmed`** tant que le TC/admin ne la passe pas en `delivering`. Plusieurs
tournées peuvent donc collecter les items d'une même commande sans blocage de statut.
`createPickup` exige toujours `order.status === 'confirmed'` par item (garde-fou stock
réservé), mais ce n'est plus exclusif. Fichier : apps/api/src/modules/pickups/pickup-service.ts:81.

## [users] Orphelins Keycloak + message de conflit lisible — résolue 2026-06-01

Créer un compte (admin → utilisateur) avec un téléphone déjà provisionné renvoyait
un `409` brut (« ApiError: 409 POST /v1/admin/users ») au lieu d'un message clair,
et un **reseed** (qui vide la base applicative mais PAS Keycloak) laissait des
comptes KC **orphelins** (sans ligne `users`) qui bloquaient toute recréation par
téléphone.

**Correctifs :**
1. **Anti-orphelin (cause racine)** : `keycloakAdmin.createUser` ADOPTE désormais un
   compte KC existant sur `409` (reset mdp + réactivation + ré-assignation rôle) au
   lieu d'échouer. Les deux appelants (`user-service`, `producer-service`) vérifient
   la DB en amont → un 409 KC = forcément un orphelin → réutilisé. Idempotent : un
   reseed ne bloque plus rien, l'orphelin est ré-absorbé. Pas de suppression d'un
   compte adopté (rollback delete uniquement si on vient de créer).
   Test unitaire `keycloak-admin.test.ts` (httpFetch + env mockés) : 201 → création,
   409 → adoption (reset mdp, pas de delete).
2. **Message lisible** : `ApiError.message` (http-client) reprend le message métier
   de l'API (`body.message`) au lieu du libellé technique « 409 POST … » → bénéficie
   à TOUT le frontend. Messages backend unifiés et sans jargon : « Ce numéro de
   téléphone est déjà utilisé par un compte. »
3. **Plus d'overlay** : page `users/new` passe de `mutateAsync` à `mutate` + `onSuccess`
   → l'erreur est captée par TanStack (affichée inline), sans rejection non gérée.

- **Fichiers** : keycloak-admin.ts (+ test), http-client.ts, user-service.ts,
  admin/users/new/page.tsx.
4. **Purge au reseed (cause amont)** : `dev-seed.ts` supprime en fin de seed les
   comptes Keycloak orphelins — username = téléphone (`+221…`, provisionnés via le
   flux admin/staff) absents de la base. Ne touche jamais aux users du realm-export
   (`mor.diop`…) ni aux service-accounts. Best-effort (KC absent/erreur → skip, le
   seed ne casse pas). → les orphelins ne s'accumulent plus.

- **Fichiers** : keycloak-admin.ts (+ test), http-client.ts, user-service.ts,
  admin/users/new/page.tsx, prisma/seeds/dev-seed.ts.
- **Validation** : typecheck + biome (304) ; unit keycloak-admin 2/2 ; intégration
  user-create 4/4 ; démo live (adoption de `+221773929671` → compte recréé). La purge
  au reseed se vérifie au prochain `pnpm dev:up:reseed`.

## [assignments] Portée de modération producteur ↔ téléconseiller — résolue 2026-06-01

Permettre d'affecter des producteurs à un téléconseiller pour borner sa **modération**
(à 100 producteurs, répartir entre téléconseillers).

**Modèle retenu** (après itération avec Saliou) : le mapping borde la MODÉRATION,
PAS la délégation.
- Modération (`valider/refuser/demander corrections/retirer/restaurer/suspendre/réactiver`)
  → un téléconseiller agit comme l'admin **mais uniquement sur ses producteurs affectés**.
  3 états : `allProducers=true` → tout ; sous-ensemble coché → ceux-là ; rien (défaut) → AUCUNE offre.
  La file `/admin/offers` est filtrée ; une action hors périmètre → 403 « …pas affecté ».
- Délégation (assister via code) → **ouverte** : n'importe quel producteur délègue à
  n'importe quel téléconseiller (inchangé). Producteur self-service (submit/withdraw/archive)
  intact.

**Backend (Lot 1)** : tables `teleconsultant_assignments` (M:N) + `teleconsultant_scope`
(`all_producers`), migration `20260601141644_teleconsultant_assignments` ; module
`assignments` (service + audit `teleconsultant.assignment.set` + helpers
`assertModeratorForProducer` / `scopeOfferWhereForModerator`) ; câblage offer-routes
(file + 7 actions) ; routes admin `GET /v1/assignments/context`,
`GET`/`PUT /v1/assignments/:teleconsultantUserId` ; seed Ibrahima `allProducers=true`
(préserve le dev). Tests : `moderation-scope.integration.test.ts` (6) + maj
`offer-routes-auth` (portée globale).

**Frontend (Lot 2)** : écran admin **« Affectations »** (`/admin/assignments`, lien sidebar) —
sélection d'un téléconseiller, toggle « Tous les producteurs » ou checklist (recherche +
filtre zone + overlap M:N « aussi : … »), avertissement « aucun = ne voit rien ».
Hooks `useAssignmentContext` / `useUpdateAssignmentScope`. Démo Puppeteer : round-trip
PUT OK (« Modère : 1 producteur »).

**Validation** : typecheck (api+web+shared) + biome (303 fichiers) verts ; intégration
offres+orders+assignments 31/31.

## [offers] Statut `withdrawn` (retrait MATA) + déclencheur `sold` + suspend admin — résolue 2026-06-01

Trois manques du cycle de vie d'offre comblés :

1. **`withdrawn` (« Retirée par MATA »)** : retrait unilatéral admin/téléconseiller,
   distinct de `suspended` (que le producteur peut lever lui-même). VERROU : seul
   MATA pose (`validated|pending|changes_requested|suspended → withdrawn`) ET défait
   (`withdrawn → draft`, rend la main au producteur). Motif facultatif stocké dans
   `rejectionReason`, affiché au producteur en lecture seule.
2. **`sold` enfin déclenché** : à la transition order `delivered`, une offre `reserved`
   dont toutes les commandes la référençant sont livrées (donc non annulables) bascule
   `reserved → sold` (terminal, retrait catalogue). Comblait un sous-trou Lot 4 (le
   statut existait mais n'était jamais posé). Audit `offer.sold`.
3. **Suspend côté admin** : il n'existait AUCUN bouton UI admin pour suspendre/retirer
   une offre validée (la fiche `/producer/offers/[id]` est lecture seule pour l'admin,
   et `/admin/offers` n'avait d'actions que sur `pending`). Ajout des boutons
   Suspendre/Réactiver/Retirer/Restaurer dans `/admin/offers`.
4. **Politique de rôles harmonisée** : `suspend`/`reactivate` étaient en `assertOwnership`
   pur → un téléconseiller ne pouvait pas suspendre une offre arbitraire (403) alors qu'il
   peut valider/refuser/retirer (modération). Aligné : suspend/reactivate = **propriétaire
   (producteur self-service) OU modération (admin/téléconseiller)** — on garde le producteur
   et on ajoute le téléconseiller. `submit`/`withdraw`/`archive` restent en `assertOwnership`
   (actes du producteur / délégation, pas de la modération MATA — un brouillon ne se publie
   pas sans le consentement du producteur). Couvert par `offer-routes-auth.integration.test.ts`
   (téléconseiller 200, producteur 200, client 403).

- **Fichiers** : schema.prisma (enum `withdrawn` + migration `20260601131127_add_offer_status_withdrawn`),
  enums.ts (+ label), offer.ts (Zod retire/restore), offer-service.ts (`retire`/`restore` +
  runTransition), audit-service.ts (`offer.retire`/`offer.restore`/`offer.sold`),
  offer-routes.ts (routes admin-only), order-service.ts (déclencheur sold), use-offers.ts
  (hooks), admin/offers/page.tsx (boutons), producer/offers/[id]/page.tsx (bandeau + lecture
  seule), producer/offers/page.tsx (filtre), offer-card.tsx (STATUS_TONE complété).
- **Validation** : typecheck (api+web+shared) + biome (fichiers touchés) OK ; intégration
  offers 9/9 + orders 13/13 verte (testcontainers, dont 3 nouveaux tests : sold complet,
  partiel sans sold, retire/restore + verrou). `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine`.
- **Note** : `STATUS_TONE` (offer-card.tsx) était incomplet depuis l'ajout de
  `changes_requested`/`expired`/`archived` (dette silencieuse) — complété ici avec ces trois
  + `withdrawn`.

## [tech] Formatage Biome KO sur 4 pages non liées (préexistant) — découverte 2026-06-01

- **Découvert** : 2026-06-01 (run `pnpm biome check .` pendant le lot offers withdrawn/sold).
- **Fichiers** : apps/web/app/(chromed)/admin/producers/new/page.tsx,
  admin/users/new/page.tsx, client/home/page.tsx, producer/home/page.tsx — `<KpiCard ... />`
  sur une ligne que Biome veut éclater multi-lignes (format only, pas de bug logique).
- **Garde-fou actuel** : aucun impact runtime ; uniquement `biome check .` qui sort en erreur.
- **Risque si non traité** : `pnpm biome check .` (et la CI) reste rouge → masque de vraies
  régressions de format futures. Fix trivial : `pnpm biome check --write` sur ces 4 fichiers
  (laissé hors de ce lot par discipline de périmètre §E4 — non lié au cycle de vie d'offre).

## [seed fix] Wipe seed : `pickup_items` bloquaient le DELETE `order_items` — résolue 2026-05-31

Découvert en enrichissant `dev-seed.ts` (ajout de 5 producteurs + commandes
livrées/avis pour la vue admin). Le couplage commande↔tournée (commit 346a288)
a ajouté une FK `pickup_items.order_item_id` en `onDelete: Restrict` ; or le
wipe idempotent du seed ne supprimait pas les `pickup_items` avant les
`order_items` → `23001` dès qu'une tournée existait en base. Fix : le wipe
supprime désormais les `pickup_items` référençant les order_items wipés, puis
les tournées devenues vides (`items: { none: {} }`), avant le DELETE
`order_items`. Vérifié idempotent (2 runs consécutifs verts).
Fichier : `apps/api/prisma/seeds/dev-seed.ts`.

## [lot-2→lot-9] Système de notation producteur — résolue 2026-05-31 (Lot 9)

Le cœur du besoin (note moyenne producteur, ★ du mockup) est livré : table
`producer_ratings` (migration `lot9_producer_ratings`, unique (orderId,
producerUserId)), endpoint `POST /v1/producers/:producerId/ratings` (client
authentifié, commande **livrée** dont il est propriétaire, audit
`producer.rating.create`), agrégation moyenne+count exposée dans
`ProducerProfileAdmin`, colonne « ★ moyenne (n avis) » dans la liste/détail
admin, et UI client de notation (★ + commentaire) sur les commandes livrées.
5 tests d'intégration (note OK + moyenne, non livrée→CONFLICT, non-owner→
FORBIDDEN, producteur absent→VALIDATION, doublon→CONFLICT). Compléments non
bloquants (affichage ★ catalogue + notation invité) suivis dans l'entrée active
`[lot-9→lot-?] Note producteur : affichage catalogue + notation invité`.

## [lot-8→lot-9] Mockup checkout : trois moyens de paiement → deux exposés — résolue 2026-05-31 (Lot 9)

Confirmé comme **adaptation définitive et voulue** du mockup, pas une dette à
combler. L'enum backend `payment_method` (`cash_on_delivery | online`) est la
source de vérité (§G3) ; le mockup montrait trois tuiles (Espèces / Wave /
Orange Money) mais Wave vs Orange Money est un sous-choix de la page hébergée
Bictorys, hors périmètre MATA. L'UI `/guest/checkout` présente donc deux radios
(Espèces + Paiement en ligne) avec le hint « Wave, Orange Money… via un lien de
paiement sécurisé » qui explicite la redirection. Aucun changement de code :
le comportement actuel (`GUEST_PAYMENT_METHODS`,
apps/web/app/(chromeless)/guest/checkout/page.tsx) est l'état final souhaité.

## [lot-2→lot-9] Schemas Output exposent `displayName` partout — résolue 2026-05-31 (Lot 9)

Comportement **confirmé comme voulu**. Sur le catalogue authentifié, un
`client_particulier` doit pouvoir voir le nom du producteur chez qui il achète :
`ProducerProfilePublicSchema` (packages/shared/src/schemas/producer.ts) expose
`displayName` (déjà public côté Keycloak) + `whatsappPhone`/`photoPublicId`/`bio`,
tandis que la PII (`phone`, `email`, `documents`, `hasBankDetails`) reste réservée
à `ProducerProfileAdminSchema`. Le canal invité est déjà tranché (cf. masquage
producteur, Lot 8). Aucun changement de code : la séparation public/admin est
correcte et intentionnelle.

## [lot-7→lot-9] Rejet HTTP 401 explicite côté récepteur n8n (HMAC) — résolue 2026-05-31 (Lot 9)

Les 7 webhooks du workflow n8n (`infra/n8n/mata-outbox-workflow.json`) passent
de `responseMode: onReceived` à `responseNode`. Le nœud Code « Vérifier
signature HMAC » est en `onError: continueErrorOutput` (deux sorties) : signature
valide → « Traitement » → nœud *Respond to Webhook* « Répondre 200 OK »
(`{received:true}`) ; signature absente/invalide → nœud *Respond to Webhook*
« Répondre 401 » (`responseCode: 401`, `{error:"UNAUTHORIZED"}`). Un appelant
forgé reçoit donc un **vrai 401 HTTP** et le traitement n'est jamais atteint.
README mis à jour. **Non testé au runtime** (pas de n8n en marche dans cette
session) : JSON validé (`JSON.parse` OK), logique conforme au modèle n8n.

## [lot-7→lot-9] Message `httpFetch` codé « Bictorys » pour les échecs n8n — résolue 2026-05-31 (Lot 9)

`httpFetch` (`apps/api/src/lib/bictorys.ts`) est un helper partagé (Bictorys,
n8n, hCaptcha). Ses messages d'erreur codés en dur « Bictorys 5xx » / « Bictorys
unreachable » écrivaient `last_error = "Bictorys unreachable: ..."` dans
`outbox_events` même pour un échec n8n (debug trompeur). Messages rendus
génériques : `HTTP <status>` et `Upstream request failed: <cause>`. Aucun test
n'asseyait l'ancien wording.

## [lot-2→lot-9] Édition d'un site existant (PATCH /v1/sites/:id) — résolue 2026-05-31 (Lot 9)

L'UI d'édition de site est câblée. La page `producer/sites` a un état
`editingSite` ; chaque `SiteCard` porte un bouton « Modifier » qui ouvre le
formulaire pré-rempli. L'ancien `NewSiteForm` est généralisé en `SiteForm`
(prop optionnelle `site`) : create (`useCreateSite`) ou edit (`useUpdateSite` →
PATCH `/v1/sites/:id`, déjà existant). PATCH partiel Prisma (les champs non
fournis restent inchangés). Audit `site.update` déjà écrit côté service.

## [lot-2→lot-6] Validation Cloudinary publicId côté API (avant attach) — résolue 2026-05-31 (Lot 9)

`offerService.attachPhotos` valide désormais que chaque `publicId` reçu commence
par le préfixe du folder figé serveur de l'offre — `mata/offers/<owner>/<offerId>/`
(cf. `uploads-routes.buildFolder`). Tout id hors de ce folder → `DomainError`
`VALIDATION`, aucune photo écrite. Empêche un producteur d'attacher la photo
d'une autre offre / d'un autre compte, ou un id forgé pointant ailleurs.
Couvert par `offer-attach-photos.integration.test.ts` (2 cas : id dans le
folder accepté, id hors folder rejeté sans écriture). NB : la vérification
d'**existence** réelle via `cloudinary.api.resource` (appel réseau) reste non
faite — le préfixe ferme le risque cross-tenant ; un id inexistant mais bien
préfixé donnerait au pire une image cassée (garde-fou : upload via signature
serveur, donc préfixe valide en pratique).

## [lot-5→lot-9] KPIs admin/payments calculés côté front — résolue 2026-05-31 (Lot 9)

Les KPIs « Encaissé mois / Commission MATA / Frais logistique » de
`/admin/payments` étaient calculés côté front avec une approximation grossière
(10% du montant pour la commission, 5% pour la logistique) au lieu des vrais
`pricing_snapshots`. En prod, drift visible avec la compta dès que les
`pricing_rules` varient par catégorie.

**Fix** : route `GET /v1/payments/kpis` (admin) →
`paymentService.getMonthlyKpis()` qui agrège les `payments` `status=paid` du
mois courant (borné `paidAt ∈ [monthStart, nextMonthStart)`) et somme les
composantes EXACTES depuis chaque `pricing_snapshot` (commission, et
collecte+livraison+stockage pour la logistique), pondérées par `quantity`.
Schéma `PaymentKpisOutputSchema` (Zod), hook `usePaymentKpis()`. La page
consomme désormais l'API (plus aucun `Math.round(x*0.1)`). Couvert par
`payments-flow.integration.test.ts` (`describe getMonthlyKpis` : agrégation
exacte bornée au mois + exclusion des `pending`).

## [lot-2→lot-9] Règles a11y Biome désactivées — résolue 2026-05-31 (Lot 9)

Les 5 règles a11y/correctness désactivées dans l'override `**/*.tsx` de
`biome.json` (`noLabelWithoutControl`, `noStaticElementInteractions`,
`useKeyWithClickEvents`, `useUniqueElementIds`, `noAlert`) sont TOUTES
ré-activées. L'override ne désactive plus que `useValidAriaRole`.

**Fix** : pattern `const fid = useId()` + `htmlFor={`${fid}-x`}` / `id={`${fid}-x`}`
appliqué sur tous les formulaires (producer offers/new, sites, setup ;
admin/pickups ; guest/checkout). Le `ConfirmDialog` (`packages/ui`) utilise
`useId()` pour `aria-labelledby`/`aria-describedby` et le backdrop ferme au
clic via `e.target === e.currentTarget` (fermeture clavier = Échap + bouton
Annuler ; unique `biome-ignore noStaticElementInteractions` justifié).
`pnpm biome check .` vert (260 fichiers, 0 erreur).

## [lot-2→lot-9] `alert()`/`confirm()` natifs (vs toast/dialog system) — résolue 2026-05-31 (Lot 9)

Les `alert()`/`confirm()` natifs (`/producer/sites`, `/admin/producers/[userId]`,
`/admin/offers`) sont remplacés par un vrai système toast + dialog dans
`packages/ui` (`ToastProvider`/`useToast`, `ConfirmProvider`/`useConfirm`),
React pur + portail (pas de Headless UI au MVP, CLAUDE.md C). La règle
`suspicious/noAlert` est ré-activée (cf. entrée a11y Biome ci-dessus).

## [lot-8→lot-9] Audit_log non écrit pour les commandes invité — résolue 2026-05-31 (Lot 9)

Au Lot 8, les mutations du canal invité (`order.create`, `payment.intent_created`,
transitions webhook) **sautaient** `auditService.log()` car `actor_user_id` était
`NOT NULL` et un invité n'a pas de ligne `users`. La traçabilité du canal invité
était donc absente d'`audit_log` (CLAUDE.md §G3/§G4 : toute action métier sensible
doit être auditée).

**Fix** : `audit_log.actor_user_id` rendu nullable + colonne `guest_phone_number`
ajoutée (migration `20260530200736_lot9_audit_log_nullable_actor_guest`, purement
additive/assouplissante — FK passe en `ON DELETE SET NULL`). `auditService.log`
accepte désormais `actorUserId: string | null` + `guestPhoneNumber`. `order-service`
et `payment-service` loggent toujours, avec `guestPhoneNumber` renseigné quand
`actorUserId` est null. Couvert par `guest-flow.integration.test.ts` (audit
`order.create` + `payment.intent_created` : actor null, guest_phone_number = N°).

## [lot-6→lot-9] Audit `offer.*` en délégation téléconseil — actor distinct — résolue 2026-05-31 (Lot 9)

`offerService.create` (et les transitions) loggaient `actor_user_id = ownerUserId`
(le producteur) au lieu du **téléconseiller réel** en session déléguée — masquant
qui avait réellement agi. Compensation Lot 6 : l'outbox event
`teleconsult.action.performed` portait les deux UUIDs, mais `audit_log` seul était
faux.

**Fix** : introduction d'un type `AuditActor { actorUserId; onBehalfOfUserId }`.
Les routes offres câblent `resolveAuditActor(req)` (nouveau helper
`apps/api/src/modules/auth/resolve-audit-actor.ts` : `actorUserId = req.user.id`,
`onBehalfOfUserId = req.actingOnBehalfOf?.id ?? null`) — l'acteur est TOUJOURS
l'utilisateur réel, jamais le owner de la ressource. `create/update/attachPhotos`
et `runTransition` propagent l'`onBehalfOf`. Couvert par
`offer-delegation-audit.integration.test.ts` (3 cas : create direct, create
délégué, submit délégué).

## [lot-5→lot-9] E2E Playwright checkout + admin payments — résolue 2026-05-30 (Lot 9)

Suite E2E full-stack livrée et **verte en local** : `apps/web/e2e/fullstack/`
(`payments-checkout.spec.ts`) pilotée par `playwright.fullstack.config.ts` +
`global-setup.ts` (docker compose postgres/keycloak + `prisma migrate deploy` +
`db:seed`) + helper `loginAs` (vrai flow Keycloak OIDC+PKCE). Le mock Bictorys
local (`apps/api/scripts/bictorys-mock-server.ts`, port 4001) rejoue le callback
webhook signé HMAC puis redirige vers `/payment/return`. Couvert :

- **Test client** : login Keycloak → catalogue → panier → commande → « Payer
  maintenant » → checkout mock → confirmation → `/payment/return` « Paiement réussi ».
- **Test admin** : `/admin/payments` filtre « Payé » → la commande apparaît badge PAYÉ.

Lancement : `pnpm --filter @mata/web test:e2e:fullstack`. Le smoke CI
(`playwright.config.ts`) ignore `**/fullstack/**` et reste léger.

**Jambe « admin déclenche reversement » volontairement HORS scope E2E** : un
reversement exige une commande `delivered` + `bank_details` producteur, absents
après un checkout frais (mor.diop n'a pas de bank_details au seed). Déjà couvert
par `payouts-flow.integration.test.ts` (testcontainers). Câbler ce leg en E2E
demanderait de forcer l'état `delivered` + seeder des bank_details — coût sans
gain (le métier reversement est déjà testé). Non rouvert comme dette : couverture
integration suffisante.

## [lot-2→lot-9] CSP prod : durcissement validé, nonce écarté — résolue 2026-05-30 (Lot 9)

Vérification empirique au Lot 9 (build prod + serveur standalone + `curl`) : le
CSP prod **strict** envisagé (`script-src 'self' 'wasm-unsafe-eval'`) aurait
provoqué le white screen redouté — 0/14 balises `<script>` portaient le nonce.
Cause : ~90% des routes sont **prérendues statiquement** (`○` dans la table de
build) et Next ne tamponne le nonce que sur les pages rendues dynamiquement
(`ƒ`). Le nonce par requête est donc incompatible avec notre rendu statique.

**Décision** (sans régression) : `script-src` garde `'unsafe-inline'` en prod.
Durcissement prod réel vs dev : `'unsafe-eval'` RETIRÉ (React Refresh dev only)
et `upgrade-insecure-requests` ajouté. Surface XSS faible : aucun
`dangerouslySetInnerHTML` (vérifié), échappement React, Zod aux frontières.
Fichier : `apps/web/middleware.ts` (`buildCsp`, commentaire détaillé).

Migration nonce future possible uniquement si bascule vers le rendu dynamique
(coût perf pour une PWA mobile-first, non souhaité au MVP).

## [lot-4→lot-9] Cron cleanup `idempotency_records` TTL 24h — résolue 2026-05-30 (Lot 9)

Job `apps/api/src/jobs/cleanup-idempotency.ts` (script `idempotency:cron`),
logique `cleanupExpired()` dans `orders/idempotency.ts` (DELETE `created_at <
now()-24h`, index `created_at` couvrant). Cron Render `mata-cron-cleanup-idempotency`
`0 3 * * *`. Test integration `cleanup-idempotency.integration.test.ts` :
ancien (25h) supprimé, récent (23h) gardé, re-run no-op.

## [lot-5→lot-9] Config Render cron `process-payouts` — résolue 2026-05-30 (Lot 9)

Cron Render `mata-cron-process-payouts` `0 6 * * *` (`render.yaml`), `dockerCommand:
node dist/jobs/process-payouts.js`, env `BICTORYS_*` + `CRON_ACTOR_USER_ID` optionnel.

## [lot-6→lot-9] Config Render cron `cleanup-expired-teleconsult` — résolue 2026-05-30 (Lot 9)

Cron Render `mata-cron-cleanup-teleconsult` `*/5 * * * *` (`render.yaml`),
`dockerCommand: node dist/jobs/cleanup-expired-teleconsult.js`.

## [lot-7→lot-9] Config Render cron `retry-outbox` — résolue 2026-05-30 (Lot 9)

Cron Render `mata-cron-retry-outbox` `*/1 * * * *` (`render.yaml`), `dockerCommand:
node dist/jobs/retry-outbox.js`, env `N8N_BASE_URL`/`N8N_WEBHOOK_SECRET`.

## [lot-5→lot-9] Migration `lot5_payments_part2` en release séparée — résolue 2026-05-30 (Lot 9)

Procédure documentée dans `docs/DEPLOYMENT.md` § « Procédure migrations
destructives en deux temps » (cas concret part1 au déploiement N, part2 au N+1).

## [lot-2→lot-9] Migrations destructives en deux temps — résolue 2026-05-30 (Lot 9)

Procédure générale + cas concret rename `lot2_rename_producer_id` documentés
dans `docs/DEPLOYMENT.md`. Le rename direct était licite car schéma jamais
déployé en prod ; tout rename futur d'une colonne en prod suit la procédure 2 temps.

## [lot-8] hCaptcha invité câblé bout-en-bout — résolue 2026-05-30 (Lot 8)

Le widget hCaptcha est désormais câblé de bout en bout (anti-bot guest checkout) :

- **API** : helper `verifyHcaptcha()` + preHandler sur `POST /v1/guest/orders`
  (test integration : token invalide → 403, 0 commande). Le preHandler a été
  RETIRÉ de `POST /v1/guest/payments/intents` : un token hCaptcha est à usage
  unique (consommé à la création), et le flux online enchaîne create → intent
  avec un seul challenge. L'intent reste gardé par rate-limit + preuve
  d'ownership (`orderId` serveur + `guest_phone_number` figé). Test integration
  dédié : « la création d'intent N'EXIGE PAS de captcha ».
- **Web** : composant typé `GuestHcaptcha` (script officiel `render=explicit`
  via `next/script`, AUCUNE dépendance npm ajoutée), intégré au formulaire
  `/guest/checkout` (token passé dans le body, submit gaté, reset sur échec via
  nonce). CSP middleware élargie aux hosts `hcaptcha.com`/`*.hcaptcha.com`
  (script/frame/style/connect).
- **Config** : `NEXT_PUBLIC_HCAPTCHA_SITEKEY` (web) + `HCAPTCHA_SECRET` (api)
  ajoutés à `env.ts`/`.env.example`/`render.yaml`. Tous deux optionnels :
  absents (dev par défaut) → widget masqué + checkout non gardé (dégradation OK).

**Reste un geste OPS, pas une dette code** : provisionner la paire de clés
hCaptcha réelles dans le dashboard Render (`HCAPTCHA_SECRET` + sitekey) avant
l'ouverture publique. La paire de test (`0x0000…0000` / `10000000-ffff-…-0001`)
permet de valider le flux en local. Garde-fou en attendant : rate-limit strict
`/v1/guest/*` (11ᵉ POST → 429).

## [lot-2→lot-8] Catalogue invité : masquage de l'identité producteur — résolue 2026-05-30 (Lot 8)

Décision tranchée au Lot 8 (suite à la note « À documenter Lot 8 (guest) pour
décider si guest catalog masque les noms ») : **le catalogue invité MASQUE
l'identité du producteur** (CLAUDE.md §G3). Les routes publiques
`/v1/guest/catalog/offers` renvoient les offres SANS les champs `producer`/`site`
(masquage côté serveur, vérifié par le test integration « offre a zoneId mais PAS
de clé producer/site »). L'UI `/guest/checkout` affiche « Producteur MATA vérifié »
au lieu du nom. Le comportement du **catalogue authentifié** (`client_particulier`)
— qui expose `displayName` — a été confirmé comme voulu au Lot 9 (cf. entrée
`[lot-2→lot-9] displayName partout` ci-dessous), distinct du canal invité tranché ici.

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

## [lot-2→lot-7] Coordonnées centroid_lat/lng des zones — résolue 2026-05-30 (Lot 7)

Les 13 zones du `dev-seed.ts` ont désormais `centroidLat`/`centroidLng`
renseignés (cf. `apps/api/prisma/seeds/dev-seed.ts`). Le Lot 7 n'a finalement
pas eu besoin de calcul haversine (les tournées groupent par `zoneId`, pas par
distance géographique), mais les coordonnées sont en place pour un éventuel
routing géographique ultérieur. Le code pickups gère les zones par id, sans
dépendre des coordonnées — donc aucun fallback `null` requis.

## [lot-6→lot-7] Outbox `teleconsult.action.performed` → n8n + email — résolue 2026-05-30 (Lot 7)

Le cron `retry-outbox` (Lot 7) dispatche désormais TOUS les events
`outbox_events` vers n8n, y compris `teleconsult.action.performed`, signés HMAC
SHA-256 (`X-Mata-Signature`). Le workflow email récap / alerte interne est
documenté côté n8n (cf. `docs/N8N_FLOWS.md` §4.7). Le payload porte les deux
UUIDs (teleconsultant + producteur), suffisant pour le mail récap.

Note de scope : le push web producteur a été câblé DIRECTEMENT dans les services
(`notificationService.sendToUser`) pour les events à audience push pertinente
(pickup.scheduled/confirmed → producteur, order.delivered → client, payout.sent
→ producteur). Une notification push spécifique « un téléconseiller a agi en
votre nom » n'a pas été ajoutée : l'audit_log (`on_behalf_of_user_id`) + l'email
n8n couvrent ce besoin de traçabilité au MVP.

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

Le realm-export embarque des users avec UUID stables et password `mata`
(cf. `infra/keycloak/realm-export.json` § `users`) :

| Username         | Role           | UUID Keycloak                          |
|------------------|----------------|----------------------------------------|
| `mor.diop`       | producer       | `6e426967-1bae-4280-8b7d-6597a020416c` |
| `aissatou.sow`   | admin          | `10a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6` |
| `lacalebasse.client` | client_pro | `20a5b1c2-3d4e-4f56-8090-a1b2c3d4e5f6` |
| `ibrahima.ndiaye`| teleconsultant | `30b6c2d3-4e5f-4067-9101-b2c3d4e5f607` |
| `fatou.ndiaye`   | producer       | `a1000001-0000-4000-8000-000000000001` |
| `ousmane.ba`     | producer       | `a1000002-0000-4000-8000-000000000002` |
| `awa.sarr`       | producer       | `a1000003-0000-4000-8000-000000000003` |
| `cheikh.fall`    | producer       | `a1000004-0000-4000-8000-000000000004` |
| `khady.diallo`   | producer       | `a1000005-0000-4000-8000-000000000005` |

Les 5 producteurs Lot 9 (`fatou`/`ousmane` pending, `awa` validée, `cheikh`
suspendu, `khady` blacklisté) alimentent la file de validation de la vue admin
Producteurs (un producteur par statut).

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
