'use client';

import {
  CATEGORY_EMOJI,
  DELIVERY_PERIOD_LABEL_FR,
  DELIVERY_PERIODS,
  type DeliveryPeriod,
  type ProductCategory,
} from '@mata/shared/constants';
import { Icon, Money } from '@mata/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCatalogOffers, useCreateOrder, useZones } from '../../../../src/lib/api';
import { useCart } from '../../../../src/lib/cart/use-cart';

/**
 * Client / Panier · récap items + livraison + bouton "Valider la commande".
 *
 * Reproduit la maquette `mockup/index.html` section CLIENT/CART (§1380).
 *
 * Le panier vit en `localStorage` (`useCart`). Au moment du checkout :
 *  1. Génère un `X-Idempotency-Key` (UUID v4 crypto.randomUUID)
 *  2. POST /v1/orders avec items + adresse + créneau livraison
 *  3. Si succès : vide le panier, redirige vers /client/orders/[id]
 *  4. Replay (même key) → 200 avec même body, pas de doublon
 */

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ClientCartPage(): React.JSX.Element {
  const router = useRouter();
  const cart = useCart();

  // Catalog batch : on charge tout (limite 50) et on indexe par id.
  // Suffisant pour MVP (cf. décision section Catalog Lot 2).
  const { data: catalogData } = useCatalogOffers({ page: 1, limit: 50 });
  const offersById = useMemo(() => {
    const all = catalogData?.offers ?? [];
    type Offer = (typeof all)[number];
    const m = new Map<string, Offer>();
    for (const o of all) m.set(o.id, o);
    return m;
  }, [catalogData]);

  const { data: zonesData } = useZones();
  const zones = zonesData?.zones ?? [];

  // Formulaire livraison
  const [zoneId, setZoneId] = useState<string>('');
  const [addressLine, setAddressLine] = useState<string>('');
  const [slotDate, setSlotDate] = useState<string>(tomorrowISO());
  const [slotPeriod, setSlotPeriod] = useState<DeliveryPeriod>('morning');

  const createOrder = useCreateOrder();

  // Récap calculé localement (le serveur revalidera tout).
  const lines = cart.items
    .map((item) => {
      const offer = offersById.get(item.offerId);
      if (!offer) return null;
      return {
        item,
        offer,
        lineFcfa: offer.priceFcfa * item.quantity,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const subtotalFcfa = lines.reduce((s, l) => s + l.lineFcfa, 0);

  const canSubmit =
    lines.length > 0 && zoneId !== '' && addressLine.trim().length >= 3 && !createOrder.isPending;

  async function handleSubmit(): Promise<void> {
    const idempotencyKey = crypto.randomUUID();
    try {
      const order = await createOrder.mutateAsync({
        idempotencyKey,
        body: {
          items: cart.items,
          delivery: {
            zoneId,
            addressLine: addressLine.trim(),
            slotDate,
            slotPeriod,
          },
        },
      });
      cart.clear();
      router.push(`/client/orders/${order.id}`);
    } catch {
      // Erreur affichée via createOrder.error
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto">
      <Link
        href="/client/catalog"
        className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
      >
        <Icon name="arrow-left" className="w-4 h-4" /> Continuer mes achats
      </Link>
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900 mb-5">Ma commande</h1>

      {lines.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center">
          <Icon name="shopping-cart" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">
            Ton panier est vide.{' '}
            <Link href="/client/catalog" className="text-mata-700 font-semibold">
              Parcourir le catalogue
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-3">
            {lines.map(({ item, offer, lineFcfa }) => (
              <div
                key={item.offerId}
                className="bg-white rounded-2xl p-4 shadow-soft border border-stone-200 flex items-center gap-3"
              >
                <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center text-3xl shrink-0">
                  {CATEGORY_EMOJI[offer.category as ProductCategory]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-stone-900 text-sm">
                    {offer.title} × {item.quantity}
                  </div>
                  <div className="text-xs text-stone-500">
                    {offer.producer.displayName} · {offer.site.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() => cart.setQuantity(item.offerId, item.quantity - 1)}
                      className="w-6 h-6 rounded-md border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-bold"
                    >
                      −
                    </button>
                    <span className="text-xs text-stone-700 tabular w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.setQuantity(item.offerId, item.quantity + 1)}
                      className="w-6 h-6 rounded-md border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <Money amount={lineFcfa} className="text-stone-900" />
                  <button
                    type="button"
                    onClick={() => cart.remove(item.offerId)}
                    className="block text-stone-400 hover:text-mata-700 mt-1 ml-auto"
                    aria-label="Retirer du panier"
                  >
                    <Icon name="trash-2" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Livraison */}
            <div className="bg-white rounded-2xl shadow-soft border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 font-bold text-stone-900 flex items-center gap-2">
                <Icon name="map-pin" className="w-4 h-4 text-mata-700" /> Adresse de livraison
              </div>
              <div className="p-4 space-y-3">
                <select
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="w-full p-3 rounded-lg border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-900 outline-none focus:border-mata-700"
                >
                  <option value="">— Choisir la zone de livraison —</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.region})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="Adresse précise (rue, repère...)"
                  className="w-full p-3 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-900 outline-none focus:border-mata-700"
                />
              </div>
            </div>

            {/* Date + créneau */}
            <div className="grid grid-cols-2 gap-3">
              <label className="p-3 rounded-xl border-2 border-mata-700 bg-mata-50 cursor-pointer">
                <div className="text-[10px] text-mata-700 font-semibold uppercase tracking-wider">
                  Date livraison
                </div>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="font-bold text-stone-900 text-sm mt-0.5 bg-transparent outline-none w-full"
                />
              </label>
              <label className="p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
                <div className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider">
                  Créneau
                </div>
                <select
                  value={slotPeriod}
                  onChange={(e) => setSlotPeriod(e.target.value as DeliveryPeriod)}
                  className="font-bold text-stone-900 text-sm mt-0.5 bg-transparent outline-none w-full"
                >
                  {DELIVERY_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {DELIVERY_PERIOD_LABEL_FR[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Récap */}
          <div>
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-5 lg:sticky lg:top-20">
              <h3 className="font-bold text-stone-900 mb-3">Récapitulatif</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-stone-600">
                    Sous-total ({cart.totalCount} article{cart.totalCount > 1 ? 's' : ''})
                  </span>
                  <Money amount={subtotalFcfa} className="text-stone-900" />
                </div>
                <div className="text-[11px] text-stone-500">
                  Frais MATA (commission + collecte + livraison + stockage + marge sécurité)
                  calculés au moment de la validation.
                </div>
              </div>
              <div className="border-t border-stone-100 mt-3 pt-3 flex items-center justify-between">
                <span className="font-bold text-stone-900">Total estimé</span>
                <span className="text-2xl font-bold text-mata-800 tabular">
                  <Money amount={subtotalFcfa} bold={false} />
                </span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                Le total exact est figé côté serveur (pricing snapshot par item).
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="mt-5 w-full py-3 rounded-xl bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white font-bold flex items-center justify-center gap-2 shadow-soft transition"
              >
                {createOrder.isPending ? 'Validation…' : 'Valider la commande'}{' '}
                <Icon name="arrow-right" className="w-5 h-5" />
              </button>
              {createOrder.isError && (
                <div className="mt-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-md">
                  {createOrder.error.message}
                </div>
              )}
              <div className="mt-3 text-xs text-stone-500 text-center flex items-center justify-center gap-1.5">
                <Icon name="shield-check" className="w-3.5 h-3.5" /> Paiement à la livraison (Lot 5)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
