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
  // Clé VAPID PUBLIQUE (web push, Lot 7). Exposée au navigateur volontairement
  // — seule la clé PRIVÉE (côté API) doit rester secrète (CLAUDE.md §G8).
  // Absente = le push est simplement indisponible côté front (dégradation OK).
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  // Sitekey hCaptcha PUBLIQUE (anti-bot guest checkout, Lot 8). Pendant front
  // de `HCAPTCHA_SECRET` côté API. Exposée au navigateur volontairement (le
  // secret reste server-only). Absente = widget masqué et POST guest non gardé
  // par captcha (dégradation OK, dev par défaut) ; présente = widget affiché et
  // token exigé. Les deux clés vont de pair (cf. dashboard hCaptcha).
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: z.string().min(1).optional(),
  // Affiche le lien « Voir la maquette de référence » sur /welcome. Masqué par
  // défaut (artefact de dev) ; mettre 'true' pour le réafficher.
  NEXT_PUBLIC_SHOW_MOCKUP: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Normalise une variable d'env : chaîne vide → `undefined`. Sinon
 * `z.string().min(1).optional()` (et les enums) rejettent `""` au lieu de le
 * traiter comme "non fourni". Indispensable en conteneur où les variables non
 * renseignées sont injectées comme chaînes vides (docker-compose), pas absentes.
 * Aligné sur `apps/api/src/env.ts`.
 */
function orUndef(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

function parseEnv(): Env {
  const parsed = envSchema.safeParse({
    NODE_ENV: orUndef(process.env.NODE_ENV),
    KEYCLOAK_URL: orUndef(process.env.KEYCLOAK_URL),
    KEYCLOAK_REALM: orUndef(process.env.KEYCLOAK_REALM),
    KEYCLOAK_CLIENT_ID: orUndef(process.env.KEYCLOAK_CLIENT_ID),
    KEYCLOAK_REDIRECT_URI: orUndef(process.env.KEYCLOAK_REDIRECT_URI),
    API_BASE_URL: orUndef(process.env.API_BASE_URL),
    NEXT_PUBLIC_KEYCLOAK_URL: orUndef(process.env.NEXT_PUBLIC_KEYCLOAK_URL),
    NEXT_PUBLIC_KEYCLOAK_REALM: orUndef(process.env.NEXT_PUBLIC_KEYCLOAK_REALM),
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: orUndef(process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID),
    NEXT_PUBLIC_API_BASE_URL: orUndef(process.env.NEXT_PUBLIC_API_BASE_URL),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: orUndef(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: orUndef(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    NEXT_PUBLIC_HCAPTCHA_SITEKEY: orUndef(process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY),
    NEXT_PUBLIC_SHOW_MOCKUP: orUndef(process.env.NEXT_PUBLIC_SHOW_MOCKUP),
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
