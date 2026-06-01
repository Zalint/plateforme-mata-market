'use client';

import { OFFER_STATUS_LABEL_FR, OFFER_STATUSES, type OfferStatus } from '@mata/shared/constants';
import { FilterChip, Icon, OfferCard, usePrompt, useToast } from '@mata/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useAdminOffers,
  useCategories,
  useRejectOffer,
  useRequestChangesOffer,
  useValidateOffer,
} from '../../../../src/lib/api';

/**
 * Admin / Offers · queue de validation des offres.
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/OFFERS.
 */
const FILTERS: (OfferStatus | 'all')[] = ['all', ...OFFER_STATUSES];

export default function AdminOffersPage(): React.JSX.Element {
  const [status, setStatus] = useState<OfferStatus | 'all'>('all');
  const { data, isLoading } = useAdminOffers({
    page: 1,
    limit: 50,
    status: status === 'all' ? undefined : status,
  });
  const { data: catData } = useCategories();
  const emojiBySlug = useMemo(
    () => new Map((catData?.categories ?? []).map((c) => [c.slug, c.emoji])),
    [catData],
  );
  const validate = useValidateOffer();
  const reject = useRejectOffer();
  const requestChanges = useRequestChangesOffer();
  const prompt = usePrompt();
  const toast = useToast();

  const offers = data?.offers ?? [];

  async function handleReject(id: string): Promise<void> {
    const reason = await prompt({
      title: "Refuser l'offre",
      message: 'Raison du refus ? (5 caractères min)',
      confirmLabel: 'Refuser',
      minLength: 5,
    });
    if (!reason) return;
    await reject.mutateAsync({ id, reason });
    toast.success('Offre refusée.');
  }

  async function handleRequestChanges(id: string): Promise<void> {
    const reason = await prompt({
      title: 'Demander des corrections',
      message: 'Expliquez au producteur ce qui doit être corrigé (l’offre lui sera renvoyée).',
      placeholder: 'Ex : la photo est floue, le prix semble trop élevé pour la saison…',
      confirmLabel: 'Renvoyer pour correction',
      multiline: true,
      minLength: 5,
      maxLength: 1000,
    });
    if (!reason) return;
    await requestChanges.mutateAsync({ id, reason });
    toast.success('Offre renvoyée au producteur pour correction.');
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Validation des offres</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {data?.meta.total ?? 0} offre{(data?.meta.total ?? 0) > 1 ? 's' : ''} dans ce filtre
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
        {FILTERS.map((s) => (
          <FilterChip key={s} selected={status === s} onClick={() => setStatus(s)}>
            {s === 'all' ? 'Toutes' : OFFER_STATUS_LABEL_FR[s]}
          </FilterChip>
        ))}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && offers.length === 0 && (
        <p className="text-sm text-stone-500 py-8 text-center">Aucune offre dans ce filtre.</p>
      )}

      <div className="space-y-3">
        {offers.map((o) => (
          <OfferCard
            key={o.id}
            category={o.category}
            emoji={emojiBySlug.get(o.category)}
            status={o.status}
            title={o.title}
            unit={o.unit}
            quantity={o.quantity}
            priceFcfa={o.priceFcfa}
            siteName={`${o.siteName} · ${o.producerDisplayName}`}
            subtitle={o.submittedAt ? `Soumise le ${formatDate(o.submittedAt)}` : undefined}
            rejectionReason={o.rejectionReason}
          >
            <Link
              href={`/producer/offers/${o.id}`}
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-mata-700"
            >
              <Icon name="eye" className="w-3.5 h-3.5" /> Voir les détails
            </Link>
            {o.status === 'pending' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => validate.mutate(o.id)}
                    disabled={validate.isPending}
                    className="py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Icon name="check" className="w-4 h-4" /> Valider
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(o.id)}
                    disabled={reject.isPending}
                    className="py-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-mata-700 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Icon name="x" className="w-4 h-4" /> Refuser
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleRequestChanges(o.id)}
                  disabled={requestChanges.isPending}
                  className="w-full py-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Icon name="pencil" className="w-4 h-4" /> Demander des corrections
                </button>
              </div>
            )}
          </OfferCard>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
