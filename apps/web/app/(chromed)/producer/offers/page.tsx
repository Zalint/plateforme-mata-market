'use client';

import type { OfferStatus } from '@mata/shared/constants';
import { OFFER_STATUS_LABEL_FR } from '@mata/shared/constants';
import { FilterChip, Icon, OfferCard } from '@mata/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useMyOffers, useMyProducerProfile, useSubmitOffer } from '../../../../src/lib/api';

/**
 * Producer / Offers · liste des offres du producteur connecté.
 *
 * Reproduit la maquette `mockup/index.html` section PRODUCER/OFFERS.
 */

type FilterValue = OfferStatus | 'all';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'validated', label: OFFER_STATUS_LABEL_FR.validated },
  { value: 'pending', label: OFFER_STATUS_LABEL_FR.pending },
  { value: 'draft', label: OFFER_STATUS_LABEL_FR.draft },
  { value: 'suspended', label: OFFER_STATUS_LABEL_FR.suspended },
  { value: 'rejected', label: OFFER_STATUS_LABEL_FR.rejected },
];

export default function ProducerOffersPage(): React.JSX.Element {
  const [filter, setFilter] = useState<FilterValue>('all');
  const { data: profileData, isLoading: profileLoading } = useMyProducerProfile();
  const { data, isLoading, error } = useMyOffers();
  const submitOffer = useSubmitOffer();

  if (profileLoading) return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  if (!profileData?.profile) return <NoProfileCta />;

  const all = data?.offers ?? [];
  const filtered = filter === 'all' ? all : all.filter((o) => o.status === filter);
  const countsByStatus = all.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Mes offres</h1>
        <Link
          href="/producer/offers/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-mata-700 hover:bg-mata-800 text-white rounded-xl text-sm font-semibold shadow-soft transition"
        >
          <Icon name="plus" className="w-4 h-4" />
          <span className="hidden sm:inline">Nouvelle offre</span>
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
        {FILTERS.map((f) => {
          const count = f.value === 'all' ? all.length : (countsByStatus[f.value] ?? 0);
          return (
            <FilterChip
              key={f.value}
              selected={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label} · {count}
            </FilterChip>
          );
        })}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-md">
          Erreur de chargement : {error.message}
        </p>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-stone-500">
          <Icon name="package" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm">
            {filter === 'all'
              ? 'Aucune offre pour le moment. Créez votre première offre.'
              : 'Aucune offre dans cette catégorie.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((o) => (
          <OfferCard
            key={o.id}
            category={o.category}
            status={o.status}
            title={o.title}
            unit={o.unit}
            quantity={o.quantity}
            priceFcfa={o.priceFcfa}
            siteName={o.siteName}
            subtitle={o.submittedAt ? `Soumise le ${formatDate(o.submittedAt)}` : 'Brouillon'}
            rejectionReason={o.rejectionReason}
            pending={o.status === 'pending'}
          >
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/producer/offers/${o.id}`}
                className="py-2 rounded-lg border border-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-50 text-center"
              >
                Voir la fiche
              </Link>
              {o.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => submitOffer.mutate(o.id)}
                  disabled={submitOffer.isPending}
                  className="py-2 rounded-lg bg-mata-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  Soumettre
                </button>
              )}
            </div>
          </OfferCard>
        ))}
      </div>
    </div>
  );
}

function NoProfileCta(): React.JSX.Element {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-mata-50 mx-auto flex items-center justify-center">
          <Icon name="user-plus" className="w-7 h-7 text-mata-700" />
        </div>
        <h2 className="text-lg font-bold text-stone-900 mt-3">Créez votre profil producteur</h2>
        <p className="text-sm text-stone-600 mt-1">
          Vous devez d&apos;abord créer votre profil avant de publier des offres.
        </p>
        <Link
          href="/producer/setup"
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 bg-mata-700 hover:bg-mata-800 text-white rounded-xl text-sm font-semibold shadow-soft"
        >
          Créer mon profil <Icon name="arrow-right" className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
