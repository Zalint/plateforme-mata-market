import { createHmac } from 'node:crypto';
import Fastify from 'fastify';

/**
 * Mock server Bictorys pour tests E2E locaux.
 *
 * Reproduit le checkout hosted Bictorys sans dépendance externe / tunnel ngrok.
 * Tourne sur le port 4001 et expose :
 *  - POST /charges                       : crée un intent, retourne fake paymentUrl
 *  - GET  /pay/:intentId                 : page HTML "Payer" simulant le checkout
 *  - POST /pay/:intentId/confirm         : envoie webhook signé HMAC à l'API
 *                                          MATA + redirige vers le returnUrl client
 *  - POST /payouts                       : retourne fake disbursement
 *
 * IMPORTANT : ce serveur ne tourne JAMAIS en prod. Activé uniquement quand
 * `BICTORYS_API_BASE_URL` pointe vers `http://localhost:4001`.
 *
 * Le `BICTORYS_WEBHOOK_SECRET` lu ici DOIT matcher celui de l'API MATA pour
 * que la signature HMAC soit valide côté webhook handler.
 */

// Charge le .env local de apps/api/ pour BICTORYS_WEBHOOK_SECRET (alignement clé HMAC).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const WEBHOOK_SECRET = process.env.BICTORYS_WEBHOOK_SECRET;
const MATA_API_BASE = process.env.MATA_API_BASE_URL ?? 'http://localhost:4000';
const PORT = Number(process.env.BICTORYS_MOCK_PORT ?? 4001);

if (!WEBHOOK_SECRET) {
  process.stderr.write('BICTORYS_WEBHOOK_SECRET manquant dans .env\n');
  process.exit(1);
}

type Intent = {
  id: string;
  amount: number;
  currency: string;
  reference: string;
  returnUrl: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  status: 'opened' | 'paid';
};

const intents = new Map<string, Intent>();

const app = Fastify({ logger: { level: 'info' } });

// Accepte les form HTML (application/x-www-form-urlencoded) en plus du JSON.
// Le mock checkout submit un form HTML, on n'a pas besoin du body — juste
// extraire les params pour éviter le 415 par défaut Fastify.
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_req, body, done) => done(null, body),
);

// ─────────────────────────────────────────────────────────────────
// POST /charges — create payment intent

app.post('/charges', async (req, reply) => {
  const body = req.body as {
    amount: number;
    currency: string;
    reference: string;
    return_url: string;
    callback_url: string;
    metadata: Record<string, unknown>;
  };

  const intentId = `intent_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const intent: Intent = {
    id: intentId,
    amount: body.amount,
    currency: body.currency,
    reference: body.reference,
    returnUrl: body.return_url,
    callbackUrl: body.callback_url,
    metadata: body.metadata,
    status: 'opened',
  };
  intents.set(intentId, intent);

  return reply.code(201).send({
    id: intentId,
    paymentUrl: `http://localhost:${PORT}/pay/${intentId}`,
    status: 'opened',
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /charges/:id — check status

app.get<{ Params: { id: string } }>('/charges/:id', async (req, reply) => {
  const intent = intents.get(req.params.id);
  if (!intent) return reply.code(404).send({ error: 'not_found' });
  return reply.send({
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    paymentMethod: intent.status === 'paid' ? 'wave' : null,
    customer: intent.status === 'paid' ? { name: 'Mock Payer', phone: '+221701234567' } : null,
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /pay/:id — page HTML « checkout »

app.get<{ Params: { id: string } }>('/pay/:id', async (req, reply) => {
  const intent = intents.get(req.params.id);
  if (!intent) {
    return reply.code(404).type('text/html').send('<h1>Intent introuvable</h1>');
  }
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bictorys MOCK · Paiement ${intent.reference}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
    h1 { color: #1f2937; margin: 0 0 8px; font-size: 22px; }
    .mock-tag { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
    .amount { font-size: 36px; font-weight: 800; color: #667eea; margin: 16px 0; }
    .detail { font-size: 14px; color: #6b7280; margin: 4px 0; }
    button { width: 100%; padding: 14px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 20px; }
    button:hover { transform: translateY(-1px); }
    button.cancel { background: #f3f4f6; color: #6b7280; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mock-tag">🧪 MOCK BICTORYS · LOCAL</div>
    <h1>Paiement sécurisé</h1>
    <div class="detail">Commande : <strong>${intent.reference}</strong></div>
    <div class="amount">${intent.amount.toLocaleString('fr-FR')} ${intent.currency}</div>
    <div class="detail">Wave · Orange Money · Carte bancaire</div>
    <form method="POST" action="/pay/${intent.id}/confirm">
      <button type="submit">✅ Payer ${intent.amount.toLocaleString('fr-FR')} ${intent.currency}</button>
    </form>
    <form method="POST" action="/pay/${intent.id}/cancel">
      <button type="submit" class="cancel">Annuler</button>
    </form>
  </div>
</body>
</html>`;
  return reply.type('text/html').send(html);
});

// ─────────────────────────────────────────────────────────────────
// POST /pay/:id/confirm — simule paiement réussi + webhook + redirect

app.post<{ Params: { id: string } }>('/pay/:id/confirm', async (req, reply) => {
  const intent = intents.get(req.params.id);
  if (!intent) return reply.code(404).send({ error: 'not_found' });

  intent.status = 'paid';

  // Construit le payload webhook et signe-le avec le webhook secret.
  const payload = {
    id: intent.id,
    status: 'paid',
    amount: intent.amount,
    currency: intent.currency,
    paymentMethod: 'wave',
    customer: { name: 'Mock Payer', phone: '+221701234567', email: 'mock@test.sn' },
  };
  const payloadJson = JSON.stringify(payload);
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(payloadJson).digest('hex');

  // Envoie le webhook à l'API MATA (fire-and-forget mais log).
  try {
    const res = await fetch(intent.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bictorys-signature': signature,
      },
      body: payloadJson,
    });
    app.log.info({ status: res.status, intentId: intent.id }, 'webhook.sent');
  } catch (err) {
    app.log.error({ err: err instanceof Error ? err.message : String(err) }, 'webhook.failed');
  }

  // Petit délai pour laisser le webhook s'appliquer côté MATA AVANT le polling.
  await new Promise((r) => setTimeout(r, 300));

  // Redirect vers le returnUrl du client (pattern Bictorys hosted checkout).
  return reply.redirect(intent.returnUrl, 302);
});

// ─────────────────────────────────────────────────────────────────
// POST /pay/:id/cancel — simule annulation

app.post<{ Params: { id: string } }>('/pay/:id/cancel', async (req, reply) => {
  const intent = intents.get(req.params.id);
  if (!intent) return reply.code(404).send({ error: 'not_found' });
  return reply.redirect(intent.returnUrl, 302);
});

// ─────────────────────────────────────────────────────────────────
// POST /payouts — fake disbursement (toujours succès)

app.post('/payouts', async (_req, reply) => {
  return reply.code(201).send({
    id: `disb_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'sent',
  });
});

// ─────────────────────────────────────────────────────────────────
// Health

app.get('/_health', async () => ({ ok: true, intents: intents.size }));

// ─────────────────────────────────────────────────────────────────

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(
  { port: PORT, mataApi: MATA_API_BASE },
  `Bictorys MOCK ready — point BICTORYS_API_BASE_URL to http://localhost:${PORT}`,
);
