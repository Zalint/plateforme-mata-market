'use client';

import {
  DELIVERY_PERIODS,
  type DeliveryPeriod,
  PICKUP_STATUS_LABEL_FR,
  PICKUP_TRANSITIONS,
  type PickupStatus,
} from '@mata/shared/constants';
import type { PickupOutput } from '@mata/shared/schemas';
import { FilterChip, Icon, usePrompt } from '@mata/ui';
import { useId, useMemo, useState } from 'react';
import {
  useAdminOrders,
  useAdminPickups,
  useCancelPickup,
  useCreatePickup,
  useTransitionPickupStatus,
  useZones,
} from '../../../../src/lib/api';

/**
 * Admin / Tournées · calendrier hebdomadaire de ramassage (Lot 7).
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/PICKUP (§2460) :
 * navigation semaine, filtres zone, grille jours × période, légende couleurs.
 * Adapté au modèle de données (période matin/après-midi au lieu de créneaux
 * horaires — `pickups.scheduled_period` réutilise DELIVERY_PERIODS).
 *
 * L'admin pilote tout le cycle : Planifiée → À confirmer → Confirmée →
 * En cours → Effectuée (state machine PICKUP_TRANSITIONS), + Annulation.
 */

const STATUS_VISUAL: Record<
  PickupStatus,
  { card: string; border: string; text: string; dot: string }
