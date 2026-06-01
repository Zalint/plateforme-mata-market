'use client';

import { PRODUCER_TYPE_LABEL_FR, PRODUCER_TYPES, type ProducerType } from '@mata/shared/constants';
import type { ProducerOnboardResponse } from '@mata/shared/schemas';
import { Icon } from '@mata/ui';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ApiError, useMe, useOnboardProducer, useZones } from '../../../../../src/lib/api';

const PHONE_RE = /^\+221\d{9}$/;
const STAFF_ROLES = ['admin', 'super_admin', 'teleconsultant'];

/**
 * Admin / Téléconseiller · onboarding d'un producteur (Lot 9).
 *
 * Le staff crée le compte d'un producteur tiers : un compte Keycloak est
 * provisionné à la volée (username = téléphone, mot de passe temporaire) et le
 * profil est créé en statut « à valider » (pending). Le mot de passe temporaire
 * est affiché UNE SEULE FOIS — il doit être communiqué au producteur.
 *
 * L'autorisation réelle est vérifiée côté API (admin + teleconsultant) ; ce
 * garde-fou front n'est que cosmétique.
 */
export default function NewProducerPage(): React.JSX.Element {
  const { data: me } = useMe();
  const { data: zonesData } = useZones();
  const onboard = useOnboardProducer();
  const fid = useId();

  const zones = zonesData?.zones ?? [];

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('+221');
  const [type, setType] = useState<ProducerType>('poultry');
  const [zoneId, setZoneId] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [bio, setBio] = useState('');
  const [result, setResult] = useState<ProducerOnboardResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (zones.length > 0 && !zoneId) {
      const first = zones[0];
      if (first) setZoneId(first.id);
    }
  }, [zones, zoneId]);

  const phoneValid = PHONE_RE.test(phone);
  const whatsappValid = whatsappPhone === '' || PHONE_RE.test(whatsappPhone);
  const canSubmit =
    displayName.trim().length >= 2 && phoneValid && whatsappValid && !!zoneId && !onboard.isPending;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    const res = await onboard.mutateAsync({
      displayName: displayName.trim(),
      phone,
      type,
      zoneId,
      whatsappPhone: whatsappPhone || undefined,
      bio: bio || undefined,
    });
    setResult(res);
  }

  function resetForm(): void {
    setResult(null);
    setCopied(false);
    setDisplayName('');
    setPhone('+221');
    setType('poultry');
    setWhatsappPhone('');
    setBio('');
  }

  function copyPassword(pwd: string): void {
    void navigator.clipboard?.writeText(pwd).then(() => setCopied(true));
  }

  if (me && !STAFF_ROLES.includes(me.role)) {
    return (
      <p className="px-4 py-8 text-sm text-stone-500">
        Accès réservé au staff MATA (admin ou téléconseiller).
      </p>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Créer un producteur</h1>
      <p className="text-sm text-stone-500 mt-1">
        Enregistrez un producteur. Un compte est créé avec un mot de passe temporaire à lui
        communiquer. Le profil démarre en statut « à valider » : un admin le validera ensuite.
      </p>

      {result ? (
        <section className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
          <div className="flex items-center gap-2 text-green-700">
            <Icon name="check" className="w-5 h-5" />
            <h2 className="font-bold">Producteur créé — statut « à valider »</h2>
          </div>
          <p className="text-sm text-stone-600 mt-2">
            <strong className="text-stone-900">{result.profile.displayName}</strong> a été
            enregistré. Communiquez-lui ses identifiants de connexion.
          </p>

          <div className="mt-4 rounded-xl border-2 border-mata-200 bg-mata-50 p-4">
            <p className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
              Identifiant (téléphone)
            </p>
            <p className="text-lg font-bold text-stone-900 tabular-nums">{phone}</p>

            <p className="mt-3 text-xs font-semibold text-stone-700 uppercase tracking-wider">
              Mot de passe temporaire
            </p>
            <div className="flex items-center gap-2">
              <code className="text-lg font-bold text-mata-800 tracking-widest">
                {result.tempPassword}
              </code>
              <button
                type="button"
                onClick={() => copyPassword(result.tempPassword)}
                className="px-2 py-1 rounded-md bg-white border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
            <p className="mt-3 text-xs text-stone-500">
              ⚠️ Ce mot de passe ne sera plus affiché. Le producteur devra le changer à sa première
              connexion.
            </p>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold"
            >
              Créer un autre producteur
            </button>
            <Link
              href="/admin/producers"
              className="px-4 py-2.5 rounded-lg border border-stone-200 text-stone-700 text-sm font-semibold hover:bg-stone-50"
            >
              Voir les producteurs
            </Link>
          </div>
        </section>
      ) : (
        <section className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${fid}-name`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Nom du producteur
              </label>
              <input
                id={`${fid}-name`}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mor Diop"
                className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${fid}-phone`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Téléphone (identifiant)
              </label>
              <input
                id={`${fid}-phone`}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+221770000000"
                className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm tabular-nums"
              />
              {phone.length > 4 && !phoneValid && (
                <p className="mt-1 text-xs text-mata-700">
                  Format attendu : +221 suivi de 9 chiffres.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={`${fid}-type`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Type de production
              </label>
              <select
                id={`${fid}-type`}
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
                htmlFor={`${fid}-zone`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Zone principale
              </label>
              <select
                id={`${fid}-zone`}
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
                htmlFor={`${fid}-whatsapp`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                WhatsApp (optionnel)
              </label>
              <input
                id={`${fid}-whatsapp`}
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="+221770000000"
                className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor={`${fid}-bio`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Bio (optionnel)
              </label>
              <textarea
                id={`${fid}-bio`}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Présentez l'exploitation en quelques phrases."
                className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
              />
            </div>
          </div>

          {onboard.isError && (
            <p className="mt-4 text-sm text-mata-800 bg-mata-50 border border-mata-200 rounded-lg px-3 py-2">
              {onboard.error instanceof ApiError
                ? onboard.error.message
                : 'Échec de la création du producteur.'}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-4 px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold disabled:opacity-50"
          >
            {onboard.isPending ? 'Création…' : 'Créer le producteur'}
          </button>
        </section>
      )}
    </div>
  );
}
