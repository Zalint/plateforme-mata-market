'use client';

import { PRODUCER_TYPE_LABEL_FR, PRODUCER_TYPES, type ProducerType } from '@mata/shared/constants';
import {
  ADMIN_CREATABLE_ROLES,
  type AdminCreatableRole,
  type AdminCreateUserResponse,
  USER_ROLE_LABEL_FR,
} from '@mata/shared/schemas';
import { Icon } from '@mata/ui';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ApiError, useCreateUser, useMe, useZones } from '../../../../../src/lib/api';

const PHONE_RE = /^\+221\d{9}$/;
const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * Admin · création d'un compte utilisateur, tous rôles (Lot 9).
 *
 * Même mécanique que l'onboarding producteur : compte Keycloak provisionné +
 * mot de passe temporaire affiché UNE SEULE FOIS. Pour le rôle producteur, on
 * demande en plus le type + la zone (un profil `pending` est créé). L'autorisation
 * réelle est vérifiée côté API (admin / super_admin) ; ce garde-fou est cosmétique.
 */
export default function NewUserPage(): React.JSX.Element {
  const { data: me } = useMe();
  const { data: zonesData } = useZones();
  const create = useCreateUser();
  const fid = useId();

  const zones = zonesData?.zones ?? [];

  const [role, setRole] = useState<AdminCreatableRole>('client_pro');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('+221');
  const [type, setType] = useState<ProducerType>('poultry');
  const [zoneId, setZoneId] = useState('');
  const [result, setResult] = useState<AdminCreateUserResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (zones.length > 0 && !zoneId) {
      const first = zones[0];
      if (first) setZoneId(first.id);
    }
  }, [zones, zoneId]);

  const phoneValid = PHONE_RE.test(phone);
  const producerOk = role !== 'producer' || !!zoneId;
  const canSubmit = displayName.trim().length >= 2 && phoneValid && producerOk && !create.isPending;

  function handleSubmit(): void {
    if (!canSubmit) return;
    // `mutate` (et non `mutateAsync`) : l'erreur est capturée par TanStack Query
    // (create.isError / create.error) et affichée inline, sans rejection non
    // gérée (qui produisait l'overlay « ApiError: 409 … » en dev).
    create.mutate(
      {
        displayName: displayName.trim(),
        phone,
        role,
        type: role === 'producer' ? type : undefined,
        zoneId: role === 'producer' ? zoneId : undefined,
      },
      { onSuccess: (res) => setResult(res) },
    );
  }

  function resetForm(): void {
    setResult(null);
    setCopied(false);
    setDisplayName('');
    setPhone('+221');
  }

  function copyPassword(pwd: string): void {
    void navigator.clipboard?.writeText(pwd).then(() => setCopied(true));
  }

  if (me && !ADMIN_ROLES.includes(me.role)) {
    return <p className="px-4 py-8 text-sm text-stone-500">Accès réservé aux admins MATA.</p>;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Créer un utilisateur</h1>
      <p className="text-sm text-stone-500 mt-1">
        Crée un compte (client, téléconseiller, producteur ou admin). Un mot de passe temporaire est
        généré, à communiquer à l'utilisateur (il devra le changer à sa première connexion).
      </p>

      {result ? (
        <section className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
          <div className="flex items-center gap-2 text-green-700">
            <Icon name="check" className="w-5 h-5" />
            <h2 className="font-bold">
              Compte créé — {USER_ROLE_LABEL_FR[result.role]}
              {result.role === 'producer' ? ' (à valider)' : ''}
            </h2>
          </div>
          <p className="text-sm text-stone-600 mt-2">
            <strong className="text-stone-900">{result.displayName}</strong> a été enregistré.
            Communiquez-lui ses identifiants.
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
              ⚠️ Ce mot de passe ne sera plus affiché. À changer à la première connexion.
            </p>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold"
            >
              Créer un autre compte
            </button>
          </div>
        </section>
      ) : (
        <section className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`${fid}-role`}
                className="text-xs font-semibold text-stone-700 uppercase tracking-wider"
              >
                Rôle
              </label>
              <select
                id={`${fid}-role`}
                value={role}
                onChange={(e) => setRole(e.target.value as AdminCreatableRole)}
                className="mt-1 w-full px-3 py-2.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
              >
                {ADMIN_CREATABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABEL_FR[r]}
                  </option>
                ))}
              </select>
            </div>

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
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nom complet"
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

            {role === 'producer' && (
              <>
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
              </>
            )}
          </div>

          {create.isError && (
            <p className="mt-4 text-sm text-mata-800 bg-mata-50 border border-mata-200 rounded-lg px-3 py-2">
              {create.error instanceof ApiError
                ? create.error.message
                : 'Échec de la création du compte.'}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-4 px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold disabled:opacity-50"
          >
            {create.isPending ? 'Création…' : 'Créer le compte'}
          </button>
        </section>
      )}

      <div className="mt-4">
        <Link
          href="/admin/producers"
          className="text-sm text-mata-700 font-semibold hover:underline"
        >
          → Voir les producteurs
        </Link>
      </div>
    </div>
  );
}
