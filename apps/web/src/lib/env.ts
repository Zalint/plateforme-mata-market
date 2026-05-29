import { z } from 'zod';

/**
 * Variables d'environnement utilisées côté Next.js.
 *
 * Les variables `NEXT_PUBLIC_*` sont exposées au navigateur. Les autres sont
 * server-only (Route Handlers, middleware, server components).
 *
 * Référence : ARCHITECTURE.md §9 + CLAUDE.md §G7.
 */
const envSchema = z.object({
  // Server-only
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID: z.string().min(1).default('mata-web'),
  KEYCLOAK_REDIRECT_URI: z.string().url(),
  API_BASE_URL: z.string().url(),

  // Public (browser)
  NEXT_PUBLIC_KEYCLOAK_URL: z.string().url(),
  NEXT_PUBLIC_KEYCLOAK_REALM: z.string().min(1),
  NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: z.string().min(1).default('mata-web'),
  // URL de l'API métier MATA exposée au navigateur (CORS configuré côté API).
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  // Nom du compte Cloudinary pour construire les URLs publiques d'image.
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    KEYCLOAK_URL: process.env.KEYCLOAK_URL,
    KEYCLOAK_REALM: process.env.KEYCLOAK_REALM,
    KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_REDIRECT_URI: process.env.KEYCLOAK_REDIRECT_URI,
    API_BASE_URL: process.env.API_BASE_URL,
    NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
    NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Web env invalide :\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}
