'use client';

import { Icon } from '@mata/ui';
import { useEffect, useState } from 'react';
import {
  useActiveTeleconsultSession,
  useCloseTeleconsultSession,
  useStartTeleconsultSession,
} from '../../../../src/lib/api';

/**
 * Admin / Teleconseil · reproduit mockup §2888 (admin/teleconseil).
 *
 * Deux etats :
 *  - Pas de session active : form de demarrage (username + 6 inputs code)
 *  - Session active : layout 3 colonnes (card producteur + permissions +
 *    bandeau + acces offres + journal)
 */

export default function AdminTeleconseilPage(): React.JSX.Element {
  const { data: active, isLoading } = useActiveTeleconsultSession();
  const start = useStartTeleconsultSession();
  const close = useCloseTeleconsultSession();

  const [username, setUsername] = useState('');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const DIGIT_KEYS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'] as const;

  function setDigit(idx: number, val: string): void {
    const clean = val.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    if (clean) {
      // Auto-focus suivant.
      const nextInput = document.getElementById(`tc-digit-${idx + 1}`);
      nextInput?.focus();
    }
  }

  async function handleStart(): Promise<void> {
    const code = digits.join('');
    if (code.length !== 6 || !username.trim()) {
      alert('Saisis le username producteur + les 6 chiffres');
      return;
    }
    try {
      await start.mutateAsync({ producerUsername: username.trim(), code });
      setDigits(['', '', '', '', '', '']);
      setUsername('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleClose(): Promise<void> {
    if (!active) return;
    if (!confirm('Fermer la session en cours ?')) return;
    await close.mutateAsync({ sessionId: active.id });
  }

  if (isLoading) {
    return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Session teleconseiller</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Acces delegue securise par code temporaire
          </p>
        </div>
        {active && (
          <div className="flex items-center gap-2 flex-wrap">
            <ExpiryBadge expiresAt={active.expiresAt} />
            <button
              type="button"
              onClick={handleClose}
              disabled={close.isPending}
              className="px-3 py-2 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Fermer
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          {active ? (
            <ActiveProducerCard
              producerName={active.producer.displayName}
              producerPhone={active.producer.phone}
              expiresAt={active.expiresAt}
              sessionNumber={active.sessionNumber}
            />
          ) : null}

          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-soft">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
              {active ? 'Session deja active' : 'Nouvelle session'}
            </div>
            {active ? (
              <p className="text-xs text-stone-600 mt-1.5">
                Fermez la session en cours pour en demarrer une nouvelle.
              </p>
            ) : (
              <>
                <p className="text-xs text-stone-600 mt-1.5">
                  Demandez au producteur de cliquer sur &quot;Me faire aider&quot; pour voir un code
                  a l&apos;ecran, puis saisissez-le ici.
                </p>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="username producteur (ex: mor.diop)"
                  className="mt-3 w-full px-3 py-2 border-2 border-stone-200 rounded-md outline-none focus:border-mata-700 text-sm"
                />
                <div className="mt-3 flex gap-1.5 justify-center">
                  {DIGIT_KEYS.map((k, idx) => (
                    <input
                      key={k}
                      id={`tc-digit-${idx}`}
                      maxLength={1}
                      inputMode="numeric"
                      value={digits[idx] ?? ''}
                      onChange={(e) => setDigit(idx, e.target.value)}
                      className="w-9 h-11 text-center border-2 border-stone-200 rounded-md text-lg font-bold outline-none focus:border-mata-700"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={start.isPending}
                  className="mt-3 w-full py-2.5 rounded-lg bg-stone-900 hover:bg-black text-white text-sm font-semibold disabled:opacity-50"
                >
                  {start.isPending ? 'Demarrage…' : 'Valider le code'}
                </button>
                {start.isError && (
                  <div className="mt-2 text-xs text-red-700 p-2 bg-red-50 rounded border border-red-200">
                    {start.error.message}
                  </div>
                )}
              </>
            )}
          </div>

          <PermissionsCard />
        </div>

        <div className="lg:col-span-2 space-y-4">
          {active ? (
            <>
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-center gap-3">
                <Icon name="eye" className="w-5 h-5 text-amber-700 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-bold text-amber-900">
                    Vous agissez pour {active.producer.displayName}.
                  </span>{' '}
                  <span className="text-amber-800">
                    Toutes les actions sont journalisees et lui seront notifiees.
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 shadow-soft p-5">
                <h3 className="font-bold text-stone-900 mb-3">Acces delegue</h3>
                <p className="text-sm text-stone-600">
                  Naviguez vers les ecrans producteur pour agir au nom de{' '}
                  <strong>{active.producer.displayName}</strong>. Toutes vos actions seront loggees
                  avec son nom via le header{' '}
                  <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">
                    X-Teleconsult-Session-Id
                  </code>
                  .
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <a
                    href="/producer/offers"
                    className="px-3 py-2 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-center font-semibold"
                  >
                    Offres de {active.producer.displayName.split(' ')[0]}
                  </a>
                  <a
                    href="/producer/sites"
                    className="px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-center font-semibold"
                  >
                    Ses sites
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 shadow-soft p-8 text-center">
              <Icon name="headphones" className="w-12 h-12 text-stone-300 mx-auto" />
              <p className="text-sm text-stone-500 mt-3">
                Aucune session active. Saisissez le code communique par un producteur pour demarrer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionsCard(): React.JSX.Element {
  return (
    <div className="bg-mata-50 border border-mata-200 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-mata-800 font-semibold flex items-center gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5" /> Permissions
      </div>
      <ul className="mt-2 space-y-1.5 text-xs text-stone-700">
        <li className="flex items-start gap-1.5">
          <Icon name="check" className="w-3.5 h-3.5 text-green-600 mt-0.5" /> Creer/modifier/
          suspendre offre
        </li>
        <li className="flex items-start gap-1.5">
          <Icon name="check" className="w-3.5 h-3.5 text-green-600 mt-0.5" /> Mettre a jour stock et
          prix
        </li>
        <li className="flex items-start gap-1.5">
          <Icon name="check" className="w-3.5 h-3.5 text-green-600 mt-0.5" /> Confirmer ramassage
        </li>
        <li className="flex items-start gap-1.5">
          <Icon name="x" className="w-3.5 h-3.5 text-mata-700 mt-0.5" />{' '}
          <span className="text-stone-500">Coordonnees paiement (refuse)</span>
        </li>
        <li className="flex items-start gap-1.5">
          <Icon name="x" className="w-3.5 h-3.5 text-mata-700 mt-0.5" />{' '}
          <span className="text-stone-500">Suppression compte (refuse)</span>
        </li>
      </ul>
    </div>
  );
}

function ActiveProducerCard({
  producerName,
  producerPhone,
  expiresAt,
  sessionNumber,
}: {
  producerName: string;
  producerPhone: string | null;
  expiresAt: string;
  sessionNumber: string;
}): React.JSX.Element {
  return (
    <div className="bg-stone-900 rounded-xl p-4 text-white shadow-card">
      <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">
        Producteur assiste
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-mata-700 flex items-center justify-center text-lg font-bold">
          {producerName.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="font-bold truncate">{producerName}</div>
          <div className="text-xs text-stone-400 tabular truncate">{producerPhone ?? '—'}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded bg-stone-800">
          <div className="text-stone-500 text-[10px] uppercase">Session</div>
          <div className="font-mono font-bold tabular truncate">{sessionNumber}</div>
        </div>
        <div className="p-2 rounded bg-stone-800">
          <div className="text-stone-500 text-[10px] uppercase">Expire</div>
          <div className="font-bold tabular">
            <ExpiryCountdown expiresAt={expiresAt} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }): React.JSX.Element {
  return (
    <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-xs font-semibold text-green-800 flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
      Session active · expire dans <ExpiryCountdown expiresAt={expiresAt} />
    </div>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }): React.JSX.Element {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return <span className="tabular">{`${m}:${s.toString().padStart(2, '0')}`}</span>;
}
