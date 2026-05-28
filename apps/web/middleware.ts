import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware Next.js — pose la CSP et les headers de sécurité de base.
 *
 * Reference : ARCHITECTURE.md §9 « CSP (PWA) ».
 * Note Lot 0 : valeurs pensées pour dev local + futurs domaines prod
 * (api.mata.sn, keycloak.mata.sn). À durcir au Lot 9 (revue secrets + prod).
 */
export function middleware(_request: NextRequest): NextResponse {
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
