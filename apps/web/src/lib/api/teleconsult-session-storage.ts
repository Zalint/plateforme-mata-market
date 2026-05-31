'use client';

/**
 * Stockage singleton (memoire JS, jamais persiste) de la sessionId
 * teleconseil active cote browser.
 *
 * Le http-client le lit a chaque requete et injecte le header
 * X-Teleconsult-Session-Id si defini. Ainsi, toutes les mutations metier
 * faites par le teleconseiller pendant une session sont automatiquement
 * marquees `on_behalf_of` cote API.
 *
 * Pourquoi pas localStorage ? Pour eviter que la sessionId survive a un
 * refresh / une fermeture d'onglet — la session DOIT etre re-demandee
 * explicitement a chaque visite (CLAUDE.md G8).
 *
 * Pourquoi pas un Context React ? Le http-client est appele depuis le
 * queryFn TanStack qui n'est pas un hook. Un module singleton plat est
 * plus simple. Le Context React au-dessus garde la reactivite UI.
 */

let activeSessionId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export function getActiveTeleconsultSessionId(): string | null {
  return activeSessionId;
}

export function setActiveTeleconsultSessionId(id: string | null): void {
  if (activeSessionId === id) return;
  activeSessionId = id;
  for (const fn of listeners) fn(id);
}

export function subscribeTeleconsultSession(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
