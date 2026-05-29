'use client';

import { PRODUCER_TYPE_LABEL_FR, PRODUCER_TYPES, type ProducerType } from '@mata/shared/constants';
import type { BankDetailsClear } from '@mata/shared/schemas';
import { Icon } from '@mata/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  useCreateMyProducerProfile,
  useMyProducerProfile,
  useUpdateMyBankDetails,
  useUpdateMyProducerProfile,
  useZones,
} from '../../../../src/lib/api';

/**
 * Producer / Setup · création / édition du profil producteur + bank_details.
 *
 * Accessible quel que soit l'état du profil :
 *  - sans profil  → mode "create" (status pending au backend)
 *  - avec profil  → mode "edit" + section bank_details
 *
 * Les bank_details sont une section séparée : on ne les renvoie jamais en
 * clair côté front (seul le flag `hasBankDetails` est exposé). L'update est
 * un PUT idempotent qui chiffre côté serveur (cf. CLAUDE.md §G4 / §G8).
 */
export default function ProducerSetupPage(): React.JSX.Element {
  const { data: profileData, isLoading } = useMyProducerProfile();
  const { data: zonesData } = useZones();
  const createProfile = useCreateMyProducerProfile();
  const updateProfile = useUpdateMyProducerProfile();
  const updateBank = useUpdateMyBankDetails();

  const profile = profileData?.profile ?? null;
  const zones = zonesData?.zones ?? [];

  const [type, setType] = useState<ProducerType>('poultry');
  const [zoneId, setZoneId] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [bio, setBio] = useState('');

  // Pré-remplit le form quand le profile arrive
  useEffect(() => {
    if (profile) {
      setType(profile.type);
      setZoneId(profile.zoneId);
      setWhatsappPhone(profile.whatsappPhone ?? '');
      setBio(profile.bio ?? '');
    } else if (zones.length > 0 && !zoneId) {
      const first = zones[0];
      if (first) setZoneId(first.id);
    }
  }, [profile, zones, zoneId]);

  // Bank details (jamais pré-remplies — l'API ne retourne pas le clair)
  const [bankHolder, setBankHolder] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [bankBic, setBankBic] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankSaved, setBankSaved] = useState(false);

  async function handleSaveProfile(): Promise<void> {
    if (!zoneId) return;
    const input = {
      type,
      zoneId,
      whatsappPhone: whatsappPhone || undefined,
      bio: bio || undefined,
    };
    if (profile) {
      await updateProfile.mutateAsync(input);
    } else {
      await createProfile.mutateAsync(input);
    }
  }

  async function handleSaveBank(): Promise<void> {
    const input: BankDetailsClear = {
      holder: bankHolder,
      iban: bankIban.toUpperCase().replace(/\s+/g, ''),
      bic: bankBic ? bankBic.toUpperCase().replace(/\s+/g, '') : undefined,
      bankName,
    };
    await updateBank.mutateAsync(input);
    setBankSaved(true);
    setBankHolder('');
    setBankIban('');
    setBankBic('');
    setBankName('');
  }

  if (isLoading) return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;

  const profileBusy = createProfile.isPending || updateProfile.isPending;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900">
        {profile ? 'Mon profil producteur' : 'Créer mon profil producteur'}
      </h1>
      <p className="text-sm text-stone-500 mt-1">
        {profile
          ? 'Mettez à jour vos informations. Le statut de validation est géré par MATA.'
          : 'Renseignez vos informations pour commencer à publier des offres. MATA validera votre profil.'}
      </p>

      <section className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <h2 className="font-bold text-stone-900 mb-3">Informations</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="setup-type"
              className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
            >
              Type de production
            </label>
            <select
              id="setup-type"
              value={type}
              onChange={(e) => setType(e.target.value as ProducerType)}
              className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
            >
              {PRODUCER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCER_TYPE_LABEL_FR[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="setup-zone"
              className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
            >
              Zone principale
            </label>
            <select
              id="setup-zone"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.region})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="setup-whatsapp"
              className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
            >
              WhatsApp (optionnel)
            </label>
            <input
              id="setup-whatsapp"
              type="tel"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder="+221770000000"
              className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="setup-bio"
              className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
            >
              Bio (optionnel)
            </label>
            <textarea
              id="setup-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Présentez votre exploitation en quelques phrases."
              className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={profileBusy || !zoneId}
          className="mt-4 px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold disabled:opacity-50"
        >
          {profileBusy ? 'Enregistrement…' : profile ? 'Mettre à jour' : 'Créer le profil'}
        </button>

        {profile && (
          <p className="mt-3 text-xs text-stone-500">
            Statut actuel : <strong className="text-stone-900">{profile.status}</strong>
          </p>
        )}
      </section>

      {profile && (
        <section className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
          <h2 className="font-bold text-stone-900 mb-1">Coordonnées bancaires</h2>
          <p className="text-xs text-stone-500 mb-3">
            Chiffrées en base via AES-256-GCM. Ne sont jamais retournées en clair (seul un admin
            peut les révéler, action auditée).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="bank-holder"
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Bénéficiaire
              </label>
              <input
                id="bank-holder"
                type="text"
                value={bankHolder}
                onChange={(e) => setBankHolder(e.target.value)}
                placeholder={profile.displayName}
                className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="bank-name"
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Banque
              </label>
              <input
                id="bank-name"
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="BOA Sénégal"
                className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="bank-iban"
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                IBAN
              </label>
              <input
                id="bank-iban"
                type="text"
                value={bankIban}
                onChange={(e) => setBankIban(e.target.value)}
                placeholder="SN08SN0100100..."
                className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm tabular-nums uppercase"
              />
            </div>
            <div>
              <label
                htmlFor="bank-bic"
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                BIC (optionnel)
              </label>
              <input
                id="bank-bic"
                type="text"
                value={bankBic}
                onChange={(e) => setBankBic(e.target.value)}
                placeholder="BSENSNDAXXX"
                className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm uppercase"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveBank}
            disabled={updateBank.isPending || !bankHolder || !bankIban || !bankName}
            className="mt-4 px-4 py-2.5 rounded-lg bg-stone-900 hover:bg-black text-white text-sm font-bold disabled:opacity-50"
          >
            {updateBank.isPending ? 'Chiffrement…' : 'Enregistrer les coordonnées bancaires'}
          </button>
          {bankSaved && (
            <p className="mt-2 text-xs text-green-700 bg-green-50 px-2 py-1.5 rounded-md inline-block">
              <Icon name="check" className="w-3 h-3 inline mr-1" /> Coordonnées chiffrées et
              enregistrées.
            </p>
          )}
        </section>
      )}

      {profile && (
        <div className="mt-4 flex gap-3">
          <Link
            href="/producer/offers"
            className="text-sm text-mata-700 font-semibold hover:underline"
          >
            → Mes offres
          </Link>
          <Link
            href="/producer/sites"
            className="text-sm text-mata-700 font-semibold hover:underline"
          >
            → Mes sites
          </Link>
        </div>
      )}
    </div>
  );
}
