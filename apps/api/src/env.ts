import { z } from 'zod';

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

  // Optionnels à ce stade — durcis dans les lots dédiés
  KEYCLOAK_URL: z.string().url().optional(),
  KEYCLOAK_REALM: z.string().optional(),
  KEYCLOAK_CLIENT_API_AUDIENCE: z.string().optional(),

  BICTORYS_API_KEY: z.string().optional(),
  BICTORYS_WEBHOOK_SECRET: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  ENCRYPTION_KEY: z.string().optional(),

  HCAPTCHA_SECRET: z.string().optional(),

  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
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
