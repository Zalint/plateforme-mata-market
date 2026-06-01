'use client';

import { OFFER_STATUS_LABEL_FR, OFFER_UNIT_LABEL_FR_PLURAL } from '@mata/shared/constants';
import { Icon, Money, StatusBadge } from '@mata/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { OfferPhotoUploader } from '../../../../../src/components/offer-photo-uploader';
import {
  useOffer,
  useReactivateOffer,
  useSubmitOffer,
  useSuspendOffer,
  useWithdrawOffer,
} from '../../../../../src/lib/api';

/**
 * Producer / Offer Detail · vue d'une offre avec gestion photos + actions
 * de transition selon le statut courant.
 */
export default function ProducerOfferDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const offerId = params.id;
  const { data: offer, isLoading } = useOffer(offerId);
  const submitOffer = useSubmitOffer();
  const withdrawOffer = useWithdrawOffer();
  const suspendOffer = useSuspendOffer();
  const reactivateOffer = useReactivateOffer();

  if (isLoading) return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  if (!offer) return <p className="px-4 py-8 text-sm text-red-700">Offre introuvable.</p>;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <Link
        href="/producer/offers"
        className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
      >
        <Icon name="arrow-left" className="w-4 h-4" /> Mes offres
      </Link>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5 lg:p-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-bold text-stone-900">{offer.title}</h1>
              <StatusBadge
                tone={
                  offer.status === 'validated'
                    ? 'success'
                    : offer.status === 'pending'
                      ? 'warning'
                      : offer.status === 'rejected'
                        ? 'danger'
                        : 'neutral'
                }
              >
                {OFFER_STATUS_LABEL_FR[offer.status]}
              </StatusBadge>
            </div>
            <div className="text-sm text-stone-500 mt-1">{offer.siteName}</div>
            <div className="flex items-baseline gap-3 mt-3">
              <span className="text-2xl font-bold text-stone-900 tabular-nums">
                {offer.quantity}
              </span>
              <span className="text-stone-500">{OFFER_UNIT_LABEL_FR_PLURAL[offer.unit]}</span>
              <span className="text-stone-300">·</span>
              <Money amount={offer.priceFcfa} className="text-2xl font-bold text-stone-900" />
              <span className="text-stone-500 text-sm">FCFA / unité</span>
            </div>
            {offer.qualityNote && (
              <p className="mt-2 text-sm text-stone-600">{offer.qualityNote}</p>
            )}
            {offer.rejectionReason && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-md">
                Refusée : {offer.rejectionReason}
              </p>
            )}
          </div>
        </div>

        {/* Actions selon statut */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {offer.status === 'draft' && (
            <>
              <Link
                href={`/producer/offers/${offer.id}/edit`}
                className="px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-lg text-sm font-semibold hover:bg-stone-50 flex items-center gap-1.5"
              >
                <Icon name="pencil" className="w-4 h-4" /> Modifier
              </Link>
              <button
                type="button"
                onClick={() => submitOffer.mutate(offer.id)}
                disabled={submitOffer.isPending}
                className="px-4 py-2.5 bg-mata-700 hover:bg-mata-800 text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                Soumettre à validation
              </button>
            </>
          )}
          {offer.status === 'pending' && (
            <button
              type="button"
              onClick={() => withdrawOffer.mutate(offer.id)}
              disabled={withdrawOffer.isPending}
              className="px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Repasser en brouillon
            </button>
          )}
          {offer.status === 'validated' && (
            <button
              type="button"
              onClick={() => suspendOffer.mutate({ id: offer.id })}
              disabled={suspendOffer.isPending}
              className="px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Suspendre
            </button>
          )}
          {offer.status === 'suspended' && (
            <button
              type="button"
              onClick={() => reactivateOffer.mutate(offer.id)}
              disabled={reactivateOffer.isPending}
              className="px-4 py-2.5 bg-mata-700 hover:bg-mata-800 text-white rounded-lg text-sm font-bold disabled:opacity-50"
            >
              Réactiver
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <h2 className="font-bold text-stone-900 mb-3">Photos</h2>
        <OfferPhotoUploader offerId={offer.id} existing={offer.photos} />
      </div>
    </div>
  );
}
