'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

/**
 * Widget hCaptcha pour le checkout invité (Lot 8).
 *
 * Charge le script officiel hCaptcha en mode `render=explicit` (pas de
 * dépendance npm : on pilote l'API JS documentée `window.hcaptcha`). Le token
 * renvoyé par `callback` est à USAGE UNIQUE — l'appelant le passe au POST
 * `/v1/guest/orders` (le seul endpoint invité gardé par captcha).
 *
 * Référence : CLAUDE.md §G3 (mode invité séparé), §G8 (anti-bot), §E7
 * (`useEffect` réservé aux vrais side effects : ici le chargement + montage
 * d'un widget tiers en est un).
 *
 * Dégradation : si `NEXT_PUBLIC_HCAPTCHA_SITEKEY` est absent, la page ne monte
 * pas ce composant (cf. `guest/checkout/page.tsx`).
 */

interface HcaptchaRenderParams {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

interface HcaptchaApi {
  render: (container: HTMLElement, params: HcaptchaRenderParams) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    hcaptcha?: HcaptchaApi;
  }
}

interface GuestHcaptchaProps {
  sitekey: string;
  /** Appelé avec le token quand l'utilisateur résout le challenge. */
  onVerify: (token: string) => void;
  /** Appelé quand le token expire ou qu'une erreur survient (token invalidé). */
  onExpire: () => void;
}

export function GuestHcaptcha({
  sitekey,
  onVerify,
  onExpire,
}: GuestHcaptchaProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  // Garde les callbacks à jour sans relancer l'effet de montage du widget
  // (qui recréerait l'iframe à chaque rendu du parent).
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Le script peut déjà être chargé (remontage) : `onReady` de <Script> couvre
  // ce cas, mais on détecte aussi le global directement au montage.
  useEffect(() => {
    if (window.hcaptcha) setScriptReady(true);
  }, []);

  useEffect(() => {
    const api = window.hcaptcha;
    const container = containerRef.current;
    if (!scriptReady || !api || !container || widgetIdRef.current !== null) {
      return;
    }
    widgetIdRef.current = api.render(container, {
      sitekey,
      callback: (token: string) => onVerifyRef.current(token),
      'expired-callback': () => onExpireRef.current(),
      'error-callback': () => onExpireRef.current(),
    });
    return () => {
      const id = widgetIdRef.current;
      if (id !== null && window.hcaptcha) {
        window.hcaptcha.remove(id);
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, sitekey]);

  return (
    <>
      <Script
        src="https://js.hcaptcha.com/1/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} />
    </>
  );
}
