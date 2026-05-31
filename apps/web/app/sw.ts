/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from 'serwist';

/**
 * Service worker MATA · précache Next + runtime cache + push web (Lot 7).
 *
 * Référence : CLAUDE.md §G1 (« SW généré par serwist/next-pwa, jamais à la
 * main. Personnalisation via config, pas en éditant le SW »), §G5 (« Push
 * web : endpoints 410 supprimés immédiatement » — géré côté API).
 *
 * Le précache + le runtime cache sont entièrement délégués à serwist. La
 * SEULE personnalisation manuelle autorisée ici est le câblage des
 * évènements `push` / `notificationclick`, que serwist n'orchestre pas.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// ─────────────────────────────────────────────────────────────────
// Push web (Lot 7) — payload émis par l'API via web-push (lib/web-push.ts).
// Forme du payload : { title, body, url, category } (cf. NotificationPayload).

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  category?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    // Payload non-JSON : fallback texte brut pour ne pas perdre la notif.
    payload = { title: 'MATA', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/src/icon.svg',
      badge: '/icons/src/icon.svg',
      tag: payload.category,
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | null)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Si un onglet MATA est déjà ouvert, on le focus + navigue ; sinon ouvre.
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
