'use client';

import {
  CATEGORY_EMOJI,
  DELIVERY_PERIOD_LABEL_FR,
  DELIVERY_PERIODS,
  type DeliveryPeriod,
  PAYMENT_METHOD_LABEL_FR,
  type PaymentMethod,
  type ProductCategory,
} from '@mata/shared/constants';
import type { OrderOutput } from '@mata/shared/schemas';
import { Icon, type IconName, Money } from '@mata/ui';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { GuestHcaptcha } from '../../../../src/components/guest-hcaptcha';
import {
  useCreateGuestOrder,
  useCreateGuestPaymentIntent,
  useGuestCatalog,
  useGuestZones,
} from '../../../../src/lib/api';
import { useCart } from '../../../../src/lib/cart/use-cart';

// Sitekey hCaptcha PUBLIQUE (Lot 8). Absente (dev par défaut) → widget masqué
// et checkout non gardé par captcha. `process.env.NEXT_PUBLIC_*` est inliné par
// Next au build, donc lisible dans ce Client Component.
const HCAPTCHA_SITEKEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

/**
 * Guest / Checkout · commande rapide sans compte (Lot 8).
 *
 * Reproduit la maquette `mockup/index.html` section GUEST/CHECKOUT (§4712).
 *
 * Particularités mode invité :
 *  - Routes publiques `/v1/guest/*` (pas de JWT, cf. CLAUDE.md §G3).
 *  - Catalogue MASQUÉ : le panier (localStorage `mata.cart.v1`) est résolu via
 *    le catalogue invité qui ne révèle PAS l'identité du producteur.
 *  - Deux moyens de paiement (le backend n'expose que `cash_on_delivery` |
 *    `online` ; le choix Wave/Orange Money se fait sur la page hébergée
 *    Bictorys après redirection).
 *  - Au checkout :
 *      cash_on_delivery → commande confirmable sans paiement → écran de succès.
 *      online           → création d'un intent Bictorys → redirection paiement.
 */

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Deux moyens de paiement présentés (le backend mappe online → Bictorys).
const GUEST_PAYMENT_METHODS: ReadonlyArray<{
  value: PaymentMethod;
  hint: string;
  icon: IconName;
}> = [
  {
    value: 'cash_on_delivery',
    hint: 'Réglez en espèces au livreur',
    icon: 'truck',
  },
  {
    value: 'online',
    hint: 'Wave, Orange Money… via un lien de paiement sécurisé',
    icon: 'smartphone',
  },
];

