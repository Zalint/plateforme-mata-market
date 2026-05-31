'use client';

import { PICKUP_STATUS_LABEL_FR, type PickupStatus } from '@mata/shared/constants';
import { Icon } from '@mata/ui';
import { NotificationPermissionPrompt } from '../../../../src/components/notification-permission-prompt';
import { useMyPickups } from '../../../../src/lib/api';

/**
 * Producer / Mes collectes · tournées de ramassage qui contiennent au moins
 * un item du producteur connecté (lecture seule).
 *
 * Reproduit la maquette `mockup/index.html` (cartes collecte producteur, §405
 * « Prochaines collectes ») adaptée au modèle de données (zone + période).
 *
 * Le producteur ne pilote pas la tournée — il est notifié (push web Lot 7).
 * On profite de cet écran « signifiant » pour proposer l'activation du push.
 */

const VISUAL: Record<PickupStatus, { dot: string; border: string }> = {
  scheduled: { dot: 'bg-stone-400', border: 'border-l-stone-400' },
  to_confirm: { dot: 'bg-amber-600', border: 'border-l-amber-600' },
  confirmed: { dot: 'bg-green-600', border: 'border-l-green-600' },
  collecting: { dot: 'bg-mata-700', border: 'border-l-mata-700' },
  collected: { dot: 'bg-blue-600', border: 'border-l-blue-600' },
  cancelled: { dot: 'bg-red-500', border: 'border-l-red-500' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function ProducerPickupsPage(): React.JSX.Element {
  const { data, isLoading } = useMyPickups();
  const pickups = data?.pickups ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Mes collectes</h1>
      </div>

      {pickups.length > 0 && (
        <NotificationPermissionPrompt reason="Soyez prévenu dès qu'une tournée de collecte est planifiée ou confirmée chez vous." />
      )}

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && pickups.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center">
          <Icon name="calendar" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">Aucune collecte planifiée pour le moment.</p>
        </div>
      )}

      <div className="space-y-3">
        {pickups.map((p) => {
          const visual = VISUAL[p.status];
          const period = p.scheduledPeriod === 'morning' ? 'Matin' : 'Après-midi';
          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl border border-stone-200 border-l-4 ${visual.border} shadow-soft p-4 lg:p-5`}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-stone-500 tabular">
                      {p.pickupNumber}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-700">
                      <span className={`w-2 h-2 rounded-full ${visual.dot}`} />
                      {PICKUP_STATUS_LABEL_FR[p.status]}
                    </span>
                  </div>
                  <div className="font-bold text-stone-900 mt-1">
                    Tournée {p.zoneName} · {period}
                  </div>
                  <div className="text-xs text-stone-500 capitalize">
                    {formatDate(p.scheduledFor)}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {p.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-3 rounded-xl bg-stone-50">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-lg shrink-0">
                      📦
                    </div>
                    <div className="flex-1 text-sm min-w-0">
                      <div className="font-semibold text-stone-900 truncate">
                        {item.offerTitle} × {item.quantity}
                      </div>
                      <div className="text-xs text-stone-500">Commande #{item.orderNumber}</div>
                    </div>
                    {item.collected && (
                      <Icon name="check-circle" className="w-5 h-5 text-green-600 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