> = {
  scheduled: {
    card: 'bg-stone-100',
    border: 'border-stone-400',
    text: 'text-stone-600',
    dot: 'bg-stone-400',
  },
  to_confirm: {
    card: 'bg-amber-50',
    border: 'border-amber-600',
    text: 'text-amber-700',
    dot: 'bg-amber-600',
  },
  confirmed: {
    card: 'bg-green-50',
    border: 'border-green-600',
    text: 'text-green-700',
    dot: 'bg-green-600',
  },
  collecting: {
    card: 'bg-mata-100',
    border: 'border-mata-700',
    text: 'text-mata-700',
    dot: 'bg-mata-700',
  },
  collected: {
    card: 'bg-blue-50',
    border: 'border-blue-600',
    text: 'text-blue-700',
    dot: 'bg-blue-600',
  },
  cancelled: {
    card: 'bg-red-50',
    border: 'border-red-500',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function startOfWeek(offsetWeeks: number): Date {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7; // 0=lundi
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday + offsetWeeks * 7);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function sameDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

function fmtRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${monday.toLocaleDateString('fr-FR', { day: 'numeric' })} - ${sunday.toLocaleDateString('fr-FR', opts)}`;
}

export default function AdminPickupsPage(): React.JSX.Element {
  const [weekOffset, setWeekOffset] = useState(0);
  const [zoneFilter, setZoneFilter] = useState<string | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useAdminPickups();
  const { data: zonesData } = useZones();
  const zones = zonesData?.zones ?? [];
  const allPickups = useMemo(() => data?.pickups ?? [], [data]);

  const monday = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const days = useMemo(() => DAY_LABELS.map((_, i) => addDays(monday, i)), [monday]);

  // Filtre semaine + zone (client-side : la grille a besoin de toutes les
  // tournées de la semaine, le filtre serveur ne porte que sur status/zone).
  const weekPickups = useMemo(() => {
    const weekEnd = addDays(monday, 7);
    return allPickups.filter((p) => {
      const d = new Date(p.scheduledFor);
      if (d < monday || d >= weekEnd) return false;
      if (zoneFilter !== 'all' && p.zoneId !== zoneFilter) return false;
      return true;
    });
  }, [allPickups, monday, zoneFilter]);

  const selected = weekPickups.find((p) => p.id === selectedId) ?? null;

  // Compte par zone pour les chips (sur la semaine courante, avant filtre zone).
  const weekAll = useMemo(() => {
    const weekEnd = addDays(monday, 7);
    return allPickups.filter((p) => {
      const d = new Date(p.scheduledFor);
      return d >= monday && d < weekEnd;
    });
  }, [allPickups, monday]);

  function cellPickups(day: Date, period: DeliveryPeriod): PickupOutput[] {
    return weekPickups.filter((p) => p.scheduledPeriod === period && sameDay(p.scheduledFor, day));
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Calendrier de ramassage</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Semaine du {fmtRange(monday)} · groupage par zone
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-stone-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="px-2 py-1.5 text-stone-500 hover:bg-stone-50"
              aria-label="Semaine précédente"
            >
              <Icon name="chevron-left" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 text-xs font-semibold text-stone-700 border-l border-r border-stone-200 tabular"
            >
              {fmtRange(monday)}
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="px-2 py-1.5 text-stone-500 hover:bg-stone-50"
              aria-label="Semaine suivante"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-stone-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Nouvelle tournée
          </button>
        </div>
      </div>

      {/* Filtres zone */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
        <FilterChip selected={zoneFilter === 'all'} onClick={() => setZoneFilter('all')}>
          Toutes · {weekAll.length}
        </FilterChip>
        {zones.map((z) => {
          const count = weekAll.filter((p) => p.zoneId === z.id).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={z.id}
              selected={zoneFilter === z.id}
              onClick={() => setZoneFilter(z.id)}
            >
              {z.name} · {count}
            </FilterChip>
          );
        })}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}

      {/* Calendrier desktop */}
      <div className="hidden lg:block bg-white rounded-xl border border-stone-200 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-8 border-b border-stone-200 bg-stone-50">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                Période
              </div>
              {days.map((day, i) => (
                <div
                  key={day.toISOString()}
                  className="px-3 py-2 text-[11px] uppercase tracking-wider text-stone-500 font-semibold"
                >
                  {DAY_LABELS[i]} {day.getDate()}
                </div>
              ))}
            </div>
            {DELIVERY_PERIODS.map((period) => (
              <div
                key={period}
                className="grid grid-cols-8 border-b border-stone-100 min-h-[110px]"
              >
                <div className="px-3 py-3 text-xs text-stone-500 font-medium border-r border-stone-100">
                  {period === 'morning' ? 'Matin' : 'Après-midi'}
                </div>
                {days.map((day) => (
                  <div
                    key={`${period}-${day.toISOString()}`}
                    className="border-r border-stone-100 p-1.5 space-y-1.5"
                  >
                    {cellPickups(day, period).map((p) => {
                      const v = STATUS_VISUAL[p.status];
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className={`w-full text-left ${v.card} border-l-4 ${v.border} rounded p-2 text-xs hover:brightness-95`}
                        >
                          <div className="font-bold text-stone-900 truncate">{p.zoneName}</div>
                          <div className="text-[10px] text-stone-500 mt-0.5">
                            {p.items.length} item(s)
                          </div>
                          <span className={`text-[10px] font-semibold ${v.text} mt-1 inline-block`}>
                            {PICKUP_STATUS_LABEL_FR[p.status].toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Liste mobile */}
      <div className="lg:hidden space-y-3">
        {weekPickups.length === 0 && !isLoading && (
          <p className="text-sm text-stone-500 py-8 text-center">Aucune tournée cette semaine.</p>
        )}
        {weekPickups.map((p) => {
          const v = STATUS_VISUAL[p.status];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left bg-white rounded-xl border border-stone-200 border-l-4 ${v.border} shadow-soft p-3`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-stone-900">{p.zoneName}</span>
                <span
                  className={`text-[10px] font-bold ${v.card} ${v.text} px-1.5 py-0.5 rounded uppercase`}
                >
                  {PICKUP_STATUS_LABEL_FR[p.status]}
                </span>
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                {new Date(p.scheduledFor).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {p.scheduledPeriod === 'morning' ? 'matin' : 'après-midi'} · {p.items.length}{' '}
                item(s)
              </div>
            </button>
          );
        })}
      </div>

      {/* Légende */}
      <div className="mt-4 flex items-center gap-4 text-xs text-stone-600 flex-wrap">
        {(
          ['scheduled', 'to_confirm', 'confirmed', 'collecting', 'collected'] as PickupStatus[]
        ).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${STATUS_VISUAL[s].dot}`} />
            {PICKUP_STATUS_LABEL_FR[s]}
          </span>
        ))}
      </div>

      {selected && <PickupActionPanel pickup={selected} onClose={() => setSelectedId(null)} />}
      {showCreate && <CreatePickupModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Panneau d'action sur une tournée sélectionnée

function PickupActionPanel({
  pickup,
  onClose,
}: {
  pickup: PickupOutput;
  onClose: () => void;
}): React.JSX.Element {
  const transition = useTransitionPickupStatus();
  const cancel = useCancelPickup();
  const prompt = usePrompt();
  const nextStates = PICKUP_TRANSITIONS[pickup.status].filter((s) => s !== 'cancelled');
  const canCancel = PICKUP_TRANSITIONS[pickup.status].includes('cancelled');
  const v = STATUS_VISUAL[pickup.status];

  async function handleCancel(): Promise<void> {
    const reason = await prompt({
      title: 'Annuler la tournée',
      message: "Raison de l'annulation ? (3 caractères min)",
      confirmLabel: 'Annuler la tournée',
      cancelLabel: 'Retour',
      minLength: 3,
    });
    if (!reason) return;
    await cancel.mutateAsync({ id: pickup.id, reason });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/30 p-0 lg:p-6">
      <div className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="font-mono text-xs text-stone-500">{pickup.pickupNumber}</div>
            <h3 className="font-bold text-stone-900">
              Tournée {pickup.zoneName} ·{' '}
              {pickup.scheduledPeriod === 'morning' ? 'matin' : 'après-midi'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700"
            aria-label="Fermer"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-bold ${v.card} ${v.text} px-2 py-1 rounded-full uppercase tracking-wider`}
          >
            <span className={`w-2 h-2 rounded-full ${v.dot}`} />
            {PICKUP_STATUS_LABEL_FR[pickup.status]}
          </span>

          <div className="text-sm text-stone-600">
            {new Date(pickup.scheduledFor).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </div>

          <div className="space-y-2">
            {pickup.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50">
                <div className="flex-1 text-sm min-w-0">
                  <div className="font-semibold text-stone-900 truncate">
                    {item.offerTitle} × {item.quantity}
                  </div>
                  <div className="text-xs text-stone-500">
                    #{item.orderNumber} · {item.producerDisplayName}
                  </div>
                </div>
                {item.collected && (
                  <Icon name="check-circle" className="w-5 h-5 text-green-600 shrink-0" />
                )}
              </div>
            ))}
          </div>

          {pickup.cancelReason && (
            <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
              Annulée : {pickup.cancelReason}
            </p>
          )}

          {(nextStates.length > 0 || canCancel) && (
            <div className="flex items-center gap-2 flex-wrap pt-2">
              {nextStates.map((next) => (
                <button
                  key={next}
                  type="button"
                  onClick={() =>
                    transition.mutate({ id: pickup.id, to: next }, { onSuccess: onClose })
                  }
                  disabled={transition.isPending}
                  className="px-3 py-1.5 rounded-lg bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Icon name="arrow-right" className="w-3 h-3" />
                  {PICKUP_STATUS_LABEL_FR[next]}
                </button>
              ))}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={cancel.isPending}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  Annuler la tournée
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modale de création d'une tournée

function CreatePickupModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { data: zonesData } = useZones();
  const zones = zonesData?.zones ?? [];
  const { data: ordersData } = useAdminOrders('confirmed');
  const create = useCreatePickup();
  const fid = useId();

  const [zoneId, setZoneId] = useState('');
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState<DeliveryPeriod>('morning');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Items collectables : items des commandes confirmées (l'API rejette ceux
  // déjà rattachés à une tournée).
  const collectableItems = useMemo(() => {
    const orders = ordersData?.orders ?? [];
    return orders.flatMap((o) =>
      o.items.map((i) => ({
        id: i.id,
        label: `${i.offerTitle} × ${i.quantity}`,
        sub: `#${o.orderNumber} · ${i.producerDisplayName}`,
      })),
    );
  }, [ordersData]);

  function toggleItem(id: string): void {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (!zoneId || !date || selectedItems.size === 0) {
      setError('Zone, date et au moins un item sont requis.');
      return;
    }
    try {
      await create.mutateAsync({
        zoneId,
        scheduledFor: new Date(`${date}T08:00:00`).toISOString(),
        scheduledPeriod: period,
        orderItemIds: [...selectedItems],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/30 p-0 lg:p-6">
      <div className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-bold text-stone-900">Nouvelle tournée</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700"
            aria-label="Fermer"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label
              className="block text-xs font-semibold text-stone-600 mb-1"
              htmlFor={`${fid}-zone`}
            >
              Zone
            </label>
            <select
              id={`${fid}-zone`}
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
            >
              <option value="">— Choisir —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-semibold text-stone-600 mb-1"
                htmlFor={`${fid}-date`}
              >
                Date
              </label>
              <input
                id={`${fid}-date`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
            </div>
            <div>
              <label
                className="block text-xs font-semibold text-stone-600 mb-1"
                htmlFor={`${fid}-period`}
              >
                Période
              </label>
              <select
                id={`${fid}-period`}
                value={period}
                onChange={(e) => setPeriod(e.target.value as DeliveryPeriod)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              >
                <option value="morning">Matin</option>
                <option value="afternoon">Après-midi</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-stone-600 mb-1">
              Items à collecter ({selectedItems.size})
            </div>
            {collectableItems.length === 0 ? (
              <p className="text-xs text-stone-500 py-3">
                Aucun item collectable (commandes confirmées requises).
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {collectableItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="text-mata-700"
                    />
                    <div className="text-sm min-w-0">
                      <div className="font-semibold text-stone-900 truncate">{item.label}</div>
                      <div className="text-xs text-stone-500">{item.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">{error}</p>}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={create.isPending}
            className="w-full py-3 rounded-xl bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white font-bold flex items-center justify-center gap-2"
          >
            <Icon name="check" className="w-4 h-4" />
            {create.isPending ? 'Création…' : 'Créer la tournée'}
          </button>
        </div>
      </div>
    </div>
  );
}
