'use client';

import { ORDER_STATUS_LABEL_FR, type OrderStatus } from '@mata/shared/constants';
import { Icon, Money, StatusBadge, type StatusTone } from '@mata/ui';
import Link from 'next/link';
import { useMyOrders } from '../../../../src/lib/api';

/**
 * Client / Mes commandes · liste des commandes du client connecté.
 *
 * Reproduit la maquette `mockup/index.html` section CLIENT/ORDERS (§1479).
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

export default function ClientOrdersPage(): React.JSX.Element {
  const { data, isLoading } = useMyOrders();
  const orders = data?.orders ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900 mb-5">Mes commandes</h1>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && orders.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center">
          <Icon name="package-check" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">Pas encore de commande.</p>
          <Link
            href="/client/catalog"
            className="text-mata-700 font-semibold text-sm mt-3 inline-block"
          >
            Parcourir le catalogue
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/client/orders/${o.id}`}
            className="block bg-white rounded-2xl border border-stone-200 shadow-soft p-4 lg:p-5 hover:shadow-card transition"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-stone-500 tabular">#{o.orderNumber}</span>
                  <StatusBadge tone={TONE[o.status]}>{ORDER_STATUS_LABEL_FR[o.status]}</StatusBadge>
                </div>
                <div className="font-bold text-stone-900 mt-1 truncate">
                  {o.items.map((i) => i.offerTitle).join(' · ')}
                </div>
                <div className="text-xs text-stone-500">
                  {o.deliveryZoneName} · livraison {o.deliverySlotDate}
                </div>
              </div>
              <div className="text-right">
                <Money amount={o.totalFcfa} className="text-lg" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
