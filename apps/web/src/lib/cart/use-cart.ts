'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Panier client · état local persisté en `localStorage`.
 *
 * Décision MVP : pas de table `carts` côté serveur. Le panier est éphémère
 * et persiste seulement entre rechargements du navigateur. Au moment du
 * checkout (POST /v1/orders), les items sont matérialisés en order_items
 * via le service Lot 4.
 *
 * Multi-onglet : le hook écoute l'événement `storage` pour synchroniser
 * deux onglets ouverts du même navigateur.
 *
 * Structure stockée : un tableau d'items `{offerId, quantity}`. Pas de
 * prix mémorisé — chaque rendu re-fetch le prix actuel de l'offre (le
 * snapshot pricing est figé au moment du POST côté serveur).
 */

export interface CartItem {
  offerId: string;
  quantity: number;
}

const STORAGE_KEY = 'mata.cart.v1';

function readStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem);
  } catch {
    return [];
  }
}

function writeStorage(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function isCartItem(x: unknown): x is CartItem {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.offerId === 'string' && typeof o.quantity === 'number' && o.quantity > 0;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  // Hydratation au mount + synchro multi-onglet.
  useEffect(() => {
    setItems(readStorage());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    writeStorage(next);
  }, []);

  const add = useCallback(
    (offerId: string, quantity: number) => {
      const next = [...items];
      const existing = next.find((i) => i.offerId === offerId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        next.push({ offerId, quantity });
      }
      persist(next.filter((i) => i.quantity > 0));
    },
    [items, persist],
  );

  const setQuantity = useCallback(
    (offerId: string, quantity: number) => {
      const next = items
        .map((i) => (i.offerId === offerId ? { ...i, quantity } : i))
        .filter((i) => i.quantity > 0);
      persist(next);
    },
    [items, persist],
  );

  const remove = useCallback(
    (offerId: string) => {
      persist(items.filter((i) => i.offerId !== offerId));
    },
    [items, persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, totalCount, add, setQuantity, remove, clear };
}
