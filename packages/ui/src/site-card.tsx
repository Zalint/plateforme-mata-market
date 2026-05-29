import { SITE_TYPE_LABEL_FR, type SiteType } from '@mata/shared/constants';
import clsx from 'clsx';
import { Icon } from './icon.js';
import { StatusBadge, type StatusTone } from './status-badge.js';

const TYPE_TONE: Record<SiteType, StatusTone> = {
  poulailler: 'warning',
  ferme: 'neutral',
  depot: 'info',
  mareyage: 'info',
};

type SiteCardProps = {
  index?: number; // numéro affiché dans la pastille (ordre dans la liste)
  name: string;
  type: SiteType;
  zoneName: string;
  geoLat?: number | null;
  geoLng?: number | null;
  vehicleAccess?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  pickupHours?: string | null;
  activeOffersCount?: number;
  children?: React.ReactNode; // boutons d'action (Modifier, Voir carte, ...)
  className?: string;
};

export function SiteCard({
  index,
  name,
  type,
  zoneName,
  geoLat,
  geoLng,
  vehicleAccess,
  contactName,
  contactPhone,
  pickupHours,
  activeOffersCount,
  children,
  className,
}: SiteCardProps): React.JSX.Element {
  return (
    <div
      className={clsx('bg-white rounded-2xl p-4 shadow-soft border border-stone-200', className)}
    >
      <div className="flex items-start gap-3">
        {index !== undefined && (
          <div className="w-10 h-10 rounded-lg bg-mata-700 text-white flex items-center justify-center font-bold text-sm shrink-0 tabular-nums">
            {index}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-bold text-stone-900">{name}</div>
            <StatusBadge tone={TYPE_TONE[type]}>{SITE_TYPE_LABEL_FR[type]}</StatusBadge>
          </div>
          <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
            <Icon name="map-pin" className="w-3 h-3" />
            <span>
              {zoneName}
              {geoLat != null && geoLng != null && (
                <span className="tabular-nums">
                  {' '}
                  · {geoLat.toFixed(4)}°N, {geoLng.toFixed(4)}°W
                </span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            {vehicleAccess && (
              <div className="flex items-center gap-1.5 text-stone-600">
                <Icon name="truck" className="w-3.5 h-3.5" />
                Accès {vehicleAccess}
              </div>
            )}
            {(contactName || contactPhone) && (
              <div className="flex items-center gap-1.5 text-stone-600">
                <Icon name="phone" className="w-3.5 h-3.5" />
                {contactName ? `${contactName} · ` : ''}
                {contactPhone ?? '—'}
              </div>
            )}
            {activeOffersCount !== undefined && (
              <div className="flex items-center gap-1.5 text-stone-600">
                <Icon name="package" className="w-3.5 h-3.5" />
                {activeOffersCount === 0
                  ? 'Aucune offre'
                  : activeOffersCount === 1
                    ? '1 offre active'
                    : `${activeOffersCount} offres actives`}
              </div>
            )}
            {pickupHours && (
              <div className="flex items-center gap-1.5 text-stone-600">
                <Icon name="clock" className="w-3.5 h-3.5" />
                {pickupHours}
              </div>
            )}
          </div>
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
