/**
 * Client HTTP MATA — fetch wrapper avec auth Bearer.
 *
 * - L'URL de base provient de `NEXT_PUBLIC_API_BASE_URL` (browser-safe, lue à
 *   build-time par Next.js).
 * - Le token d'accès est obtenu par le caller via `useAuth()` et passé en arg.
 *   Pas de hook ici car le client est utilisé hors React (queryFn TanStack).
 * - Pas de retry : TanStack Query s'en charge via sa propre config.
 * - Pas de timeout custom : on s'appuie sur AbortSignal du TanStack Query.
 *
 * Référence : ARCHITECTURE.md §9.
 */

import { getActiveTeleconsultSessionId } from './teleconsult-session-storage';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  accessToken: string | null;
  signal?: AbortSignal;
  body?: unknown;
};

async function request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  // Lot 6 — si une session teleconseil est active cote browser, injecter
  // X-Teleconsult-Session-Id pour que l'API marque l'action `on_behalf_of`.
  const teleconsultSessionId = getActiveTeleconsultSessionId();
  if (teleconsultSessionId && !path.startsWith('/v1/teleconsult/')) {
    headers['X-Teleconsult-Session-Id'] = teleconsultSessionId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;
  const parsed = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, parsed, `${res.status} ${method} ${path}`);
  }
  return parsed as T;
}

export const apiClient = {
  get: <T>(path: string, accessToken: string | null, signal?: AbortSignal) =>
    request<T>('GET', path, { accessToken, signal }),
  post: <T>(path: string, body: unknown, accessToken: string | null, signal?: AbortSignal) =>
    request<T>('POST', path, { accessToken, body, signal }),
  patch: <T>(path: string, body: unknown, accessToken: string | null, signal?: AbortSignal) =>
    request<T>('PATCH', path, { accessToken, body, signal }),
  put: <T>(path: string, body: unknown, accessToken: string | null, signal?: AbortSignal) =>
    request<T>('PUT', path, { accessToken, body, signal }),
};
