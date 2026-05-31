'use client';

import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL_FR,
  OFFER_UNIT_LABEL_FR,
  OFFER_UNITS,
  type OfferUnit,
  type ProductCategory,
} from '@mata/shared/constants';
import { Icon, useToast } from '@mata/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useCreateOffer, useMySites, useSubmitOffer } from '../../../../../src/lib/api';

/**
 * Producer / Offers / New · création d'une offre en 4 sections.
 *
 * Reproduit `mockup/index.html` section PRODUCER/OFFERS/NEW.
 *
 * Photos : laissées pour la suite (Cloudinary upload est branché côté API
 * mais le composant OfferPhotoUploader sera ajouté quand le producteur aura
 * un offerId, càd après création initiale en brouillon).
 */

const CATEGORIES: ProductCategory[] = ['poultry', 'eggs', 'cattle', 'sheep', 'vegetables', 'fish'];
const UNITS = OFFER_UNITS;

export default function NewOfferPage(): React.JSX.Element {
  const router = useRouter();
  const { data: sitesData, isLoading: sitesLoading } = useMySites();
  const createOffer = useCreateOffer();
  const submitOffer = useSubmitOffer();
  const toast = useToast();

  const [category, setCategory] = useState<ProductCategory>('poultry');
  const [unit, setUnit] = useState<OfferUnit>('unit');
  const [quantity, setQuantity] = useState(500);
  const [priceFcfa, setPriceFcfa] = useState(3000);
  const [availableFrom, setAvailableFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [availableUntil, setAvailableUntil] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [qualityNote, setQualityNote] = useState('');
  const fid = useId();

  const sites = sitesData?.sites ?? [];

  // Auto-suggest title from category if empty
  function effectiveTitle(): string {
    return title.trim() || CATEGORY_LABEL_FR[category];
  }

  async function handleSave(submit: boolean): Promise<void> {
    if (!siteId) {
      toast.info('Sélectionnez un site de retrait.');
      return;
    }
    try {
      const created = await createOffer.mutateAsync({
        siteId,
        category,
        title: effectiveTitle(),
        unit,
        quantity,
        priceFcfa,
        availableFrom,
        availableUntil: availableUntil || undefined,
        qualityNote: qualityNote || undefined,
      });
      if (submit) {
        await submitOffer.mutateAsync(created.id);
      }
      router.push('/producer/offers');
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
    }
  }

  const busy = createOffer.isPending || submitOffer.isPending;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <Link
        href="/producer/offers"
        className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
      >
        <Icon name="arrow-left" className="w-4 h-4" /> Mes offres
      </Link>
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Nouvelle offre</h1>
      <p className="text-sm text-stone-500 mt-1">
        Renseignez votre produit. Toutes les offres sont validées par MATA avant publication.
      </p>

      {/* Step 1 — produit */}
      <section className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <StepHeader number={1} title="Choisir le produit" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {CATEGORIES.map((c) => {
            const selected = c === category;
            return (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-2xl gap-1 transition ${
                  selected
                    ? 'border-2 border-mata-700 bg-mata-50'
                    : 'border border-stone-200 bg-white hover:border-mata-300'
                }`}
              >
                {CATEGORY_EMOJI[c]}
                <span className="text-[10px] font-semibold text-stone-700">
                  {CATEGORY_LABEL_FR[c]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <label
            htmlFor={`${fid}-title`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Titre (optionnel)
          </label>
          <input
            id={`${fid}-title`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={CATEGORY_LABEL_FR[category]}
            className="mt-1.5 w-full px-4 py-2.5 border-2 border-stone-200 rounded-xl bg-white outline-none focus:border-mata-700 text-stone-900 text-sm"
          />
        </div>
      </section>

      {/* Step 2 — qté + prix */}
      <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <StepHeader number={2} title="Quantité et prix" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={`${fid}-qty`}
              className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
            >
              Quantité
            </label>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-12 h-12 rounded-xl bg-stone-100 text-stone-700 text-xl font-bold"
                aria-label="Diminuer la quantité"
              >
                −
              </button>
              <input
                id={`${fid}-qty`}
                type="number"
                value={quantity}
                min={1}
                onChange={(e) => setQuantity(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                className="flex-1 h-12 text-center border-2 border-stone-200 rounded-xl bg-white text-xl font-bold text-stone-900 outline-none focus:border-mata-700 tabular-nums"
              />
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-12 h-12 rounded-xl bg-mata-700 text-white text-xl font-bold"
                aria-label="Augmenter la quantité"
              >
                +
              </button>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              {UNITS.map((u) => {
                const selected = u === unit;
                return (
                  <button
                    type="button"
                    key={u}
                    onClick={() => setUnit(u)}
                    className={`flex-1 py-1.5 rounded-md text-xs ${
                      selected
                        ? 'border-2 border-mata-700 bg-mata-50 text-mata-800 font-bold'
                        : 'border border-stone-200 text-stone-600'
                    }`}
                  >
                    {OFFER_UNIT_LABEL_FR[u]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor={`${fid}-price`}
              className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
            >
              Prix demandé / {OFFER_UNIT_LABEL_FR[unit]}
            </label>
            <div className="mt-2 flex items-center border-2 border-stone-200 rounded-xl bg-white overflow-hidden focus-within:border-mata-700 transition">
              <input
                id={`${fid}-price`}
                type="number"
                value={priceFcfa}
                min={1}
                onChange={(e) =>
                  setPriceFcfa(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                }
                className="flex-1 px-4 py-3 outline-none text-xl font-bold text-stone-900 tabular-nums"
              />
              <span className="px-3 text-stone-500 font-semibold text-sm bg-stone-50 py-3 border-l border-stone-200">
                FCFA
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Step 3 — disponibilité + site */}
      <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <StepHeader number={3} title="Disponibilité et site" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 bg-white text-stone-900 font-semibold outline-none focus:border-mata-700"
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
              className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 bg-white text-stone-900 font-semibold outline-none focus:border-mata-700"
            />
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor={`${fid}-site`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Site de retrait
          </label>
          {sitesLoading && <p className="mt-2 text-sm text-stone-500">Chargement des sites…</p>}
          {!sitesLoading && sites.length === 0 && (
            <p className="mt-2 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
              Vous n&apos;avez pas encore de site.{' '}
              <Link href="/producer/sites" className="underline">
                Créez-en un d&apos;abord
              </Link>
              .
            </p>
          )}
          {!sitesLoading && sites.length > 0 && (
            <select
              id={`${fid}-site`}
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 bg-white text-stone-900 font-semibold outline-none focus:border-mata-700"
            >
              <option value="">— Choisir un site —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* Step 4 — calibre (photos déférées à plus tard) */}
      <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <StepHeader number={4} title="Calibre / qualité (optionnel)" />
        <input
          type="text"
          value={qualityNote}
          onChange={(e) => setQualityNote(e.target.value)}
          placeholder="Ex : Poids moyen 1,5 kg"
          className="w-full px-4 py-2.5 border-2 border-stone-200 rounded-xl bg-white outline-none focus:border-mata-700 text-stone-900 text-sm"
        />
        <p className="text-xs text-stone-500 mt-2">
          Photos : à ajouter depuis la fiche offre une fois créée.
        </p>
      </section>

      {/* Sticky bottom actions */}
      <div className="sticky bottom-0 lg:bottom-auto lg:relative mt-5 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 py-4 bg-white border-t border-stone-200 lg:border-0 lg:bg-transparent flex gap-3">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={busy}
          className="px-5 py-3 rounded-xl border border-stone-200 text-stone-700 font-semibold text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          Enregistrer brouillon
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={busy || !siteId}
          className="flex-1 py-3 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold flex items-center justify-center gap-2 shadow-soft transition disabled:opacity-50"
        >
          {busy ? 'Envoi…' : "Publier l'offre"} <Icon name="arrow-right" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StepHeader({ number, title }: { number: number; title: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-full bg-mata-700 text-white text-xs font-bold flex items-center justify-center tabular-nums">
        {number}
      </div>
      <div className="font-bold text-stone-900">{title}</div>
    </div>
  );
}
