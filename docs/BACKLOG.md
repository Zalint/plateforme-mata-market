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

## [lot-6→lot-9] Audit `offer.*` lors d'une délégation téléconseil — actor distinct

- **Découvert** : Lot 6 E2E approfondi (POST /v1/offers via ibrahima en
  session déléguée → audit `offer.create` avec `actor_user_id = mor` au lieu
  de `actor = ibrahima` + `on_behalf_of = mor`)
- **Cible** : Lot 9 (durcissement audit + reporting)
- **Pourquoi reporté** : `offer-service.create` (et autres routes producer
  câblées via `requireProducerOrDelegate`) utilise `actorUserId = ownerUserId`
  pour l'audit. Quand un téléconseiller agit pour un producteur, l'audit
  loggue le producteur comme acteur — techniquement faux (l'acteur est le
  téléconseiller, le producteur est juste le owner de la ressource).
  
  Compensation actuelle : l'outbox event `teleconsult.action.performed`
  contient les DEUX UUIDs (teleconsultantUserId + producerUserId) — donc
  la traçabilité existe, juste pas dans audit_log.
  
  Refactor : passer `actorUserId` + `onBehalfOfUserId` séparés à 
  `offerService.create/update/suspend/reject/validate/etc.` + même pour
  sites, stock, pickups (Lot 7).
- **Fichiers** : apps/api/src/modules/offers/offer-service.ts:131
  (audit.log actorUserId), apps/api/src/modules/offers/offer-routes.ts:60
  (appel create), `requireProducerOrDelegate` qui retourne déjà
  `{actorUserId, ownerUserId, onBehalfOf}` mais ce dernier n'est pas propagé.
- **Garde-fou actuel** : outbox event `teleconsult.action.performed` capture
  l'info complète. audit_log seul est partiellement correct.
- **Risque si non traité** : audit log incomplet pour reporting téléconseil.
  Acceptable au MVP car outbox event compense.

## [lot-7→lot-9] E2E Puppeteer push web réel (souscription navigateur)

- **Découvert** : Lot 7 (notifications push web livrées + testées côté API)
- **Cible** : Lot 9 (suite E2E browser complète)
- **Pourquoi reporté** : les tests integration couvrent le service
  (`notifications-flow` : subscribe/unsubscribe/preferences/sendToUser) et le
  câblage du déclenchement (`pickup-flow` vérifie que `sendToUser` est appelé
  avec le bon producteur). Le test E2E réel (permission navigateur → Service
  Worker → souscription PushManager → réception d'une notification système)
  demande un navigateur headless avec VAPID configuré + un SW enregistré.
  C'est un travail Lot 9 (cf. E2E Playwright/Puppeteer global).
- **Fichiers** : à créer apps/web/e2e/push-subscription.spec.ts (Lot 9).
- **Garde-fou actuel** : service + déclenchement couverts par tests integration ;
  `sendToUser` ne throw jamais (hors chemin critique).
- **Risque si non traité** : régression possible dans le flux navigateur
  (permission/SW/souscription) non détectée par les tests integration API.

## [lot-7→lot-9] Rejet HTTP 401 explicite côté récepteur n8n (durcissement HMAC)

- **Découvert** : Lot 7 (vérif HMAC `X-Mata-Signature` ajoutée au workflow n8n,
  commit `86cbc95`)
- **Cible** : Lot 9 (durcissement intégrations)
- **Pourquoi reporté** : le nœud Code « Vérifier signature HMAC (temps
  constant) » valide bien la signature AVANT traitement (signature invalide →
  `throw` → exécution en erreur, nœud de traitement jamais atteint). Mais comme
  les webhooks sont en `responseMode: onReceived`, n8n répond `200` AVANT
  d'exécuter le workflow (ack rapide, n8n hors chemin critique §G3) : le code
  HTTP reste donc `200` même pour une signature forgée. Pour un vrai rejet
  `401` au niveau HTTP, repasser les webhooks en `responseMode: lastNode` +
  ajouter un nœud *Respond to Webhook* renvoyant 401 sur la branche d'erreur.
- **Fichiers** : infra/n8n/mata-outbox-workflow.json, infra/n8n/README.md.
- **Garde-fou actuel** : la signature EST vérifiée et gate le traitement ; un
  event forgé n'est jamais traité (visible en `Error` dans Executions). Seul le
  code HTTP retourné est non discriminant.
- **Risque si non traité** : un appelant forgé reçoit `200` (faux positif de
  succès) alors que l'event n'est pas traité. Faible : l'unique appelant
  légitime est notre cron, qui signe correctement.

## [lot-7→lot-9] Message d'erreur `httpFetch` codé « Bictorys » pour les échecs n8n

- **Découvert** : Lot 7 (démo résilience : n8n arrêté → cron → `last_error`)
- **Cible** : Lot 9 (nettoyage helper HTTP)
- **Pourquoi reporté** : le dispatch n8n (`lib/n8n.ts`) réutilise le helper
  partagé `httpFetch` (`lib/bictorys.ts`), dont le message d'erreur est codé en
  dur « Bictorys unreachable: ... ». Résultat : un échec de dispatch n8n écrit
  `last_error = "Bictorys unreachable: This operation was aborted"` dans
  `outbox_events` — trompeur pour le debug. Rendre le message générique
  (sans nom de prestataire) dans `httpFetch`.
- **Fichiers** : apps/api/src/lib/bictorys.ts (helper `httpFetch`).
- **Garde-fou actuel** : purement cosmétique (logs/`last_error`) ; le
  comportement de retry/abandon est correct.
- **Risque si non traité** : diagnostic ralenti (faux indice « Bictorys » sur
  un incident n8n). Aucun impact fonctionnel.

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

## [lot-8→lot-9] Audit_log non écrit pour les commandes invité

- **Découvert** : Lot 8 (création commande invité sans compte)
- **Cible** : Lot 9 (durcissement audit + reporting)
- **Pourquoi reporté** : `order.create` (et la confirmation paiement) loggue
  normalement via `auditService.log({ actorUserId })`. Pour une commande
  invité il n'y a PAS de row `users` (l'invité est identifié par
  `guest_phone_number`), donc `actorUserId` serait null et la FK
  `audit_log.actor_user_id → users.id` échouerait. Choix : skip l'audit pour
  l'invité (cohérent avec le précédent `payment-service` webhook qui skip aussi
  quand l'acteur est le prestataire). Refactor propre : rendre
  `audit_log.actor_user_id` nullable + ajouter une colonne `guest_phone_number`
  (ou `actor_kind`) pour tracer l'acteur invité.
