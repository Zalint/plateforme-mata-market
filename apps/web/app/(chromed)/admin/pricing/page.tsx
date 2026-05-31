'use client';

import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL_FR,
  PRICING_BASE_LABEL_FR,
  PRICING_BASES,
  PRICING_MODEL_DESCRIPTION_FR,
  PRICING_MODEL_LABEL_FR,
  PRICING_MODELS,
  type PricingBase,
  type PricingModel,
  type ProductCategory,
} from '@mata/shared/constants';
import type {
  PricingRuleCreate,
  PricingRuleOutput,
  PricingRuleUpdate,
  PricingSimulateInput,
} from '@mata/shared/schemas';
import { Icon, type IconName, Money } from '@mata/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  useAdminOffers,
  useCreatePricingRule,
  usePricingRules,
  useSimulatePricing,
  useUpdatePricingRule,
} from '../../../../src/lib/api';

/**
 * Admin / Pricing · configuration des règles 7 composantes.
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/PRICING (§2584-2771).
 *
 * Deux modes de cible :
 *  - `category` : rule par défaut pour une catégorie produit (poultry, eggs, ...)
 *  - `offer`    : override pour une offre précise (priorité sur category)
 *
 * À chaque changement de cible, on cherche la rule active correspondante
 * et on pré-remplit les inputs. Le simulator inline appelle `/v1/pricing/simulate`
 * à chaque modification (debounce naturel via staleTime TanStack Query).
 */

type Scope = 'category' | 'offer';

const PRODUCT_CATEGORIES = Object.keys(CATEGORY_EMOJI) as ProductCategory[];

// État local : valeur initiale d'une rule "vide".
const DEFAULTS = {
  model: 'commission_pct' as PricingModel,
  commissionPct: 10,
  commissionBase: 'producer_price' as PricingBase,
  commissionFlatFcfa: 0,
  safetyMarginPct: 3,
  safetyMarginBase: 'producer_price' as PricingBase,
  collectionFcfa: 120,
  deliveryFcfa: 200,
  storageFcfa: 50,
  discountFcfa: 0,
};

// Prix producteur fictif si la cible est une catégorie (pas de prix attaché).
// Permet quand même de voir la décomposition avec des chiffres concrets.
const FALLBACK_PRODUCER_PRICE = 3000;

