'use client';

import clsx from 'clsx';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Dialogues modaux — remplacent `confirm()` et `prompt()` natifs
 * (BACKLOG [lot-2→lot-9]). Pure React + portail, API promise :
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: 'Archiver ce site ?' }))) return;
 *
 *   const prompt = usePrompt();
 *   const reason = await prompt({ message: "Raison de l'annulation ?", minLength: 3 });
 *   if (!reason) return;
 *
 * A11y : `role="dialog"` + `aria-modal`, fermeture Échap, focus initial,
 * clic backdrop = annulation.
 */

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (défaut) = rouge mata ; `neutral` = action non destructive. */
  tone?: 'danger' | 'neutral';
};

type PromptOptions = {
  title?: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Longueur minimale (trim) requise pour activer le bouton. Défaut 1. */
  minLength?: number;
  initialValue?: string;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type PromptFn = (options: PromptOptions) => Promise<string | null>;

type DialogApi = { confirm: ConfirmFn; prompt: PromptFn };

const DialogContext = createContext<DialogApi | null>(null);

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

function useDialogApi(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useConfirm/usePrompt doit être utilisé dans <ConfirmProvider>');
  }
  return ctx;
}

export function useConfirm(): ConfirmFn {
  return useDialogApi().confirm;
}

export function usePrompt(): PromptFn {
  return useDialogApi().prompt;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [pending, setPending] = useState<Pending | null>(null);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => setPending({ kind: 'confirm', options, resolve })),
      prompt: (options) =>
        new Promise<string | null>((resolve) => setPending({ kind: 'prompt', options, resolve })),
    }),
    [],
  );

  const close = useCallback(() => setPending(null), []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && <DialogModal pending={pending} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogModal({
  pending,
  onClose,
}: {
  pending: Pending;
  onClose: () => void;
}): React.JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const messageId = useId();
  const [value, setValue] = useState(
    pending.kind === 'prompt' ? (pending.options.initialValue ?? '') : '',
  );

  const cancel = useCallback(() => {
    if (pending.kind === 'confirm') pending.resolve(false);
    else pending.resolve(null);
    onClose();
  }, [pending, onClose]);

  useEffect(() => {
    if (pending.kind === 'prompt') inputRef.current?.focus();
    else confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending.kind, cancel]);

  if (typeof document === 'undefined') return null;

  const { options } = pending;
  const tone = pending.kind === 'confirm' ? (pending.options.tone ?? 'danger') : 'neutral';
  const minLength = pending.kind === 'prompt' ? (pending.options.minLength ?? 1) : 0;
  const canConfirm = pending.kind === 'confirm' || value.trim().length >= minLength;

  function accept(): void {
    if (pending.kind === 'confirm') {
      pending.resolve(true);
    } else {
      const trimmed = value.trim();
      if (trimmed.length < minLength) return;
      pending.resolve(trimmed);
    }
    onClose();
  }

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay ; la fermeture clavier est assurée par Échap (cf. useEffect keydown) + bouton Annuler ; le clic backdrop est un raccourci souris optionnel.
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={options.title ? titleId : undefined}
        aria-describedby={messageId}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lifted"
      >
        {options.title && (
          <h2 id={titleId} className="mb-2 text-base font-bold text-stone-900">
            {options.title}
          </h2>
        )}
        <p id={messageId} className="text-sm text-stone-600">
          {options.message}
        </p>
        {pending.kind === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') accept();
            }}
            placeholder={pending.options.placeholder}
            className="mt-3 w-full rounded-lg border-2 border-stone-200 px-3 py-2 text-sm outline-none focus:border-mata-700"
          />
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={cancel}
            className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-50"
          >
            {options.cancelLabel ?? 'Annuler'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={accept}
            disabled={!canConfirm}
            className={clsx(
              'flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40',
              tone === 'danger'
                ? 'bg-mata-700 hover:bg-mata-800'
                : 'bg-stone-900 hover:bg-stone-800',
            )}
          >
            {options.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
