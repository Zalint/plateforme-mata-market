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

## [lot-2→lot-4] OfferStatus `reserved` et `sold` non créés

- **Découvert** : Lot 2 (périmètre strict CLAUDE.md §E.4)
- **Cible** : Lot 4 (orders)
- **Pourquoi reporté** : aucune transition au Lot 2 ne les emprunte. Les
  créer maintenant introduit du "code mort" et bloque le contrôle d'enum
  cohérence (cf. `enum-coherence.test.ts`).
- **Fichiers** : apps/api/prisma/schema.prisma:117-128 (commentaire inline)
  + packages/shared/src/constants/enums.ts:78-89
- **Garde-fou actuel** : tableau `[reserved · 1]` du mockup producer/offers
  est vide au Lot 2 (acceptable car pas d'orders encore).
- **Risque si non traité** : migration enum dédiée à prévoir Lot 4.

## [lot-2→lot-4] Note moyenne producteur (★ 4.8 dans mockup) absente

- **Découvert** : Lot 2 (le mockup affiche `★ 4.8`)
- **Cible** : Lot 4 (orders + reviews) ou Lot 9
- **Pourquoi reporté** : pas de signal métier pour calculer une note tant
  qu'on n'a pas de reviews post-livraison.
- **Fichiers** : packages/ui/src/offer-card.tsx (UI placeholder "—")
- **Garde-fou actuel** : aucun, juste placeholder.
- **Risque si non traité** : différence visible avec mockup, à expliquer.

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

---

# Notes opérationnelles

## Setup local Keycloak

Si la DB Keycloak est wipée (`docker compose down -v`), le realm `mata` doit
être ré-importé manuellement via l'UI admin :

1. http://localhost:8081/admin/master/console/ (login `admin`/`admin`)
2. Create Realm → Browse → `infra/keycloak/realm-export.json`
3. Recréer le user `mor.diop` (password `mata`, role `producer`).
   Si son UUID Keycloak change, aligner avec :
   `docker compose exec postgres psql -U mata -d mata -c "UPDATE users SET keycloak_id='<new-uuid>' WHERE display_name='Mor Diop';"`

## Port Keycloak sur cette machine

EnterpriseDB squatte le port 8080 sur le poste de dev → Keycloak mappé sur
`8081:8080` dans docker-compose.yml. Si tu démarres MATA sur une autre
machine sans EDB, repasse à `8080:8080` et aligne :
- `apps/api/.env` : `KEYCLOAK_URL=http://localhost:8080`
- `apps/web/.env.local` : `KEYCLOAK_URL` + `NEXT_PUBLIC_KEYCLOAK_URL`
