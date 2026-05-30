'use client';

import { SITE_TYPE_LABEL_FR, SITE_TYPES, type SiteType } from '@mata/shared/constants';
import { Icon, SiteCard, useConfirm } from '@mata/ui';
import Link from 'next/link';
import { useId, useState } from 'react';
import {
  useArchiveSite,
  useCreateSite,
  useMyProducerProfile,
  useMySites,
  useZones,
} from '../../../../src/lib/api';

/**
 * Producer / Sites · liste + création inline + archive.
 *
 * Reproduit la maquette `mockup/index.html` section PRODUCER/SITES.
 */
export default function ProducerSitesPage(): React.JSX.Element {
  const { data: profileData, isLoading: profileLoading } = useMyProducerProfile();
  const { data, isLoading } = useMySites();
  const { data: zonesData } = useZones();
  const archive = useArchiveSite();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);

  if (profileLoading) return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  if (!profileData?.profile) return <NoProfileCta />;

  const sites = data?.sites ?? [];
  const zones = zonesData?.zones ?? [];
  const zoneNameById = new Map(zones.map((z) => [z.id, `${z.name}, ${z.region}`]));

  async function handleArchive(id: string): Promise<void> {
    const ok = await confirm({
      title: 'Archiver ce site ?',
      message: 'Il ne sera plus visible pour de nouvelles offres.',
      confirmLabel: 'Archiver',
    });
    if (!ok) return;
    await archive.mutateAsync(id);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Mes sites</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Fermes, poulaillers et lieux de retrait géolocalisés
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-mata-700 hover:bg-mata-800 text-white rounded-xl text-sm font-semibold shadow-soft transition"
        >
          <Icon name="plus" className="w-4 h-4" />
          <span className="hidden sm:inline">{showForm ? 'Fermer' : 'Ajouter un site'}</span>
        </button>
      </div>

      {showForm && <NewSiteForm zones={zones} onDone={() => setShowForm(false)} />}

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && sites.length === 0 && !showForm && (
        <div className="text-center py-12 text-stone-500">
          <Icon name="map-pin" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm">Vous n&apos;avez pas encore de site.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
        {sites.map((s, idx) => (
          <SiteCard
            key={s.id}
            index={idx + 1}
            name={s.name}
            type={s.type}
            zoneName={zoneNameById.get(s.zoneId) ?? '—'}
            geoLat={s.geoLat}
            geoLng={s.geoLng}
            vehicleAccess={s.vehicleAccess}
            contactName={s.contactName}
            contactPhone={s.contactPhone}
            pickupHours={s.pickupHours}
          >
            <button
              type="button"
              onClick={() => handleArchive(s.id)}
              disabled={archive.isPending}
              className="w-full py-2 rounded-lg border border-stone-200 text-mata-700 text-xs font-semibold hover:bg-mata-50 flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Icon name="x" className="w-3.5 h-3.5" /> Archiver
            </button>
          </SiteCard>
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
          Vous devez d&apos;abord créer votre profil avant d&apos;ajouter des sites.
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

type Zone = { id: string; name: string; region: string };

function NewSiteForm({ zones, onDone }: { zones: Zone[]; onDone: () => void }): React.JSX.Element {
  const createSite = useCreateSite();
  const fid = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<SiteType>('poulailler');
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '');
  const [addressLine, setAddressLine] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  async function handleSubmit(): Promise<void> {
    if (!name || !zoneId) return;
    await createSite.mutateAsync({
      name,
      type,
      zoneId,
      addressLine: addressLine || undefined,
      contactPhone: contactPhone || undefined,
    });
    onDone();
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5 mb-5">
      <h2 className="font-bold text-stone-900 mb-3">Nouveau site</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${fid}-name`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Nom
          </label>
          <input
            id={`${fid}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Poulailler Pout 1"
            className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor={`${fid}-type`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Type
          </label>
          <select
            id={`${fid}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as SiteType)}
            className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          >
            {SITE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SITE_TYPE_LABEL_FR[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`${fid}-zone`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Zone
          </label>
          <select
            id={`${fid}-zone`}
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
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
            htmlFor={`${fid}-contact`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Téléphone contact
          </label>
          <input
            id={`${fid}-contact`}
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+221770000000"
            className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor={`${fid}-address`}
            className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
          >
            Adresse / lieu-dit (optionnel)
          </label>
          <input
            id={`${fid}-address`}
            type="text"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className="mt-1 w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-lg border border-stone-200 text-stone-700 text-sm font-semibold"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createSite.isPending || !name || !zoneId}
          className="px-4 py-2 rounded-lg bg-mata-700 text-white text-sm font-bold disabled:opacity-50"
        >
          {createSite.isPending ? 'Création…' : 'Créer le site'}
        </button>
      </div>
    </div>
  );
}
