'use client';

import { Icon } from '@mata/ui';
import { useState } from 'react';
import { useSubscribeToPush } from '../lib/api';
import { isPushSupported, pushPermission } from '../lib/push/web-push-client';

/**
 * Invite à activer les notifications push — affichée APRÈS une action
 * signifiante (CLAUDE.md §G1 : « Permission push demandée APRÈS action
 * signifiante côté front, jamais au chargement »).
 *
 * Le composant ne s'affiche QUE si :
 *  - le navigateur supporte le push,
 *  - la permission est encore `default` (ni accordée ni refusée),
 *  - l'utilisateur ne l'a pas masquée dans cette session.
 *
 * Il est monté par les écrans métier au moment opportun (ex : producteur qui
 * vient de consulter ses collectes / commandes reçues), pas dans un layout.
 */

const DISMISS_KEY = 'mata.push-prompt.dismissed';

type Props = {
  /** Phrase de contexte expliquant POURQUOI activer (ex: pour quel évènement). */
  reason?: string;
};

export function NotificationPermissionPrompt({ reason }: Props): React.JSX.Element | null {
  const subscribe = useSubscribeToPush();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  });
  const [refused, setRefused] = useState(false);

  // Décision d'affichage : seulement support + permission `default`.
  const permission = pushPermission();
  if (dismissed || !isPushSupported() || permission !== 'default' || subscribe.data === true) {
    return null;
  }

  function handleDismiss(): void {
    window.sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  async function handleEnable(): Promise<void> {
    const ok = await subscribe.mutateAsync();
    if (!ok) setRefused(true);
  }

  return (
    <div className="bg-mata-50 border border-mata-200 rounded-2xl p-4 flex items-start gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-mata-100 flex items-center justify-center shrink-0">
        <Icon name="bell" className="w-5 h-5 text-mata-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-stone-900 text-sm">Activer les notifications</div>
        <p className="text-xs text-stone-600 mt-0.5">
          {reason ?? 'Soyez prévenu en temps réel des nouveautés sur votre compte MATA.'}
        </p>
        {refused && (
          <p className="text-xs text-amber-700 mt-1">
            Permission refusée ou indisponible — vous pourrez réessayer depuis votre profil.
          </p>
        )}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={subscribe.isPending}
            className="px-3 py-1.5 rounded-lg bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white text-xs font-bold"
          >
            {subscribe.isPending ? 'Activation…' : 'Activer'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 text-xs font-semibold"
          >
            Plus tard
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-stone-400 hover:text-stone-700 shrink-0"
        aria-label="Fermer"
      >
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  );
}
