'use client';

import { ORDER_STATUS_LABEL_FR, type OrderStatus } from '@mata/shared/constants';
import { Icon, Money, StatusBadge, type StatusTone } from '@mata/ui';
import { useReceivedOrders } from '../../../../src/lib/api';

/**
 * Producer / Commandes reçues · liste des commandes contenant au moins
 * un order_item du producteur connecté.
 *
 * Reproduit la maquette `mockup/index.html` section PRODUCER/RECEIVED-ORDERS (§815).
 *
 * Lot 4 : le producteur ne déclenche PAS de transition de statut lui-même —
 * c'est l'admin qui confirme et avance le cycle. Le producteur est notifié
 * (Lot 7 ajoutera push web). Cette page reste en lecture seule.
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

export default function ProducerReceivedOrdersPage(): React.JSX.Element {
  const { data, isLoading } = useReceivedOrders();
  const orders = data?.orders ?? [];

  const newCount = orders.filter((o) => o.status === 'created').length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Commandes reçues</h1>
        {newCount > 0 && (
          <span className="text-xs bg-mata-700 text-white px-2 py-0.5 rounded-full font-bold">
            {newCount} nouvelle{newCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && orders.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center">
          <Icon name="inbox" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">Aucune commande reçue pour le moment.</p>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((o) => {
          // Filtre les items du producer connecté pour calculer "Votre part".
          const myItems = o.items; // backend a déjà filtré côté query (some)
          const myTotal = myItems.reduce(
            (s, i) => s + i.pricingSnapshot.producerShareFcfa * i.quantity,
            0,
          );
          return (
            <div
              key={o.id}
              className={`bg-white rounded-2xl ${
                o.status === 'created' ? 'border-2 border-mata-200' : 'border border-stone-200'
              } shadow-soft p-4 lg:p-5`}
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
                    {o.clientDisplayName ?? 'Client'}
                  </div>
                  <div className="text-xs text-stone-500">
                    {o.deliveryZoneName} · Livraison souhaitée {o.deliverySlotDate}
                  </div>
                </div>
                <div className="text-right">
                  <Money amount={myTotal} className="text-lg" />
                  <div className="text-xs text-stone-500">Votre part</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {myItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-3 rounded-xl bg-stone-50">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl shrink-0">
                      📦
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-semibold text-stone-900">
                        {item.offerTitle} × {item.quantity}
                      </div>
                      <div className="text-xs text-stone-500">{item.unitPriceAtOrder} F/unité</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
