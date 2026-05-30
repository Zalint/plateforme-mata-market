import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Chargement du .env local si présent (Node 22+ natif).
// En production sur Render, les variables sont injectées directement
// par la plateforme — pas de fichier .env.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/**
 * Validation des variables d'environnement au boot.
 *
 * Lot 0 : la plupart des intégrations tierces sont marquées optionnelles.
 * Au fur et à mesure des lots, les variables passeront de `optional()` à requis
 * (avec helper `requiredInProd`) et les valeurs seront contrôlées plus finement.
 *
 * Si une variable requise est absente, le serveur refuse de démarrer
 * (cf. CLAUDE.md §G7 : "Manquante en prod = serveur refuse de démarrer").
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Postgres : requis dès le Lot 0 pour que Prisma puisse se connecter
  DATABASE_URL: z.string().url(),

  // Web URL pour CORS
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),

  // Keycloak : requis dès le Lot 1 (hors tests unitaires qui posent NODE_ENV=test)
  KEYCLOAK_URL: z.string().url().optional(),
  KEYCLOAK_REALM: z.string().optional(),
  KEYCLOAK_CLIENT_API_AUDIENCE: z.string().optional(),

  // Bictorys (Lot 5) — paiement (checkout hosted) + disbursement (reversements).
  // Les 4 vars sont optionnelles ici (NODE_ENV=test peut tourner sans),
  // mais `requireBictorysConfig()` côté lib/bictorys.ts refuse de booter
  // en NODE_ENV=production si l'une des trois critiques manque
  // (API_KEY, API_SECRET, WEBHOOK_SECRET). Cf. CLAUDE.md §G5.
  BICTORYS_API_KEY: z.string().optional(),
  BICTORYS_API_SECRET: z.string().optional(),
  BICTORYS_WEBHOOK_SECRET: z.string().optional(),
  BICTORYS_API_BASE_URL: z.string().url().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // n8n (Lot 7) — destination du dispatch outbox. Le cron retry-outbox POST
  // chaque event vers `${N8N_BASE_URL}/<eventType>` avec une signature HMAC
  // SHA-256 (clé N8N_WEBHOOK_SECRET) dans l'en-tête X-Mata-Signature.
  // Optionnels : si absents, le cron log + skip (n8n jamais dans le chemin
  // critique, CLAUDE.md §G3/§G5).
  N8N_BASE_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),

  // Clé AES-256-GCM en base64 (32 bytes décodés). Requise pour chiffrer
  // bank_details (Lot 2). Optionnelle en NODE_ENV=test pour permettre aux
  // tests unitaires de tourner sans la setter ; les tests qui en ont besoin
  // passent par `encryptWithKey`/`decryptWithKey` avec une clé jetable.
  //
  // Générer une clé : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (val) => {
        try {
          return Buffer.from(val, 'base64').length === 32;
        } catch {
          return false;
        }
      },
      { message: 'ENCRYPTION_KEY doit décoder en 32 bytes base64' },
    )
    .optional(),

  HCAPTCHA_SECRET: z.string().optional(),

  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Normalise les chaînes vides en `undefined` AVANT validation Zod. Sinon
 * `z.string().url().optional()` rejette `""` (string vide non valide en URL)
 * au lieu de le traiter comme "non fourni". Pattern utile pour les `.env`
 * où on laisse souvent des clés vides pour les intégrations pas encore prêtes.
 */
function normalizeEnv(raw: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v === '' ? undefined : v;
  }
  return out;
}

function parseEnv(): Env {
  const parsed = envSchema.safeParse(normalizeEnv(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Volontairement non-pino : on est en pré-init, le logger n'est pas encore là.
    process.stderr.write(`Variables d'environnement invalides :\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = parseEnv();