- **Fichiers** : apps/api/src/modules/guest/guest-service.ts (création order
  sans audit), apps/api/src/modules/orders/order-service.ts (audit câblé au
  parcours authentifié).
- **Garde-fou actuel** : les rows `orders` invité portent `guest_full_name` +
  `guest_phone_number` + `payment_method`, donc la commande reste traçable en
  base ; seul le journal `audit_log` est muet.
- **Risque si non traité** : reporting audit incomplet sur le canal invité.
  Pas de surface sécurité (la commande elle-même est persistée et traçable).

## [lot-8→lot-?] Mockup checkout : trois moyens de paiement → deux exposés

- **Découvert** : Lot 8 (UI `/guest/checkout`, mockup §4712)
- **Cible** : non urgent — à revoir si le backend expose un choix wallet explicite
- **Pourquoi reporté** : le mockup présente trois options (Espèces / Wave /
  Orange Money) mais l'enum backend `payment_method` n'expose que
  `cash_on_delivery | online`. L'UI présente donc deux radios (Espèces +
  Paiement en ligne) ; le choix Wave vs Orange Money se fait sur la page
  hébergée Bictorys après redirection. Adaptation assumée du mockup contrainte
  par l'enum.
- **Fichiers** : apps/web/app/(chromeless)/guest/checkout/page.tsx
  (`GUEST_PAYMENT_METHODS`).
- **Garde-fou actuel** : le hint « Wave, Orange Money… via un lien sécurisé »
  explicite la redirection au client.
- **Risque si non traité** : léger écart visuel avec le mockup, sans impact
  fonctionnel (Bictorys gère le sous-choix wallet).

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
- **Risque si non traité** : aucun majeur (le canal invité est tranché, cf.
  `## Résolues` Lot 8 — masquage producteur). Reste à confirmer le comportement
  voulu pour le catalogue authentifié `client_particulier`.

---

# Résolues

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
au lieu du nom. L'entrée active `[lot-2→lot-?] displayName partout` reste ouverte
uniquement pour le **catalogue authentifié** (`client_particulier`), distinct du
canal invité désormais tranché.

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
