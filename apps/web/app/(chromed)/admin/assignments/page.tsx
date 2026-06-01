'use client';

import type { AssignmentContextResponse } from '@mata/shared/schemas';
import { Icon, useToast } from '@mata/ui';
import { useMemo, useState } from 'react';
import { ApiError, useAssignmentContext, useUpdateAssignmentScope } from '../../../../src/lib/api';

type Producer = AssignmentContextResponse['producers'][number];
type Teleconsultant = AssignmentContextResponse['teleconsultants'][number];

/**
 * Admin / Affectations · portée de MODÉRATION producteur ↔ téléconseiller.
 *
 * Un téléconseiller modère (valider/refuser/retirer/suspendre) UNIQUEMENT les
 * offres de ses producteurs affectés. « Tous les producteurs » = portée globale
 * (comme un admin). Aucune affectation = il ne voit AUCUNE offre. La délégation
 * (assister un producteur via code) n'est PAS concernée par ce mapping.
 */
export default function AdminAssignmentsPage(): React.JSX.Element {
  const { data, isLoading } = useAssignmentContext();
  const update = useUpdateAssignmentScope();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allProducers, setAllProducers] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('all');

  const teleconsultants = data?.teleconsultants ?? [];
  const producers = data?.producers ?? [];

  const tcNameById = useMemo(
    () => new Map(teleconsultants.map((t) => [t.id, t.displayName])),
    [teleconsultants],
  );
  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const p of producers) if (p.zoneName) set.add(p.zoneName);
    return [...set].sort();
  }, [producers]);

  const selected = teleconsultants.find((t) => t.id === selectedId) ?? null;

  function selectTeleconsultant(tc: Teleconsultant): void {
    setSelectedId(tc.id);
    setAllProducers(tc.allProducers);
    setChecked(
      new Set(producers.filter((p) => p.teleconsultantUserIds.includes(tc.id)).map((p) => p.id)),
    );
    setSearch('');
    setZone('all');
  }

  function toggleProducer(id: string): void {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    if (!selectedId) return;
    try {
      await update.mutateAsync({
        teleconsultantUserId: selectedId,
        data: { allProducers, producerUserIds: allProducers ? [] : [...checked] },
      });
      toast.success('Affectations enregistrées.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    }
  }

  const visibleProducers = producers.filter(
    (p) =>
      (zone === 'all' || p.zoneName === zone) &&
      p.displayName.toLowerCase().includes(search.toLowerCase().trim()),
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-stone-900">Affectations</h1>
        <p className="text-sm text-stone-500 mt-1">
          Définissez les producteurs que chaque téléconseiller peut <strong>modérer</strong>{' '}
          (valider, refuser, retirer, suspendre). « Tous les producteurs » = portée globale. Aucune
          affectation = il ne voit aucune offre. La délégation (assister un producteur via code)
          reste ouverte à tous, indépendamment de ce réglage.
        </p>
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}

      {!isLoading && (
        <div className="grid lg:grid-cols-[260px_1fr] gap-5">
          {/* Liste des téléconseillers */}
          <section className="bg-white rounded-2xl border border-stone-200 shadow-soft p-3 h-fit">
            <h2 className="font-bold text-stone-900 px-2 py-1 text-sm">Téléconseillers</h2>
            {teleconsultants.length === 0 && (
              <p className="text-sm text-stone-500 px-2 py-3">Aucun téléconseiller.</p>
            )}
            <ul className="space-y-0.5">
              {teleconsultants.map((tc) => {
                const count = producers.filter((p) =>
                  p.teleconsultantUserIds.includes(tc.id),
                ).length;
                const summary = tc.allProducers
                  ? 'Tous'
                  : count > 0
                    ? `${count} producteur${count > 1 ? 's' : ''}`
                    : 'Aucun';
                return (
                  <li key={tc.id}>
                    <button
                      type="button"
                      onClick={() => selectTeleconsultant(tc)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                        selectedId === tc.id
                          ? 'bg-mata-100 text-mata-800 font-semibold'
                          : 'hover:bg-stone-50 text-stone-700'
                      }`}
                    >
                      <div className="truncate">{tc.displayName}</div>
                      <div className="text-xs text-stone-500">Modère : {summary}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Panneau de configuration */}
          <section className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
            {!selected ? (
              <p className="text-sm text-stone-500 py-8 text-center">
                Sélectionnez un téléconseiller pour configurer son périmètre.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <h2 className="font-bold text-stone-900">{selected.displayName}</h2>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={update.isPending}
                    className="px-4 py-2 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Icon name="save" className="w-4 h-4" />
                    {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>

                <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allProducers}
                    onChange={(e) => setAllProducers(e.target.checked)}
                    className="w-4 h-4 accent-mata-700"
                  />
                  <span className="text-sm font-semibold text-stone-800">
                    Tous les producteurs (portée globale, comme un admin)
                  </span>
                </label>

                {!allProducers && checked.size === 0 && (
                  <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
                    Aucun producteur sélectionné — ce téléconseiller ne verra aucune offre à
                    modérer.
                  </div>
                )}

                {!allProducers && (
                  <>
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <Icon
                          name="search"
                          className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2"
                        />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Rechercher un producteur…"
                          className="w-full pl-9 pr-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
                        />
                      </div>
                      <select
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                        className="px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm bg-white"
                      >
                        <option value="all">Toutes zones</option>
                        {zones.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ul className="divide-y divide-stone-100 max-h-[480px] overflow-y-auto">
                      {visibleProducers.length === 0 && (
                        <li className="py-3 text-sm text-stone-500">Aucun producteur.</li>
                      )}
                      {visibleProducers.map((p) => (
                        <ProducerRow
                          key={p.id}
                          producer={p}
                          checked={checked.has(p.id)}
                          onToggle={() => toggleProducer(p.id)}
                          otherTeleconsultants={p.teleconsultantUserIds
                            .filter((id) => id !== selected.id)
                            .map((id) => tcNameById.get(id) ?? '—')}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ProducerRow({
  producer,
  checked,
  onToggle,
  otherTeleconsultants,
}: {
  producer: Producer;
  checked: boolean;
  onToggle: () => void;
  otherTeleconsultants: string[];
}): React.JSX.Element {
  return (
    <li className="py-2.5">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="w-4 h-4 accent-mata-700 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-stone-900 truncate">{producer.displayName}</div>
          <div className="text-xs text-stone-500">
            {producer.zoneName ?? 'Zone inconnue'}
            {otherTeleconsultants.length > 0 && (
              <span className="text-stone-400"> · aussi : {otherTeleconsultants.join(', ')}</span>
            )}
          </div>
        </div>
      </label>
    </li>
  );
}
