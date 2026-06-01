'use client';

import { OFFER_STATUS_LABEL_FR, OFFER_STATUSES, type OfferStatus } from '@mata/shared/constants';
import { FilterChip, Icon, OfferCard, usePrompt, useToast } from '@mata/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  useAdminOfferProducers,
  useAdminOffers,
  useCategories,
  useReactivateOffer,
  useRejectOffer,
  useRequestChangesOffer,
  useRestoreOffer,
  useRetireOffer,
  useSuspendOffer,
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
  const [producerUserId, setProducerUserId] = useState('');
  // Recherche libre debouncée (300 ms) : `qInput` = saisie, `q` = valeur envoyée.
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const { data, isLoading } = useAdminOffers({
    page: 1,
    limit: 50,
    status: status === 'all' ? undefined : status,
    producerUserId: producerUserId || undefined,
    q: q.length >= 2 ? q : undefined, // l'API exige 2 caractères min
  });
  const { data: producersData } = useAdminOfferProducers();
  const producerOptions = producersData?.producers ?? [];
  const { data: catData } = useCategories();
  const emojiBySlug = useMemo(
    () => new Map((catData?.categories ?? []).map((c) => [c.slug, c.emoji])),
    [catData],
  );
  const validate = useValidateOffer();
  const reject = useRejectOffer();
  const requestChanges = useRequestChangesOffer();
  const suspend = useSuspendOffer();
  const reactivate = useReactivateOffer();
  const retire = useRetireOffer();
  const restore = useRestoreOffer();
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

  async function handleRetire(id: string): Promise<void> {
    const reason = await prompt({
      title: "Retirer l'offre",
      message:
        'Retrait unilatéral par MATA. Le producteur ne pourra pas la remettre en ligne — seul MATA pourra la restaurer. Motif (facultatif, visible par le producteur) :',
      placeholder: 'Ex : retrait temporaire, litige en cours…',
      confirmLabel: 'Retirer',
      minLength: 0,
      maxLength: 300,
    });
    if (reason === null) return; // annulé (chaîne vide = retrait sans motif)
    await retire.mutateAsync({ id, reason: reason || undefined });
    toast.success('Offre retirée.');
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

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2"
          />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Rechercher (offre ou producteur)…"
            className="w-full pl-9 pr-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          />
        </div>
        <select
          value={producerUserId}
          onChange={(e) => setProducerUserId(e.target.value)}
          className="px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm bg-white sm:w-56"
        >
          <option value="">Tous les producteurs</option>
          {producerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
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
            {o.status === 'validated' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => suspend.mutate({ id: o.id })}
                  disabled={suspend.isPending}
                  className="py-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Icon name="pause" className="w-4 h-4" /> Suspendre
                </button>
                <button
                  type="button"
                  onClick={() => handleRetire(o.id)}
                  disabled={retire.isPending}
                  className="py-2 rounded-lg bg-white border border-mata-300 hover:bg-mata-50 text-mata-700 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Icon name="ban" className="w-4 h-4" /> Retirer
                </button>
              </div>
            )}
            {o.status === 'suspended' && (
              <button
                type="button"
                onClick={() => reactivate.mutate(o.id)}
                disabled={reactivate.isPending}
                className="w-full py-2 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="eye" className="w-4 h-4" /> Réactiver
              </button>
            )}
            {o.status === 'withdrawn' && (
              <button
                type="button"
                onClick={() => restore.mutate(o.id)}
                disabled={restore.isPending}
                className="w-full py-2 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="arrow-left" className="w-4 h-4" /> Restaurer (rendre au producteur)
              </button>
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
