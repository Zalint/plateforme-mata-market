import type { PushSubscribe } from '@mata/shared/schemas';

/**
 * Helpers navigateur pour le push web (Lot 7).
 *
 * Référence : CLAUDE.md §G1 (« Permission push demandée APRÈS action
 * signifiante, jamais au chargement »), §G8 (VAPID_PRIVATE_KEY jamais côté
 * client — seule la clé PUBLIQUE est utilisée ici).
 *
 * Le service worker (`app/sw.ts`, généré par serwist) reçoit les push et
 * affiche les notifications. Ce module gère uniquement la souscription côté
 * page : permission → registration → pushManager.subscribe → toJSON.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Convertit la clé VAPID base64url (string) en Uint8Array attendu par
 * `pushManager.subscribe({ applicationServerKey })`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  // serwist enregistre /sw.js automatiquement ; on attend qu'il soit prêt.
  return navigator.serviceWorker.ready;
}

/**
 * Demande la permission (si pas encore accordée), souscrit au push et retourne
 * l'abonnement au format attendu par l'API. Retourne null si non supporté,
 * permission refusée, ou clé VAPID absente. Ne throw pas pour les cas attendus.
 */
export async function subscribeToPush(): Promise<PushSubscribe | null> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await getRegistration();
  if (!registration) return null;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  return subscription.toJSON() as PushSubscribe;
}

/**
 * Désouscrit côté navigateur et retourne l'endpoint retiré (à transmettre à
 * l'API pour purge), ou null si aucun abonnement actif.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  const registration = await getRegistration();
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}
