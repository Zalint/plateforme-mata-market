'use client';

import { Icon } from '@mata/ui';
import Link from 'next/link';
import { useActiveTeleconsultSession } from '../lib/api';

/**
 * Bandeau global · injecte dans AppShell quand une session teleconseil est
 * active cote teleconseiller / admin.
 *
 * Reproduit mockup §2947 ("Vous agissez pour Mor Diop. Toutes les actions
 * sont journalisees et lui seront notifiees.").
 *
 * Le hook `useActiveTeleconsultSession` poll /v1/teleconsult/sessions/active
 * toutes les 30s et maintient le storage singleton qui injecte
 * `X-Teleconsult-Session-Id` sur toutes les mutations metier.
 */
export function TeleconsultBanner(): React.JSX.Element | null {
  const { data: session } = useActiveTeleconsultSession();
  if (!session) return null;

  return (
    <div className="bg-amber-50 border-b-2 border-amber-300 px-4 py-2 flex items-center gap-3 flex-wrap">
      <Icon name="eye" className="w-4 h-4 text-amber-700 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-bold text-amber-900">
          Vous agissez pour {session.producer.displayName}.
        </span>{' '}
        <span className="text-amber-800">Toutes les actions sont journalisees.</span>
      </div>
      <Link
        href="/admin/teleconseil"
        className="px-3 py-1 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
      >
        Voir la session
      </Link>
    </div>
  );
}
