'use client';

import { Icon, Money } from '@mata/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { usePaymentPolling } from '../../../../src/lib/api';

/**
 * Page de retour après checkout Bictorys.
 *
 * Reproduit le pattern de MataPay-Return.html :
 *  - Lit `?paymentId=` depuis l'URL
 *  - Poll `/v1/payments/:id` toutes les 2s pendant max 30s
 *  - Affiche succès / en attente / erreur selon le statut courant
 *  - Bouton retour vers la commande (toujours visible)
 *
 * Chromeless layout : le client revient d'un site externe (Bictorys), pas
 * besoin de la sidebar admin/producteur.
 */

const MAX_POLLING_MS = 30_000;

export default function PaymentReturnPage(): React.JSX.Element {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PaymentReturnInner />
    </Suspense>
  );
}

function PaymentReturnInner(): React.JSX.Element {
  const params = useSearchParams();
  const paymentId = params?.get('paymentId') ?? null;
  const { data: payment, isLoading, isError } = usePaymentPolling(paymentId);
  const [pollingExpired, setPollingExpired] = useState(false);

  // Arrêt du polling après MAX_POLLING_MS si toujours pending.
  useEffect(() => {
    if (!paymentId) return;
    const t = setTimeout(() => setPollingExpired(true), MAX_POLLING_MS);
    return () => clearTimeout(t);
  }, [paymentId]);

  if (!paymentId) {
    return <ErrorScreen message="Aucun identifiant de paiement dans l'URL." />;
  }
  if (isLoading) {
    return <LoadingScreen />;
  }
  if (isError || !payment) {
    return <ErrorScreen message="Impossible de récupérer le statut du paiement." />;
  }

  if (payment.status === 'paid') {
    return <SuccessScreen orderId={payment.orderId} amountFcfa={payment.amountFcfa} />;
  }
  if (payment.status === 'refunded' || payment.status === 'disputed') {
    return (
      <ErrorScreen
        message={
          payment.status === 'refunded'
            ? 'Paiement remboursé. La commande a été annulée.'
            : 'Paiement contesté. MATA vous contactera.'
        }
        orderId={payment.orderId}
      />
    );
  }

  // status === 'pending' : selon que polling encore actif ou expiré.
  if (pollingExpired) {
    return (
      <ErrorScreen
        message="Paiement non confirmé après 30 secondes. Vérifie ton solde Wave/Orange Money. Si le débit a eu lieu, MATA traitera ta commande dès réception du callback."
        orderId={payment.orderId}
        retry
      />
    );
  }
  return <PendingScreen amountFcfa={payment.amountFcfa} orderId={payment.orderId} />;
}

// ─────────────────────────────────────────────────────────────────
// Écrans

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-stone-50 via-stone-100 to-mata-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 shadow-card p-6 sm:p-8">
        {children}
      </div>
    </main>
  );
}

function LoadingScreen(): React.JSX.Element {
  return (
    <Shell>
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-stone-100 mb-4">
          <Icon name="clock" className="w-7 h-7 text-stone-500 animate-pulse" />
        </div>
        <h1 className="text-lg font-bold text-stone-900">Vérification…</h1>
        <p className="text-sm text-stone-500 mt-1">On contacte Bictorys.</p>
      </div>
    </Shell>
  );
}

function PendingScreen({
  amountFcfa,
  orderId,
}: {
  amountFcfa: number;
  orderId: string;
}): React.JSX.Element {
  return (
    <Shell>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-4">
          <Icon name="clock" className="w-7 h-7 text-amber-700 animate-pulse" />
        </div>
        <h1 className="text-lg font-bold text-stone-900">En attente de confirmation</h1>
        <p className="text-sm text-stone-500 mt-1">
          Bictorys n'a pas encore confirmé ton paiement. On vérifie toutes les 2 secondes.
        </p>
        <div className="mt-5 p-4 rounded-xl bg-stone-50 border border-stone-200">
          <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold">
            Montant
          </div>
          <div className="text-2xl font-bold text-stone-900 tabular mt-1">
            <Money amount={amountFcfa} bold={false} />
          </div>
        </div>
        <Link
          href={`/client/orders/${orderId}`}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold"
        >
          <Icon name="arrow-left" className="w-4 h-4" /> Retour à la commande
        </Link>
      </div>
    </Shell>
  );
}

function SuccessScreen({
  amountFcfa,
  orderId,
}: {
  amountFcfa: number;
  orderId: string;
}): React.JSX.Element {
  return (
    <Shell>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4">
          <Icon name="check-circle" className="w-7 h-7 text-green-700" />
        </div>
        <h1 className="text-lg font-bold text-stone-900">Paiement réussi</h1>
        <p className="text-sm text-stone-500 mt-1">
          Ta commande est confirmée. Les producteurs sont notifiés.
        </p>
        <div className="mt-5 p-4 rounded-xl bg-green-50 border border-green-200">
          <div className="text-xs uppercase tracking-wider text-green-700 font-semibold">Payé</div>
          <div className="text-2xl font-bold text-stone-900 tabular mt-1">
            <Money amount={amountFcfa} bold={false} />
          </div>
        </div>
        <Link
          href={`/client/orders/${orderId}`}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold"
        >
          Voir la commande <Icon name="arrow-right" className="w-4 h-4" />
        </Link>
      </div>
    </Shell>
  );
}

function ErrorScreen({
  message,
  orderId,
  retry = false,
}: {
  message: string;
  orderId?: string;
  retry?: boolean;
}): React.JSX.Element {
  return (
    <Shell>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
          <Icon name="x-circle" className="w-7 h-7 text-red-700" />
        </div>
        <h1 className="text-lg font-bold text-stone-900">Problème de paiement</h1>
        <p className="text-sm text-stone-500 mt-2">{message}</p>
        <div className="mt-5 flex flex-col gap-2">
          {orderId && (
            <Link
              href={`/client/orders/${orderId}`}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold"
            >
              <Icon name="arrow-left" className="w-4 h-4" /> Retour à la commande
            </Link>
          )}
          {retry && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold"
            >
              <Icon name="arrow-right" className="w-4 h-4" /> Vérifier à nouveau
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
