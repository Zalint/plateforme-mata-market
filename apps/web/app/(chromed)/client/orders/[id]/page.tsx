'use client';

import { ORDER_STATUS_LABEL_FR, type OrderStatus } from '@mata/shared/constants';
import { Icon, Money, StatusBadge, type StatusTone, useToast } from '@mata/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useCancelOrder,
  useCreatePaymentIntent,
  useOrder,
  useRateProducer,
} from '../../../../../src/lib/api';

/**
 * Client / Détail commande · timeline + items + actions.
 *
 * Reproduit la maquette `mockup/index.html` section CLIENT/ORDER-DETAIL (§1574).
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

const TIMELINE_STEPS: OrderStatus[] = ['created', 'confirmed', 'delivering', 'delivered'];

export default function ClientOrderDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? null;
  const { data: order, isLoading } = useOrder(orderId);
  const cancel = useCancelOrder();
  const createIntent = useCreatePaymentIntent();
  const toast = useToast();
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (isLoading) {
    return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  }
  if (!order) {
    return <p className="px-4 py-8 text-sm text-stone-500">Commande introuvable.</p>;
  }

  const canCancel = order.status === 'created' || order.status === 'confirmed';
  const canPay = order.status === 'created' && order.paymentStatus === 'pending';
  const currentStepIdx = order.status === 'cancelled' ? -1 : TIMELINE_STEPS.indexOf(order.status);

  async function handlePay(): Promise<void> {
    if (!order) return;
    try {
      const result = await createIntent.mutateAsync({ orderId: order.id });
      // Redirect vers Bictorys (pattern MataPay-Payment.html).
      window.location.href = result.paymentUrl;
    } catch (err) {
      toast.error(`Erreur paiement : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleCancel(): Promise<void> {
    if (cancelReason.trim().length < 3) {
      toast.info('Raison obligatoire (3 caractères min).');
      return;
    }
    if (!order) return;
    try {
      await cancel.mutateAsync({ id: order.id, reason: cancelReason.trim() });
      setShowCancel(false);
    } catch {
      // Erreur affichée via cancel.error
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto">
      <Link
        href="/client/orders"
        className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
      >
        <Icon name="arrow-left" className="w-4 h-4" /> Mes commandes
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-stone-500 tabular">#{order.orderNumber}</span>
            <StatusBadge tone={TONE[order.status]}>
              {ORDER_STATUS_LABEL_FR[order.status]}
            </StatusBadge>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900 mt-1">
            {order.status === 'cancelled' ? 'Commande annulée' : 'Suivi de commande'}
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Livraison {order.deliveryZoneName} · {order.deliverySlotDate}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total</div>
          <div className="text-2xl font-bold text-stone-900 tabular">
            <Money amount={order.totalFcfa} bold={false} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <h3 className="font-bold text-stone-900 mb-4">Suivi</h3>
            <div className="space-y-3">
              {TIMELINE_STEPS.map((step, idx) => {
                const reached = currentStepIdx >= idx;
                const isCurrent = currentStepIdx === idx;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        reached ? 'bg-mata-700 text-white' : 'bg-stone-200 text-stone-500'
                      }`}
                    >
                      <Icon name={reached ? 'check' : 'clock'} className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1">
                      <div
                        className={`text-sm font-semibold ${
                          isCurrent
                            ? 'text-mata-700'
                            : reached
                              ? 'text-stone-900'
                              : 'text-stone-400'
                        }`}
                      >
                        {ORDER_STATUS_LABEL_FR[step]}
                      </div>
                    </div>
                  </div>
                );
              })}
              {order.status === 'cancelled' && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stone-100">
                  <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-700">Annulée</div>
                    <div className="text-xs text-stone-500 mt-0.5">{order.cancelReason}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notation des producteurs (commande livrée) */}
          {order.status === 'delivered' && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
              <h3 className="font-bold text-stone-900 mb-1">Noter les producteurs</h3>
              <p className="text-sm text-stone-500 mb-3">
                Votre commande est livrée — partagez votre avis.
              </p>
              <div className="space-y-3">
                {Array.from(
                  new Map(
                    order.items.map((i) => [i.producerUserId, i.producerDisplayName]),
                  ).entries(),
                ).map(([pid, pname]) => (
                  <RatingBlock
                    key={pid}
                    orderId={order.id}
                    producerUserId={pid}
                    producerName={pname}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            <h3 className="font-bold text-stone-900 mb-3">Articles</h3>
            <div className="space-y-2">
              {order.items.map((item) => {
                const snap = item.pricingSnapshot;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl shrink-0">
                      {/* offerTitle ne donne pas la catégorie côté output, on omet */}📦
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-stone-900 text-sm">
                        {item.offerTitle} × {item.quantity}
                      </div>
                      <div className="text-xs text-stone-500">{item.producerDisplayName}</div>
                      <div className="text-[10px] text-stone-400 mt-0.5 tabular">
                        producteur {snap.producerPriceFcfa} + commission {snap.commissionFcfa} +
                        collecte {snap.collectionFcfa} + livraison {snap.deliveryFcfa} + stockage{' '}
                        {snap.storageFcfa} + sécurité {snap.safetyMarginFcfa}
                        {snap.discountFcfa > 0 ? ` − remise ${snap.discountFcfa}` : ''} ={' '}
                        <span className="font-bold text-stone-700">{snap.finalPriceFcfa} F/u</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <Money
                        amount={snap.finalPriceFcfa * item.quantity}
                        className="text-stone-900"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-5 lg:sticky lg:top-20 space-y-3">
            <h3 className="font-bold text-stone-900">Actions</h3>
            <div className="text-xs text-stone-500">
              Adresse : {order.deliveryAddressLine}
              <br />
              Créneau : {order.deliverySlotPeriod === 'morning' ? 'Matin' : 'Après-midi'}
            </div>
            {canPay && (
              <button
                type="button"
                onClick={handlePay}
                disabled={createIntent.isPending}
                className="w-full py-3.5 rounded-lg bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white text-base font-bold flex items-center justify-center gap-2"
              >
                <Icon name="wallet" className="w-5 h-5" />
                {createIntent.isPending ? 'Connexion sécurisée…' : 'Payer maintenant'}
              </button>
            )}
            {canPay && (
              <div className="text-[11px] text-stone-500 text-center">
                Paiement sécurisé Wave · Orange Money · Carte (via Bictorys)
              </div>
            )}
            {createIntent.isError && (
              <div className="text-xs text-red-700 p-2 bg-red-50 rounded-lg border border-red-200">
                {createIntent.error.message}
              </div>
            )}
            {canCancel && !showCancel && (
              <button
                type="button"
                onClick={() => setShowCancel(true)}
                className="w-full py-2.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"
              >
                Annuler la commande
              </button>
            )}
            {showCancel && (
              <div className="space-y-2">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Raison de l'annulation (obligatoire)…"
                  className="w-full p-2 text-sm rounded-lg border border-stone-200 outline-none focus:border-mata-700"
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancel(false)}
                    className="py-2 rounded-lg border border-stone-200 text-stone-700 text-sm"
                  >
                    Garder
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancel.isPending}
                    className="py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:bg-stone-300"
                  >
                    Confirmer annulation
                  </button>
                </div>
                {cancel.isError && (
                  <div className="text-xs text-red-700">{cancel.error.message}</div>
                )}
              </div>
            )}
            <div className="text-[11px] text-stone-400">
              Crée le {new Date(order.createdAt).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bloc de notation d'un producteur pour la commande livrée courante.
 * Sélecteur 1–5 ★ + commentaire optionnel. 1 envoi (idempotent côté serveur :
 * un 2e essai renvoie 409 « déjà noté », affiché en toast).
 */
function RatingBlock({
  orderId,
  producerUserId,
  producerName,
}: {
  orderId: string;
  producerUserId: string;
  producerName: string;
}): React.JSX.Element {
  const rate = useRateProducer();
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  async function submit(): Promise<void> {
    if (stars < 1) {
      toast.info('Choisissez une note (1 à 5 étoiles).');
      return;
    }
    try {
      await rate.mutateAsync({
        producerUserId,
        data: { orderId, stars, comment: comment.trim() || undefined },
      });
      setDone(true);
      toast.success('Merci pour votre note !');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la notation.');
    }
  }

  if (done) {
    return (
      <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 flex items-center gap-2">
        <Icon name="check-circle" className="w-4 h-4" /> {producerName} — noté {stars}/5. Merci !
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-stone-50 border border-stone-100">
      <div className="font-semibold text-stone-900 text-sm">{producerName}</div>
      <div className="flex items-center gap-1 mt-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
            className={`text-2xl leading-none ${n <= stars ? 'text-mata-700' : 'text-stone-300'} hover:text-mata-700`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (optionnel)…"
        rows={2}
        className="mt-2 w-full p-2 text-sm rounded-lg border border-stone-200 outline-none focus:border-mata-700"
      />
      <button
        type="button"
        onClick={submit}
        disabled={rate.isPending}
        className="mt-2 px-4 py-2 rounded-lg bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white text-sm font-bold"
      >
        {rate.isPending ? 'Envoi…' : 'Envoyer ma note'}
      </button>
    </div>
  );
}
