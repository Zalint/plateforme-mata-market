# n8n local — réception réelle du dispatch outbox (Lot 7)

Onboarding d'un **vrai** n8n (pas de mock) qui reçoit le dispatch du cron
`retry-outbox`. Référence : `docs/N8N_FLOWS.md`, `CLAUDE.md` §G3/§G5.

## 1. Démarrer n8n

```bash
docker compose up -d n8n
```

UI : http://localhost:5678 (crée un compte « owner » au premier lancement —
c'est local, n'importe quel email/mot de passe convient).

## 2. Configurer l'API

Dans `apps/api/.env` (déjà fait sur ce poste) :

```
N8N_BASE_URL=http://localhost:5678/webhook
N8N_WEBHOOK_SECRET=mata-dev-n8n-webhook-secret-32chars!!
```

`isN8nConfigured()` devient vrai → le cron dispatch réellement.

## 3. Importer + activer le workflow récepteur

`mata-outbox-workflow.json` contient un nœud Webhook par eventType
(`pickup.scheduled`, `pickup.confirmed`, `order.created`, `order.confirmed`,
`order.delivered`, `payout.sent`, `teleconsult.action.performed`), chacun
répondant 200. Le fichier est monté dans le conteneur sous `/import`.

```bash
# Import (le workflow arrive inactif dans la DB n8n)
docker exec mata-n8n n8n import:workflow --input=/import/mata-outbox-workflow.json

# Récupère son id puis active-le
docker exec mata-n8n n8n list:workflow
docker exec mata-n8n n8n update:workflow --active=true --id=<ID>

# Redémarre pour enregistrer les webhooks de production (/webhook/<path>)
docker restart mata-n8n
```

> Les webhooks de **production** ne sont servis que si le workflow est
> `active` ET après (re)démarrage du process principal n8n.

## 4. Déclencher un event réel

```bash
# Écrit un outbox_event pickup.scheduled (via le seed ou un POST /v1/pickups)
# puis délivre :
pnpm --filter @mata/api outbox:cron
```

Vérifs :

- **API** : log `cron.done` avec `dispatched: 1`.
- **DB** : `outbox_events.dispatched_at` posé, `last_error` nul.
- **n8n** : `docker logs mata-n8n` montre l'exécution du webhook ; l'UI
  (Executions) liste l'event reçu avec le body `{ eventType, payload }`.

## 5. Tester un webhook à la main (sanity check)

```bash
curl -i -X POST http://localhost:5678/webhook/pickup.scheduled \
  -H 'content-type: application/json' \
  -H 'x-mata-signature: dev-test' \
  -d '{"eventType":"pickup.scheduled","payload":{"pickupId":"demo"}}'
```

Réponse `200` = webhook actif.

## Notes

- DB n8n : SQLite embarquée (volume `n8n-data`). `docker compose down -v`
  réinitialise tout (workflow à ré-importer).
- Le nœud récepteur ne vérifie pas la signature HMAC (démo réception). En
  prod, n8n DOIT vérifier `X-Mata-Signature` en temps constant (cf. §G5) —
  ajouter un Code node de vérification avant traitement.