export default function GuestCheckoutPage(): React.JSX.Element {
  const cart = useCart();
  const fid = useId();

  // Catalogue invité (masqué) pour résoudre les lignes du panier.
  const { data: catalogData } = useGuestCatalog({ page: 1, limit: 50 });
  const offersById = useMemo(() => {
    const all = catalogData?.offers ?? [];
    type GuestOffer = (typeof all)[number];
    const m = new Map<string, GuestOffer>();
    for (const o of all) m.set(o.id, o);
    return m;
  }, [catalogData]);

  const { data: zonesData } = useGuestZones();
  const zones = zonesData?.zones ?? [];

  // Coordonnées + livraison + paiement.
  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [slotDate, setSlotDate] = useState(tomorrowISO());
  const [slotPeriod, setSlotPeriod] = useState<DeliveryPeriod>('morning');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
  const [consent, setConsent] = useState(true);

  const createOrder = useCreateGuestOrder();
  const createIntent = useCreateGuestPaymentIntent();
  const [confirmed, setConfirmed] = useState<OrderOutput | null>(null);

  // hCaptcha : actif seulement si la sitekey est configurée. Le token est à
  // usage unique → on le réinitialise après un échec (nonce force un nouveau
  // challenge en remontant le widget).
  const hcaptchaEnabled = Boolean(HCAPTCHA_SITEKEY);
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  // Récap local (le serveur revalide tout au POST).
  const lines = cart.items
    .map((item) => {
      const offer = offersById.get(item.offerId);
      if (!offer) return null;
      return { item, offer, lineFcfa: offer.priceFcfa * item.quantity };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const subtotalFcfa = lines.reduce((s, l) => s + l.lineFcfa, 0);

  // Numéro Sénégal : +221 + 9 chiffres (PhoneSnSchema côté serveur).
  const digits = phoneDigits.replace(/\D/g, '');
  const phoneNumber = `+221${digits}`;
  const phoneValid = digits.length === 9;

  const busy = createOrder.isPending || createIntent.isPending;
  const canSubmit =
    lines.length > 0 &&
    fullName.trim().length >= 2 &&
    phoneValid &&
    zoneId !== '' &&
    addressLine.trim().length >= 3 &&
    consent &&
    (!hcaptchaEnabled || hcaptchaToken !== null) &&
    !busy;

  const errorMessage = createOrder.error?.message ?? createIntent.error?.message ?? null;

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
          guestFullName: fullName.trim(),
          guestPhoneNumber: phoneNumber,
          paymentMethod,
          consent: true,
          // Token à usage unique, présent seulement si le widget est affiché.
          hcaptchaToken: hcaptchaToken ?? undefined,
        },
      });

      if (paymentMethod === 'online') {
        // Crée l'intent puis redirige vers la page de paiement Bictorys.
        const intent = await createIntent.mutateAsync({
          orderId: order.id,
          guestPhoneNumber: phoneNumber,
        });
        cart.clear();
        window.location.href = intent.paymentUrl;
        return;
      }

      // Paiement à la livraison : commande confirmable sans paiement.
      cart.clear();
      setConfirmed(order);
    } catch {
      // Erreur affichée via errorMessage (createOrder/createIntent.error).
      // Le token hCaptcha est consommé même en cas d'échec → on force un
      // nouveau challenge pour permettre une nouvelle tentative.
      if (hcaptchaEnabled) {
        setHcaptchaToken(null);
        setCaptchaNonce((n) => n + 1);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Écran de confirmation (cash_on_delivery)

  if (confirmed) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Icon name="check" className="w-7 h-7 text-green-700" />
          </div>
          <h1 className="text-xl font-bold text-stone-900 mt-4">Commande enregistrée</h1>
          <p className="text-sm text-stone-600 mt-1">
            Votre commande{' '}
            <span className="font-semibold text-stone-900">{confirmed.orderNumber}</span> a bien été
            créée.
          </p>
          <div className="mt-4 rounded-xl bg-stone-100 p-4 text-left text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Total</span>
              <Money amount={confirmed.totalFcfa} className="text-stone-900" />
            </div>
            <div className="flex items-start gap-2 text-stone-600">
              <Icon name="phone" className="w-3.5 h-3.5 text-mata-700 mt-0.5 shrink-0" /> Nous vous
              appellerons au {confirmed.guestPhoneNumber} sous 30 minutes pour confirmer.
            </div>
          </div>
          <Link
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold transition"
          >
            Retour à l'accueil
          </Link>
          <Link
            href="/auth/login"
            className="mt-3 block text-xs text-mata-700 font-bold hover:underline"
          >
            Créer un compte pour suivre mes commandes →
          </Link>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────
  // Formulaire de checkout

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header simplifié */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-stone-700 hover:text-mata-700 font-semibold text-sm"
          >
            <Icon name="arrow-left" className="w-4 h-4" />{' '}
            <span className="hidden sm:inline">Catalogue</span>
          </Link>
          <div className="h-5 w-px bg-stone-200" />
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-mata-700 flex items-center justify-center">
              <span className="text-white font-extrabold text-xs">MA</span>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-stone-900 text-sm">Commande rapide</div>
              <div className="text-[11px] text-stone-500 -mt-0.5">Sans inscription</div>
            </div>
          </div>
          <div className="flex-1" />
          <Link
            href="/auth/login"
            className="hidden sm:flex text-xs font-semibold text-stone-500 hover:text-mata-700 items-center gap-1.5"
          >
            <Icon name="user" className="w-3.5 h-3.5" /> J'ai un compte
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        {/* Hero */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-mata-50 border border-mata-200 rounded-full text-xs font-bold text-mata-800 uppercase tracking-wider">
            <Icon name="zap" className="w-3 h-3" /> Mode invité
          </span>
          <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-3">
            Finalisez votre commande
          </h1>
          <p className="text-stone-600 mt-1">
            Aucune création de compte requise. Remplissez vos coordonnées et nous gérons la suite.
          </p>
        </div>

        {lines.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center">
            <Icon name="shopping-cart" className="w-12 h-12 mx-auto text-stone-300" />
            <p className="mt-3 text-sm text-stone-500">
              Votre panier est vide.{' '}
              <Link href="/" className="text-mata-700 font-semibold">
                Parcourir le catalogue
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Form */}
            <div className="lg:col-span-2 space-y-4">
              {/* Panier */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-soft overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                    <Icon name="shopping-bag" className="w-4 h-4 text-mata-700" /> Votre panier
                  </h3>
                  <Link href="/" className="text-xs text-mata-700 font-semibold hover:underline">
                    Modifier
                  </Link>
                </div>
                <div className="divide-y divide-stone-100">
                  {lines.map(({ item, offer, lineFcfa }) => (
                    <div key={item.offerId} className="p-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl shrink-0">
                        {CATEGORY_EMOJI[offer.category as ProductCategory]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-stone-900 text-sm">
                          {offer.title} × {item.quantity}
                        </div>
                        <div className="text-xs text-stone-500">Producteur MATA vérifié</div>
                      </div>
                      <Money amount={lineFcfa} className="text-stone-900 text-sm" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Coordonnées */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 mb-4">
                  <Icon name="user" className="w-4 h-4 text-mata-700" /> Vos coordonnées
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`${fid}-name`}
                      className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
                    >
                      Prénom et nom *
                    </label>
                    <input
                      id={`${fid}-name`}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex : Aïssatou Diop"
                      className="mt-1.5 w-full px-4 py-3 border-2 border-stone-200 rounded-xl bg-white outline-none focus:border-mata-700 text-stone-900"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${fid}-phone`}
                      className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
                    >
                      Téléphone *
                    </label>
                    <div className="mt-1.5 flex items-center border-2 border-stone-200 rounded-xl bg-white focus-within:border-mata-700">
                      <span className="pl-3 pr-2 py-3 text-stone-700 font-medium border-r border-stone-200 text-sm">
                        +221
                      </span>
                      <input
                        id={`${fid}-phone`}
                        type="tel"
                        inputMode="numeric"
                        value={phoneDigits}
                        onChange={(e) => setPhoneDigits(e.target.value)}
                        placeholder="77 123 45 67"
                        className="flex-1 px-3 py-3 bg-transparent outline-none text-stone-900"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-stone-500 mt-2 flex items-start gap-1.5">
                  <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Nous vous appellerons
                  à ce numéro pour confirmer la commande et coordonner la livraison.
                </p>
              </div>

              {/* Adresse livraison */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 mb-4">
                  <Icon name="map-pin" className="w-4 h-4 text-mata-700" /> Adresse de livraison
                </h3>
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor={`${fid}-address`}
                      className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
                    >
                      Adresse complète *
                    </label>
                    <textarea
                      id={`${fid}-address`}
                      rows={2}
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      placeholder="Ex : Villa 42, Cité Keur Gorgui, Mermoz, Dakar"
                      className="mt-1.5 w-full px-4 py-3 border-2 border-stone-200 rounded-xl bg-white outline-none focus:border-mata-700 text-stone-900 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${fid}-zone`}
                      className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
                    >
                      Zone *
                    </label>
                    <select
                      id={`${fid}-zone`}
                      value={zoneId}
                      onChange={(e) => setZoneId(e.target.value)}
                      className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-stone-200 bg-white font-semibold text-stone-900 text-sm outline-none focus:border-mata-700"
                    >
                      <option value="">— Choisir la zone de livraison —</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({z.region})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Créneau livraison */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 mb-4">
                  <Icon name="calendar" className="w-4 h-4 text-mata-700" /> Créneau de livraison
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="p-3 rounded-xl border-2 border-mata-700 bg-mata-50 cursor-pointer">
                    <div className="text-[10px] text-mata-700 font-bold uppercase tracking-wider">
                      Date
                    </div>
                    <input
                      type="date"
                      value={slotDate}
                      onChange={(e) => setSlotDate(e.target.value)}
                      className="font-bold text-stone-900 mt-0.5 bg-transparent outline-none w-full"
                    />
                  </label>
                  <label className="p-3 rounded-xl border border-stone-200 bg-white cursor-pointer">
                    <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                      Plage
                    </div>
                    <select
                      value={slotPeriod}
                      onChange={(e) => setSlotPeriod(e.target.value as DeliveryPeriod)}
                      className="font-bold text-stone-900 mt-0.5 bg-transparent outline-none w-full"
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

              {/* Paiement */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 mb-4">
                  <Icon name="wallet" className="w-4 h-4 text-mata-700" /> Mode de paiement
                </h3>
                <div className="space-y-2">
                  {GUEST_PAYMENT_METHODS.map((m) => {
                    const active = paymentMethod === m.value;
                    return (
                      <label
                        key={m.value}
                        className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer ${
                          active
                            ? 'border-2 border-mata-700 bg-mata-50/40'
                            : 'border border-stone-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="pay"
                          checked={active}
                          onChange={() => setPaymentMethod(m.value)}
                          className="mt-0.5 text-mata-700"
                        />
                        <div className="flex-1">
                          <div className="font-bold text-stone-900 text-sm flex items-center gap-2">
                            <Icon name={m.icon} className="w-4 h-4 text-stone-700" />{' '}
                            {PAYMENT_METHOD_LABEL_FR[m.value]}
                          </div>
                          <div className="text-xs text-stone-600 mt-0.5">{m.hint}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Consentement */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 rounded text-mata-700"
                />
                <span className="text-xs text-stone-700">
                  J'accepte que MATA me contacte par téléphone pour confirmer cette commande et
                  utilise mes coordonnées uniquement pour la livraison.
                </span>
              </label>

              {/* Anti-robot — affiché seulement si la sitekey est configurée. */}
              {hcaptchaEnabled && HCAPTCHA_SITEKEY && (
                <div className="flex justify-center">
                  <GuestHcaptcha
                    key={captchaNonce}
                    sitekey={HCAPTCHA_SITEKEY}
                    onVerify={setHcaptchaToken}
                    onExpire={() => setHcaptchaToken(null)}
                  />
                </div>
              )}
            </div>

            {/* Récap latéral */}
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
                    calculés à la validation.
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
                  className="mt-5 w-full py-3.5 rounded-xl bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white font-bold flex items-center justify-center gap-2 shadow-soft transition"
                >
                  {busy ? (
                    'Validation…'
                  ) : (
                    <>
                      <Icon name="check" className="w-5 h-5" /> Valider la commande
                    </>
                  )}
                </button>
                {errorMessage && (
                  <div className="mt-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-md">
                    {errorMessage}
                  </div>
                )}

                <div className="mt-4 space-y-2 text-xs text-stone-600">
                  <div className="flex items-start gap-2">
                    <Icon name="phone" className="w-3.5 h-3.5 text-mata-700 mt-0.5 shrink-0" />{' '}
                    Appel de confirmation sous 30 min
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon
                      name="shield-check"
                      className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0"
                    />{' '}
                    Aucun compte créé, pas de mot de passe à retenir
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="lock" className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" /> Vos
                    données utilisées uniquement pour cette commande
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-stone-100 text-center">
                  <div className="text-xs text-stone-500 mb-2">Vous commandez souvent ?</div>
                  <Link
                    href="/auth/login"
                    className="text-xs text-mata-700 font-bold hover:underline"
                  >
                    Créer un compte pour garder vos infos →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
