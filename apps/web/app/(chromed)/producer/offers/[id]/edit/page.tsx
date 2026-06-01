'use client';

import { OFFER_UNIT_LABEL_FR, OFFER_UNITS, type OfferUnit } from '@mata/shared/constants';
import type { OfferOutput } from '@mata/shared/schemas';
import { Icon, useToast } from '@mata/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useCategories, useMySites, useOffer, useUpdateOffer } from '../../../../../../src/lib/api';

/**
 * Producer / Offers / [id] / Edit · édition d'une offre.
 *
 * L'édition n'est autorisée QUE sur un brouillon (`draft`) côté API (PATCH
 * rejette 409 sinon). On garde donc l'écran réservé au statut draft : pour
 * modifier une offre publiée, le producteur la repasse d'abord en brouillon.
 */
export default function EditOfferPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const { data: offer, isLoading } = useOffer(params.id);

  if (isLoading) return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  if (!offer) return <p className="px-4 py-8 text-sm text-red-700">Offre introuvable.</p>;

  if (offer.status !== 'draft') {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
        <Link
          href={`/producer/offers/${offer.id}`}
          className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
        >
          <Icon name="arrow-left" className="w-4 h-4" /> Retour à l'offre
        </Link>
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
          Seuls les brouillons sont modifiables. Repassez l'offre en brouillon depuis sa fiche pour
          pouvoir la modifier.
        </p>
      </div>
    );
  }

  return <EditForm offer={offer} />;
}

function EditForm({ offer }: { offer: OfferOutput }): React.JSX.Element {
  const router = useRouter();
  const toast = useToast();
  const { data: sitesData } = useMySites();
  const { data: catData } = useCategories();
  const update = useUpdateOffer();
  const fid = useId();

  const [category, setCategory] = useState(offer.category);
  const [title, setTitle] = useState(offer.title);
  const [unit, setUnit] = useState<OfferUnit>(offer.unit);
  const [quantity, setQuantity] = useState(offer.quantity);
  const [priceFcfa, setPriceFcfa] = useState(offer.priceFcfa);
  const [availableFrom, setAvailableFrom] = useState(offer.availableFrom);
  const [availableUntil, setAvailableUntil] = useState(offer.availableUntil ?? '');
  const [siteId, setSiteId] = useState(offer.siteId);
  const [qualityNote, setQualityNote] = useState(offer.qualityNote ?? '');

  const sites = sitesData?.sites ?? [];
  const categories = catData?.categories ?? [];

  async function handleSave(): Promise<void> {
    try {
      await update.mutateAsync({
        id: offer.id,
        data: {
          siteId,
          category,
          title,
          unit,
          quantity,
          priceFcfa,
          availableFrom,
          availableUntil: availableUntil || null,
          qualityNote: qualityNote || undefined,
        },
      });
      toast.success('Offre mise à jour.');
      router.push(`/producer/offers/${offer.id}`);
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <Link
        href={`/producer/offers/${offer.id}`}
        className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
      >
        <Icon name="arrow-left" className="w-4 h-4" /> Retour à l'offre
      </Link>
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Modifier l'offre</h1>

      {/* Catégorie */}
      <section className="mt-5 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
          Catégorie
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {categories.map((c) => {
            const selected = c.slug === category;
            return (
              <button
                type="button"
                key={c.slug}
                onClick={() => setCategory(c.slug)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-2xl gap-1 transition ${
                  selected
                    ? 'border-2 border-mata-700 bg-mata-50'
                    : 'border border-stone-200 bg-white hover:border-mata-300'
                }`}
              >
                {c.emoji}
                <span className="text-[10px] font-semibold text-stone-700">{c.labelFr}</span>
              </button>
            );
          })}
        </div>
        <label
          htmlFor={`${fid}-title`}
          className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mt-4"
        >
          Titre
        </label>
        <input
          id={`${fid}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1.5 w-full px-4 py-2.5 border-2 border-stone-200 rounded-xl outline-none focus:border-mata-700 text-stone-900 text-sm"
        />
      </section>

      {/* Quantité + prix */}
      <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor={`${fid}-qty`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Quantité
          </label>
          <input
            id={`${fid}-qty`}
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
            className="mt-2 w-full px-4 py-3 border-2 border-stone-200 rounded-xl outline-none focus:border-mata-700 text-stone-900 font-bold tabular-nums"
          />
          <div className="mt-2 flex gap-1 flex-wrap">
            {OFFER_UNITS.map((u) => (
              <button
                type="button"
                key={u}
                onClick={() => setUnit(u)}
                className={`flex-1 py-1.5 rounded-md text-xs ${
                  u === unit
                    ? 'border-2 border-mata-700 bg-mata-50 text-mata-800 font-bold'
                    : 'border border-stone-200 text-stone-600'
                }`}
              >
                {OFFER_UNIT_LABEL_FR[u]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label
            htmlFor={`${fid}-price`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Prix demandé / {OFFER_UNIT_LABEL_FR[unit]}
          </label>
          <div className="mt-2 flex items-center border-2 border-stone-200 rounded-xl overflow-hidden focus-within:border-mata-700">
            <input
              id={`${fid}-price`}
              type="number"
              min={1}
              value={priceFcfa}
              onChange={(e) => setPriceFcfa(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              className="flex-1 px-4 py-3 outline-none text-stone-900 font-bold tabular-nums"
            />
            <span className="px-3 text-stone-500 font-semibold text-sm bg-stone-50 py-3 border-l border-stone-200">
              FCFA
            </span>
          </div>
        </div>
      </section>

      {/* Disponibilité + site */}
      <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor={`${fid}-from`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Disponible à partir du
          </label>
          <input
            id={`${fid}-from`}
            type="date"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
            className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 outline-none focus:border-mata-700 text-stone-900 font-semibold"
          />
        </div>
        <div>
          <label
            htmlFor={`${fid}-until`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Date limite (optionnel)
          </label>
          <input
            id={`${fid}-until`}
            type="date"
            value={availableUntil}
            onChange={(e) => setAvailableUntil(e.target.value)}
            className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 outline-none focus:border-mata-700 text-stone-900 font-semibold"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor={`${fid}-site`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Site de retrait
          </label>
          <select
            id={`${fid}-site`}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 outline-none focus:border-mata-700 text-stone-900 font-semibold"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Calibre / qualité */}
      <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <label
          htmlFor={`${fid}-note`}
          className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
        >
          Calibre / qualité (optionnel)
        </label>
        <input
          id={`${fid}-note`}
          type="text"
          value={qualityNote}
          onChange={(e) => setQualityNote(e.target.value)}
          placeholder="Ex : Poids moyen 1,5 kg"
          className="mt-1.5 w-full px-4 py-2.5 border-2 border-stone-200 rounded-xl outline-none focus:border-mata-700 text-stone-900 text-sm"
        />
      </section>

      <div className="sticky bottom-0 lg:relative mt-5 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 py-4 bg-white border-t border-stone-200 lg:border-0 lg:bg-transparent flex gap-3">
        <Link
          href={`/producer/offers/${offer.id}`}
          className="px-5 py-3 rounded-xl border border-stone-200 text-stone-700 font-semibold text-sm hover:bg-stone-50"
        >
          Annuler
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending || !title.trim() || !siteId}
          className="flex-1 py-3 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold flex items-center justify-center gap-2 shadow-soft disabled:opacity-50"
        >
          <Icon name="save" className="w-4 h-4" />
          {update.isPending ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>
      </div>
    </div>
  );
}
