'use client';

import { Icon } from '@mata/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * Producer / Code temporaire · WF3-2 du mockup (workflows/teleconseil/2).
 *
 * Affiche le code 6 chiffres genere a l'etape precedente (passe en query
 * string). Countdown 15 min. Le code n'est pas re-fetched : il est unique
 * a cet ecran. Refresh = invalide (le producteur doit en redemander un).
 */

export default function ProducerHelpCodePage(): React.JSX.Element {
  return (
    <Suspense fallback={<Loading />}>
      <ProducerHelpCodeInner />
    </Suspense>
  );
}

function Loading(): React.JSX.Element {
  return <div className="p-8 text-center text-sm text-stone-500">Chargement…</div>;
}

function ProducerHelpCodeInner(): React.JSX.Element {
  const params = useSearchParams();
  const code = params?.get('code') ?? null;
  const expiresAtStr = params?.get('expiresAt') ?? null;
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    if (!expiresAtStr) return 0;
    return Math.max(0, new Date(expiresAtStr).getTime() - Date.now());
  });

  useEffect(() => {
    if (!expiresAtStr) return;
    const t = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(expiresAtStr).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAtStr]);

  if (!code) {
    return (
      <div className="px-4 py-8 max-w-md mx-auto">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-6 text-center">
          <Icon name="alert-triangle" className="w-12 h-12 text-amber-700 mx-auto" />
          <h1 className="text-lg font-bold text-stone-900 mt-3">Code manquant</h1>
          <p className="text-sm text-stone-500 mt-1">
            Demandez un nouveau code depuis la page d&apos;aide.
          </p>
          <Link
            href="/producer/help"
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold"
          >
            <Icon name="arrow-left" className="w-4 h-4" /> Retour
          </Link>
        </div>
      </div>
    );
  }

  const expired = remainingMs <= 0;
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const timer = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
          <Icon name="key-round" className="w-4 h-4 text-amber-700" />
          <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
            Code temporaire · Cote producteur
          </span>
        </div>

        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-mata-700 mx-auto flex items-center justify-center shadow-card">
            <Icon name="headphones" className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mt-4">Donnez ce code au conseiller</h2>
          <p className="text-sm text-stone-600 mt-1">
            Lisez les 6 chiffres a votre conseiller MATA au telephone
          </p>

          <div className="mt-6 flex justify-center gap-2">
            {code.split('').map((digit, idx) => (
              <div
                key={`${idx}-${digit}`}
                className={
                  idx === 3
                    ? 'ml-2 w-12 h-16 rounded-xl bg-stone-50 border-2 border-stone-200 flex items-center justify-center text-2xl font-extrabold text-stone-900 tabular shadow-soft'
                    : 'w-12 h-16 rounded-xl bg-stone-50 border-2 border-stone-200 flex items-center justify-center text-2xl font-extrabold text-stone-900 tabular shadow-soft'
                }
              >
                {digit}
              </div>
            ))}
          </div>

          <div
            className={
              expired
                ? 'mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200'
                : 'mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-mata-50 border border-mata-200'
            }
          >
            <Icon
              name="timer"
              className={expired ? 'w-4 h-4 text-red-700' : 'w-4 h-4 text-mata-700'}
            />
            <span
              className={
                expired
                  ? 'text-sm font-bold text-red-800 tabular'
                  : 'text-sm font-bold text-mata-800 tabular'
              }
            >
              {expired ? 'Code expire' : `Expire dans ${timer}`}
            </span>
          </div>

          <div className="mt-5 text-left bg-stone-50 rounded-xl p-4">
            <div className="text-xs font-bold text-stone-900 uppercase tracking-wider mb-3">
              Garanties pendant la session
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Icon name="ban" className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-stone-700">
                  Le conseiller ne peut pas modifier vos coordonnees de paiement
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="eye" className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-stone-700">
                  Vous recevrez la liste des actions effectuees
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="x-circle" className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-stone-700">Vous pouvez interrompre a tout moment</span>
              </div>
            </div>
          </div>

          {expired && (
            <Link
              href="/producer/help"
              className="mt-5 w-full py-3 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold flex items-center justify-center gap-2"
            >
              <Icon name="key-round" className="w-4 h-4" /> Regenerer un code
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
