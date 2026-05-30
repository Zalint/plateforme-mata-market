# N8N_FLOWS — workflows n8n MATA (Lot 7)

> Référence : `CLAUDE.md` §G3 (« n8n jamais dans le chemin critique »), §G5
> (pattern Outbox + signature HMAC). Source de vérité du dispatch :
> `apps/api/src/lib/n8n.ts`, déclenché par le cron `retry-outbox`.

## 1. Principe

MATA n'appelle JAMAIS n8n de façon synchrone. Chaque événement métier écrit une
ligne dans `outbox_events` (table Postgres), dans la MÊME transaction que la
mutation métier. Un cron (`retry-outbox`) scanne périodiquement les events non
dispatchés et les POST vers n8n.

```
service métier ──(même tx)──▶ outbox_events ──(cron retry-outbox)──▶ n8n
```

Conséquence : si n8n est down, le système métier fonctionne normalement. Les
events s'accumulent dans l'outbox et le cron les rattrape au retour de n8n.

## 2. Transport & sécurité

- **Endpoint** : chaque event est POST vers `${N8N_BASE_URL}/<eventType>`
  (eventType `encodeURIComponent`é). Ex : `https://.../webhook/pickup.scheduled`.
- **Body** : `JSON.stringify({ eventType, payload })`.
- **Signature** : HMAC SHA-256 du raw body avec `N8N_WEBHOOK_SECRET`, en hex,
  dans l'en-tête `X-Mata-Signature`. n8n DOIT vérifier cette signature en
  temps constant avant de traiter (symétrique de notre vérif webhook Bictorys).
- **Secret** : `N8N_WEBHOOK_SECRET` ne quitte jamais le serveur (pino redact).
- **Timeout / retry réseau** : `httpFetch` (timeout 10 s, 3 tentatives, backoff
  exponentiel base 500 ms).
- **Retry applicatif** : un dispatch en échec incrémente `retry_count` ;
  l'event est ré-tenté au prochain passage du cron jusqu'à `MAX_RETRIES` (100),
  après quoi il est abandonné (`outbox.abandoned`, exclu des scans suivants).
- **Idempotence** : un event avec `dispatched_at` non nul n'est jamais
  re-dispatché. n8n doit néanmoins traiter chaque event de façon idempotente
  (un même event peut théoriquement être livré deux fois en cas de crash entre
  POST réussi et écriture de `dispatched_at`).

## 3. Configuration

| Variable | Rôle |
|---|---|
| `N8N_BASE_URL` | Base des webhooks n8n. Si absente → dispatch skip (log). |
| `N8N_WEBHOOK_SECRET` | Clé HMAC SHA-256 partagée. Si absente → dispatch skip. |

Les deux sont optionnelles : sans elles, le cron log et passe (n8n jamais
bloquant). Présentes en prod, elles activent le dispatch.

## 4. Événements dispatchés

Tous les `eventType` produits par les services métier. Le `payload` ci-dessous
est l'objet exact inséré dans `outbox_events.payload`.

### 4.1 `order.created`
- **Émis par** : `orders/order-service.ts` (création de commande).
- **Payload** : `{ orderId, orderNumber, clientUserId, totalFcfa }`.
- **Usage n8n suggéré** : email récapitulatif de commande au client.

### 4.2 `order.confirmed`
- **Émis par** : `payments/payment-service.ts` (paiement passé `paid`).
- **Payload** : `{ orderId, paymentId }`.
- **Usage n8n suggéré** : email/notif « paiement reçu, commande confirmée ».

### 4.3 `order.delivered`
- **Émis par** : `orders/order-service.ts` (transition → `delivered`).
- **Payload** : `{ orderId, orderNumber, clientUserId }`.
- **Usage n8n suggéré** : email « commande livrée » + demande d'avis.
- **Note** : le push web client est émis EN PLUS, directement par le service
  (`notificationService.sendToUser`, hors n8n).

### 4.4 `pickup.scheduled`
- **Émis par** : `pickups/pickup-service.ts` (création de tournée).
- **Payload** : `{ pickupId, pickupNumber, zoneId, scheduledFor, scheduledPeriod, orderItemIds }`.
- **Usage n8n suggéré** : email/SMS producteur « collecte planifiée ».
- **Note** : push web producteur émis EN PLUS, directement par le service.

### 4.5 `pickup.confirmed`
- **Émis par** : `pickups/pickup-service.ts` (passage en `collecting`).
- **Payload** : `{ pickupId, pickupNumber, zoneId, orderItemIds }`.
- **Usage n8n suggéré** : notif « collecteur en route ».
- **Note** : push web producteur émis EN PLUS, directement par le service.

### 4.6 `payout.sent`
- **Émis par** : `payouts/payout-service.ts` (disbursement Bictorys `sent`).
- **Payload** : `{ payoutId, producerUserId, amountFcfa }`.
- **Usage n8n suggéré** : email producteur « reversement effectué ».
- **Note** : push web producteur émis EN PLUS, directement par le service.

### 4.7 `teleconsult.action.performed`
- **Émis par** : `teleconsult/teleconsult-plugin.ts` (toute action déléguée
  réussie hors `/v1/teleconsult/*`).
- **Payload** : `{ sessionId, teleconsultantUserId, teleconsultantDisplayName, producerUserId, method, path, statusCode, at }`.
- **Usage n8n suggéré** : traçabilité / alerte interne sur action déléguée.

## 5. Push web vs n8n (séparation des responsabilités)

- **Push web** (notification navigateur, temps « réel ») : émis DIRECTEMENT par
  les services métier via `notificationService.sendToUser`, hors chemin critique
  (`sendToUser` ne throw jamais). Audience actuelle : producteurs (pickups,
  payout) et client (order.delivered).
- **n8n** (email, SMS, intégrations externes, automatisations) : via l'outbox.

Les deux canaux sont indépendants : un event peut déclencher l'un, l'autre, ou
les deux. Le push n'attend pas n8n, n8n n'attend pas le push.
