'use client';

import clsx from 'clsx';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icon.js';

/**
 * Système de toast (notifications transitoires) — remplace les `alert()`
 * natifs (BACKLOG [lot-2→lot-9]). Pure React + portail, zéro dépendance
 * (CLAUDE.md C : « composants React purs, pas de shadcn »).
 *
 * Usage :
 *   const toast = useToast();
 *   toast.success('Reversement déclenché.');
 *   toast.error('Échec : ...');
 */

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, { icon: IconName; ring: string; iconColor: string }> = {
  success: { icon: 'check-circle', ring: 'border-l-mata-600', iconColor: 'text-mata-600' },
  error: { icon: 'x-circle', ring: 'border-l-mata-700', iconColor: 'text-mata-700' },
  info: { icon: 'info', ring: 'border-l-stone-400', iconColor: 'text-stone-500' },
};

const AUTO_DISMISS_MS = 4_000;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast doit être utilisé à l’intérieur de <ToastProvider>');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, tone, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}): React.JSX.Element | null {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <section
      // Pile en bas (mobile-first) : zone d'annonce pour lecteurs d'écran.
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      aria-label="Notifications"
    >
      {items.map((t) => {
        const style = TONE_STYLE[t.tone];
        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-l-4 border-stone-200 bg-white px-4 py-3 shadow-lifted',
              style.ring,
            )}
          >
            <Icon name={style.icon} className={clsx('mt-0.5 size-5 shrink-0', style.iconColor)} />
            <p className="flex-1 text-sm font-medium text-stone-700">{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
              aria-label="Fermer la notification"
            >
              <Icon name="x" className="size-4" />
            </button>
          </div>
        );
      })}
    </section>,
    document.body,
  );
}
