'use client';

import {
  isValidOrderTransition,
  ORDER_STATUS_LABEL_FR,
  ORDER_STATUSES,
  type OrderStatus,
} from '@mata/shared/constants';
import { FilterChip, Icon, Money, StatusBadge, type StatusTone, usePrompt } from '@mata/ui';
import { useState } from 'react';
import { useAdminOrders, useCancelOrder, useTransitionOrderStatus } from '../../../../src/lib/api';

/**
 * Admin / Commandes · queue + boutons transitions.
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/ORDERS (§2375).
 *
 * L'admin pilote tout le cycle au Lot 4 :
 *  created → confirmed → collecting → collected → stored → delivering → delivered.
 * Cancel possible depuis created ou confirmed seulement (state machine).
 *
 * Lot 7 (tournées) introduira la transition `collected` automatique
 * (scan QR par le MLC) — pour l'instant tout est manuel.
 */

const TONE: Record<OrderStatus, StatusTone> = {
  created: 'neutral',
  confirmed: 'success',
  collecting: 'warning',
  collected: 'info',
  stored: 'neutral',
  delivering: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

const FILTERS: (OrderStatus | 'all')[] = ['all', ...ORDER_STATUSES];

// Transitions de collecte pilotées par la TOURNÉE (pickup-service), pas par
// l'admin ici : créer/avancer/annuler une tournée fait suivre le statut commande
// automatiquement. On masque donc ces boutons (sinon double pilotage / dérive).
const PICKUP_DRIVEN_TRANSITIONS: ReadonlySet<string> = new Set([
  'confirmed→collecting',
  'collecting→collected',
  'collecting→confirmed',
]);

export default function AdminOrdersPage(): React.JSX.Element {
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const { data, isLoading } = useAdminOrders(filter === 'all' ? undefined : filter);
  const transition = useTransitionOrderStatus();
  const cancel = useCancelOrder();
  const prompt = usePrompt();
  const orders = data?.orders ?? [];

  async function handleCancel(id: string): Promise<void> {
    const reason = await prompt({
      title: 'Annuler la commande',
      message: "Raison de l'annulation ? (3 caractères min)",
      confirmLabel: 'Annuler la commande',
      cancelLabel: 'Retour',
      minLength: 3,
    });
    if (!reason) return;
    await cancel.mutateAsync({ id, reason });
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Commandes</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {orders.length} commande{orders.length > 1 ? 's' : ''} dans ce filtre
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
        {FILTERS.map((f) => (
          <FilterChip key={f} selected={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Toutes' : ORDER_STATUS_LABEL_FR[f]}
          </FilterChip>
        ))}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && orders.length === 0 && (
        <p className="text-sm text-stone-500 py-8 text-center">Aucune commande dans ce filtre.</p>
      )}

      <div className="space-y-3">
        {orders.map((o) => {
          const nextStates = ORDER_STATUSES.filter(
            (s) =>
              s !== 'cancelled' &&
              isValidOrderTransition(o.status, s) &&
              !PICKUP_DRIVEN_TRANSITIONS.has(`${o.status}→${s}`),
          );
          const canCancel = isValidOrderTransition(o.status, 'cancelled');
          return (
            <div
              key={o.id}
              className="bg-white rounded-2xl border border-stone-200 shadow-soft p-4 lg:p-5"
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-stone-500 tabular">
                      #{o.orderNumber}
                    </span>
                    <StatusBadge tone={TONE[o.status]}>
                      {ORDER_STATUS_LABEL_FR[o.status]}
                    </StatusBadge>
                  </div>
                  <div className="font-bold text-stone-900 mt-1">
                    {o.clientDisplayName ?? '— guest —'} ·{' '}
                    <span className="text-stone-500 font-normal">{o.items.length} item(s)</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    {o.deliveryZoneName} · livraison {o.deliverySlotDate} (
                    {o.deliverySlotPeriod === 'morning' ? 'matin' : 'après-midi'})
                  </div>
                </div>
                <div className="text-right">
                  <Money amount={o.totalFcfa} className="text-lg" />
                </div>
              </div>

              {/* Items condensés */}
              <div className="mt-3 text-xs text-stone-600 truncate">
                {o.items
                  .map((i) => `${i.offerTitle} × ${i.quantity} (${i.producerDisplayName})`)
                  .join(' · ')}
              </div>

              {/* Actions */}
              {(nextStates.length > 0 || canCancel) && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {nextStates.map((next) => {
                    // Retire un préfixe "en " ou "En " du label pour éviter
                    // "Passer en en collecte" / "Passer en en livraison".
                    const rawLabel = ORDER_STATUS_LABEL_FR[next];
                    const label = rawLabel.replace(/^en\s+/i, '').toLowerCase();
                    return (
                      <button
                        key={next}
                        type="button"
                        onClick={() => transition.mutate({ id: o.id, to: next })}
                        disabled={transition.isPending}
                        className="px-3 py-1.5 rounded-lg bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Icon name="arrow-right" className="w-3 h-3" /> Passer en {label}
                      </button>
                    );
                  })}
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => handleCancel(o.id)}
                      disabled={cancel.isPending}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