export default function AdminPricingPage(): React.JSX.Element {
  const [scope, setScope] = useState<Scope>('category');
  const [category, setCategory] = useState<ProductCategory>('poultry');
  const [offerId, setOfferId] = useState<string>('');

  const [form, setForm] = useState(DEFAULTS);

  // Charge les offres validées pour le sélecteur "Offre".
  const { data: offersData } = useAdminOffers({ page: 1, limit: 50, status: 'validated' });
  const offers = offersData?.offers ?? [];
  const selectedOffer = offers.find((o) => o.id === offerId);
  const producerPriceFcfa = selectedOffer?.priceFcfa ?? FALLBACK_PRODUCER_PRICE;

  // Cherche la rule existante pour la cible courante (pré-remplissage).
  // NB : on n'envoie PAS `activeAt: new Date().toISOString()` ici car cela
  // changerait à chaque rendu → query key instable → refetch en boucle.
  // Le serveur trie par validFrom desc, on prend la plus récente côté client.
  const rulesQuery = useMemo(
    () =>
      scope === 'category'
        ? { scope: 'category' as const, category }
        : offerId
          ? { scope: 'offer' as const, offerId }
          : {},
    [scope, category, offerId],
  );
  const { data: rulesData } = usePricingRules(rulesQuery);
  const existingRule: PricingRuleOutput | undefined = rulesData?.rules[0];
  const existingRuleId = existingRule?.id ?? null;

  // À chaque changement de cible OU d'arrivée de rule, on précharge.
  useEffect(() => {
    if (!existingRule) {
      setForm(DEFAULTS);
      return;
    }
    setForm({
      model: existingRule.model,
      commissionPct: existingRule.commissionPct,
      commissionBase: existingRule.commissionBase,
      commissionFlatFcfa: existingRule.commissionFlatFcfa,
      safetyMarginPct: existingRule.safetyMarginPct,
      safetyMarginBase: existingRule.safetyMarginBase,
      collectionFcfa: existingRule.collectionFcfa,
      deliveryFcfa: existingRule.deliveryFcfa,
      storageFcfa: existingRule.storageFcfa,
      discountFcfa: existingRule.discountFcfa,
    });
  }, [existingRule]);

  // Simulation live : on construit un input inline à partir du form.
  const simulateInput = useMemo<PricingSimulateInput>(
    () => ({
      inline: {
        producerPriceFcfa,
        model: form.model,
        commissionPct: form.commissionPct,
        commissionBase: form.commissionBase,
        commissionFlatFcfa: form.commissionFlatFcfa,
        safetyMarginPct: form.safetyMarginPct,
        safetyMarginBase: form.safetyMarginBase,
        collectionFcfa: form.collectionFcfa,
        deliveryFcfa: form.deliveryFcfa,
        storageFcfa: form.storageFcfa,
        discountFcfa: form.discountFcfa,
        quantity: 1,
      },
    }),
    [form, producerPriceFcfa],
  );
  const { data: simulation, error: simulationError } = useSimulatePricing(simulateInput);

  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();

  const canSave =
    !createRule.isPending &&
    !updateRule.isPending &&
    (scope === 'category' || (scope === 'offer' && offerId !== ''));

  async function handleSave(): Promise<void> {
    if (existingRuleId) {
      const patch: PricingRuleUpdate = { ...form };
      await updateRule.mutateAsync({ id: existingRuleId, data: patch });
    } else {
      const create: PricingRuleCreate =
        scope === 'category'
          ? { scope: 'category', category, ...form }
          : { scope: 'offer', offerId, ...form };
      await createRule.mutateAsync(create);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Pricing semi-automatique</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Chaque composante stockée séparément · business model non figé
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled
            className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-semibold text-stone-400 flex items-center gap-1.5"
            title="Historique des modifications — à venir Lot 9"
          >
            <Icon name="history" className="w-3.5 h-3.5" /> Historique
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-3 py-2 bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Icon name="save" className="w-3.5 h-3.5" />{' '}
            {existingRuleId ? 'Mettre à jour' : 'Enregistrer & appliquer'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column : target + model */}
        <div className="space-y-4">
          {/* Target card */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-soft">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-2">
              Cible de la règle
            </div>

            {/* Scope toggle */}
            <div className="flex items-center gap-1 mb-3 border border-stone-200 rounded-lg p-0.5 bg-stone-50">
              {(['category', 'offer'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition ${
                    scope === s ? 'bg-white shadow text-stone-900' : 'text-stone-500'
                  }`}
                >
                  {s === 'category' ? 'Catégorie' : 'Offre (override)'}
                </button>
              ))}
            </div>

            {scope === 'category' ? (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full p-3 rounded-lg border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-900 outline-none focus:border-mata-700"
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_EMOJI[c]} {CATEGORY_LABEL_FR[c]}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
                className="w-full p-3 rounded-lg border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-900 outline-none focus:border-mata-700"
              >
                <option value="">— Sélectionner une offre —</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {CATEGORY_EMOJI[o.category]} {o.title} · {o.siteName} · {o.producerDisplayName}
                  </option>
                ))}
              </select>
            )}

            {existingRule && (
              <div className="mt-2 text-[11px] text-stone-500">
                Règle existante chargée — l'enregistrement la met à jour.
              </div>
            )}
          </div>

          {/* Model card */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-soft">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-3">
              Modèle économique
            </div>
            <div className="space-y-2">
              {PRICING_MODELS.map((m) => {
                const checked = form.model === m;
                return (
                  <label
                    key={m}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer ${
                      checked
                        ? 'border-2 border-mata-700 bg-mata-50/30'
                        : 'border border-stone-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      checked={checked}
                      onChange={() => setForm((f) => ({ ...f, model: m }))}
                      className="mt-0.5 text-mata-700"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-stone-900 text-sm">
                        {PRICING_MODEL_LABEL_FR[m]}
                      </div>
                      <div className="text-[11px] text-stone-600">
                        {PRICING_MODEL_DESCRIPTION_FR[m]}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column : components */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-stone-200 shadow-soft overflow-hidden">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between">
            <h3 className="font-bold text-stone-900">Composantes du prix</h3>
            <div className="text-xs text-stone-500">Par unité (FCFA)</div>
          </div>

          <div className="divide-y divide-stone-100">
            {/* Prix producteur (verrouillé) */}
            <ComponentRow
              icon="sprout"
              tone="mata"
              label="Prix producteur"
              hint={
                selectedOffer
                  ? `${selectedOffer.producerDisplayName} · ${selectedOffer.siteName}`
                  : `Verrouillé · ${producerPriceFcfa === FALLBACK_PRODUCER_PRICE ? 'exemple 3 000 F' : ''}`
              }
              right={
                <span className="font-bold tabular text-stone-900">{producerPriceFcfa} F</span>
              }
              locked
            />

            {/* Commission */}
            <ComponentRow
              icon="percent"
              tone="mata"
              label="Commission plateforme"
              hint={`Modèle ${PRICING_MODEL_LABEL_FR[form.model]}`}
              input={
                form.model === 'commission_pct' || form.model === 'mixed' ? (
                  <PctInput
                    value={form.commissionPct}
                    onChange={(v) => setForm((f) => ({ ...f, commissionPct: v }))}
                  />
                ) : null
              }
              extraInput={
                form.model === 'fixed_margin' ||
                form.model === 'mixed' ||
                form.model === 'negotiated' ? (
                  <FcfaInput
                    value={form.commissionFlatFcfa}
                    onChange={(v) => setForm((f) => ({ ...f, commissionFlatFcfa: v }))}
                  />
                ) : null
              }
              baseSelect={
                form.model === 'commission_pct' || form.model === 'mixed' ? (
                  <BaseSelect
                    value={form.commissionBase}
                    onChange={(v) => setForm((f) => ({ ...f, commissionBase: v }))}
                  />
                ) : null
              }
              right={
                <RightAmount
                  amount={simulation?.perUnit.commissionFcfa ?? 0}
                  loading={!simulation}
                />
              }
            />

            <ComponentRow
              icon="truck"
              tone="blue"
              label="Coût collecte"
              hint="Forfait par unité, FCFA"
              input={
                <FcfaInput
                  value={form.collectionFcfa}
                  onChange={(v) => setForm((f) => ({ ...f, collectionFcfa: v }))}
                />
              }
              right={
                <RightAmount
                  amount={simulation?.perUnit.collectionFcfa ?? form.collectionFcfa}
                  loading={!simulation}
                />
              }
            />

            <ComponentRow
              icon="map-pin"
              tone="blue"
              label="Coût livraison"
              hint="Grille zone client"
              input={
                <FcfaInput
                  value={form.deliveryFcfa}
                  onChange={(v) => setForm((f) => ({ ...f, deliveryFcfa: v }))}
                />
              }
              right={
                <RightAmount
                  amount={simulation?.perUnit.deliveryFcfa ?? form.deliveryFcfa}
                  loading={!simulation}
                />
              }
            />

            <ComponentRow
              icon="snowflake"
              tone="stone"
              label="Coût stockage"
              hint="Forfait court séjour"
              input={
                <FcfaInput
                  value={form.storageFcfa}
                  onChange={(v) => setForm((f) => ({ ...f, storageFcfa: v }))}
                />
              }
              right={
                <RightAmount
                  amount={simulation?.perUnit.storageFcfa ?? form.storageFcfa}
                  loading={!simulation}
                />
              }
            />

            <ComponentRow
              icon="shield"
              tone="amber"
              label="Marge sécurité"
              hint="Couvre pertes, variations, incidents"
              input={
                <PctInput
                  value={form.safetyMarginPct}
                  onChange={(v) => setForm((f) => ({ ...f, safetyMarginPct: v }))}
                />
              }
              baseSelect={
                form.safetyMarginPct > 0 ? (
                  <BaseSelect
                    value={form.safetyMarginBase}
                    onChange={(v) => setForm((f) => ({ ...f, safetyMarginBase: v }))}
                  />
                ) : null
              }
              right={
                <RightAmount
                  amount={simulation?.perUnit.safetyMarginFcfa ?? 0}
                  loading={!simulation}
                />
              }
            />

            <ComponentRow
              icon="tag"
              tone="stone"
              label="Remise"
              hint="Manuel admin · soustraction"
              input={
                <FcfaInput
                  value={form.discountFcfa}
                  onChange={(v) => setForm((f) => ({ ...f, discountFcfa: v }))}
                />
              }
              right={
                <span className="text-right tabular text-stone-400">
                  {form.discountFcfa > 0 ? `− ${form.discountFcfa} F` : '0 F'}
                </span>
              }
            />
          </div>

          {/* Bandeau final */}
          <div className="px-4 py-4 bg-stone-900 text-white grid grid-cols-12 gap-2 lg:gap-4 items-center">
            <div className="col-span-12 sm:col-span-7">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">
                Prix final client
              </div>
              <div className="text-xs text-stone-400 mt-0.5">
                {simulationError
                  ? humanizeSimulateError(simulationError)
                  : simulation
                    ? buildDecomposition(simulation)
                    : 'Calcul…'}
              </div>
            </div>
            <div className="col-span-12 sm:col-span-5 text-right">
              <div className="text-2xl lg:text-3xl font-bold tabular">
                {simulation ? simulation.perUnit.finalPriceFcfa.toLocaleString('fr-FR') : '—'}{' '}
                <span className="text-base text-stone-400 font-medium">F</span>
              </div>
              <div className="text-[11px] text-mata-300 mt-0.5">
                Producteur reçoit{' '}
                <span className="font-bold text-white tabular">
                  {simulation ? <Money amount={simulation.perUnit.producerShareFcfa} /> : '—'}
                </span>{' '}
                · MATA{' '}
                <span className="font-bold text-mata-300 tabular">
                  {simulation ? <Money amount={simulation.perUnit.platformShareFcfa} /> : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(createRule.isError || updateRule.isError) && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
          Échec de l'enregistrement. Vérifie les valeurs et réessaie.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants locaux

type Tone = 'mata' | 'blue' | 'amber' | 'stone';

const TONE_BG: Record<Tone, string> = {
  mata: 'bg-mata-50 text-mata-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  stone: 'bg-stone-100 text-stone-600',
};

function ComponentRow(props: {
  icon: IconName;
  tone: Tone;
  label: string;
  hint: string;
  input?: React.ReactNode;
  extraInput?: React.ReactNode;
  baseSelect?: React.ReactNode;
  right: React.ReactNode;
  locked?: boolean;
}): React.JSX.Element {
  return (
    <div className="px-4 py-3 grid grid-cols-12 gap-2 lg:gap-4 items-center">
      <div className="col-span-7 lg:col-span-4 flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${TONE_BG[props.tone]}`}
        >
          <Icon name={props.icon} className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-stone-900 text-sm">{props.label}</div>
          <div className="text-[11px] text-stone-500 truncate">{props.hint}</div>
        </div>
      </div>
      <div className="col-span-5 lg:col-span-3 flex items-center gap-1.5">
        {props.locked ? (
          <span className="text-xs text-stone-500">Verrouillé</span>
        ) : (
          <>
            {props.input}
            {props.extraInput}
          </>
        )}
      </div>
      <div className="hidden lg:block lg:col-span-3">{props.baseSelect}</div>
      <div className="col-span-12 lg:col-span-2 text-right">{props.right}</div>
    </div>
  );
}

function PctInput(props: { value: number; onChange: (n: number) => void }): React.JSX.Element {
  return (
    <div className="flex items-center border border-stone-200 rounded-md overflow-hidden">
      <input
        type="number"
        min={0}
        max={100}
        value={props.value}
        onChange={(e) => props.onChange(clamp(parseInt(e.target.value, 10) || 0, 0, 100))}
        className="w-full px-2 py-1.5 text-sm font-semibold text-stone-900 outline-none tabular"
      />
      <span className="px-2 text-stone-500 text-xs bg-stone-50 py-1.5">%</span>
    </div>
  );
}

function FcfaInput(props: { value: number; onChange: (n: number) => void }): React.JSX.Element {
  return (
    <div className="flex items-center border border-stone-200 rounded-md overflow-hidden">
      <input
        type="number"
        min={0}
        value={props.value}
        onChange={(e) => props.onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="w-full px-2 py-1.5 text-sm font-semibold text-stone-900 outline-none tabular"
      />
      <span className="px-2 text-stone-500 text-xs bg-stone-50 py-1.5">F</span>
    </div>
  );
}

function BaseSelect(props: {
  value: PricingBase;
  onChange: (v: PricingBase) => void;
}): React.JSX.Element {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as PricingBase)}
      className="w-full text-[11px] text-stone-600 border border-stone-200 rounded-md px-2 py-1.5 bg-white outline-none"
    >
      {PRICING_BASES.map((b) => (
        <option key={b} value={b}>
          {PRICING_BASE_LABEL_FR[b]}
        </option>
      ))}
    </select>
  );
}

function RightAmount(props: { amount: number; loading: boolean }): React.JSX.Element {
  return (
    <span className="font-bold text-stone-900 tabular">
      {props.loading ? '…' : `+ ${props.amount.toLocaleString('fr-FR')} F`}
    </span>
  );
}

/**
 * Convertit une erreur API en message utilisateur lisible. Distingue :
 *  - 401 / 403 : problème d'authentification ou rôle (pas une erreur de calcul)
 *  - 422 / 400 : configuration métier invalide (VALIDATION ou Zod)
 *  - autres   : message générique
 */
function humanizeSimulateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Session expirée — reconnecte-toi';
    if (err.status === 403) return 'Accès refusé — ton rôle ne permet pas la simulation';
    if (err.status === 422 || err.status === 400) {
      const body = err.body as { message?: string } | null;
      return body?.message ?? 'Configuration invalide — vérifie les % et la remise';
    }
    return `Erreur API (${err.status})`;
  }
  return 'Erreur de calcul — vérifie la configuration';
}

function buildDecomposition(s: {
  perUnit: {
    producerPriceFcfa: number;
    commissionFcfa: number;
    collectionFcfa: number;
    deliveryFcfa: number;
    storageFcfa: number;
    safetyMarginFcfa: number;
    discountFcfa: number;
  };
}): string {
  const u = s.perUnit;
  const parts = [
    u.producerPriceFcfa,
    u.commissionFcfa,
    u.collectionFcfa,
    u.deliveryFcfa,
    u.storageFcfa,
    u.safetyMarginFcfa,
  ];
  const base = parts.join(' + ');
  return u.discountFcfa > 0 ? `${base} − ${u.discountFcfa}` : base;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
