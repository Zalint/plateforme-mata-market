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

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "connect-src 'self' https://api.mata.sn https://keycloak.mata.sn https://api.cloudinary.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    'frame-src https://keycloak.mata.sn',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|offline.html).*)'],
};
