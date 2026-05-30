import { type NextRequest, NextResponse } from 'next/server';
import { COOKIE_REFRESH } from './src/lib/auth/cookies';

/**
 * Middleware Next.js — pose la CSP et redirige les pages chromed non
 * authentifiées vers /auth/login.
 *
 * Référence : ARCHITECTURE.md §9 « CSP » + §3 « Authentification ».
 * Note : le check d'auth ici se base sur la PRÉSENCE du cookie refresh, pas
 * sur sa validité (la validité est vérifiée par /api/auth/refresh). C'est
 * volontaire : éviter un round-trip Keycloak par requête.
 */

const PUBLIC_PREFIXES = [
  '/welcome',
  '/auth',
  '/api/auth',
  '/guest',
  '/mockup',
  '/manifest.json',
  '/offline.html',
  '/icons',
  '/favicon.ico',
];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Auth check : redirect vers login si pas de cookie refresh et route protégée
  if (!isPublic && pathname !== '/') {
    const hasRefresh = request.cookies.has(COOKIE_REFRESH);
    if (!hasRefresh) {
      const loginUrl = new URL('/auth/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  // En dev, autoriser localhost:4000 (API), localhost:8081 (Keycloak), upload
  // Cloudinary (api.cloudinary.com déjà listé). En prod, seuls les hosts
  // mata.sn + Cloudinary + Keycloak prod sont autorisés.
  const isDev = process.env.NODE_ENV !== 'production';
  const devConnect = isDev ? ' http://localhost:4000 http://localhost:8081' : '';
  const devFrame = isDev ? ' http://localhost:8081' : '';

  // En dev, Next 15 utilise des `<script>` inline (RSC streaming + bootstrap)
  // et `eval()` (React Refresh / Fast Refresh) — donc on doit autoriser
  // `'unsafe-inline'` et `'unsafe-eval'` pour que React hydrate. En prod
  // ces deux directives DOIVENT être retirées : on bascule sur des nonces
  // Next (à câbler au Lot 9 durcissement, cf. ARCHITECTURE.md §9 CSP).
  // hCaptcha (guest checkout, Lot 8) charge son script + iframe + assets depuis
  // hcaptcha.com et ses sous-domaines (js./newassets.). Hosts requis sur
  // script/frame/style/connect (cf. docs hCaptcha « Content Security Policy »).
  const HCAPTCHA = 'https://hcaptcha.com https://*.hcaptcha.com';

  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${HCAPTCHA}`
    : `script-src 'self' 'wasm-unsafe-eval' ${HCAPTCHA}`;

  const csp = [
    "default-src 'self'",
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${HCAPTCHA}`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    `connect-src 'self' https://api.mata.sn https://keycloak.mata.sn https://api.cloudinary.com ${HCAPTCHA}${devConnect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    `frame-src https://keycloak.mata.sn ${HCAPTCHA}${devFrame}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|offline.html).*)'],
};
