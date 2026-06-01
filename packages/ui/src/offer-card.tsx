import {
  CATEGORY_EMOJI,
  CATEGORY_LABEL_FR,
  OFFER_STATUS_LABEL_FR,
  OFFER_UNIT_LABEL_FR_PLURAL,
  type OfferStatus,
  type OfferUnit,
  type ProductCategory,
} from '@mata/shared/constants';
import clsx from 'clsx';
import { Money } from './money.js';
import { StatusBadge, type StatusTone } from './status-badge.js';

/**
 * Carte d'offre (variant producer + admin). Reproduit la maquette
 * `mockup/index.html` section PRODUCER/OFFERS et ADMIN/OFFERS.
 *
 * Pas d'actions intégrées : les boutons (Stock, Modifier, Valider, Refuser…)
 * sont passés en `children` pour rester flexibles selon le contexte.
 */

const CATEGORY_BG: Record<ProductCategory, string> = {
  poultry: 'bg-amber-100',
  eggs: 'bg-yellow-100',
  cattle: 'bg-red-50',
  sheep: 'bg-stone-100',
  vegetables: 'bg-green-50',
  fish: 'bg-blue-50',
};

const STATUS_TONE: Record<OfferStatus, StatusTone> = {
  draft: 'neutral',
  pending: 'warning',
  changes_requested: 'warning',
  validated: 'success',
  rejected: 'danger',
  expired: 'neutral',
  archived: 'neutral',
  suspended: 'neutral',
  withdrawn: 'neutral', // retirée par MATA
  reserved: 'info', // Lot 4 : stock épuisé temporairement
  sold: 'neutral', // Lot 4 : épuisé définitivement
};

type OfferCardProps = {
  category: ProductCategory;
  status: OfferStatus;
  title: string;
  unit: OfferUnit;
  quantity: number;
  priceFcfa: number;
  siteName: string;
  subtitle?: string; // ex: "Publiée le 24 mai" ou "Soumise il y a 1h"
  rejectionReason?: string | null;
  pending?: boolean; // affiche le bandeau "En attente de validation MATA"
  /** Emoji de la catégorie (taxonomie data-driven) ; fallback slug puis 📦. */
  emoji?: string;
  children?: React.ReactNode; // grid d'actions facultatif (boutons / Links)
  className?: string;
};

/**
 * La carte est volontairement non-interactive (a11y). Pour la rendre cliquable
 * dans son ensemble, l'envelopper dans un `<Link>` côté caller. Sinon, placer
 * un bouton "Voir la fiche" dans `children`.
 */
export function OfferCard({
  category,
  status,
  title,
  unit,
  quantity,
  priceFcfa,
  siteName,
  subtitle,
  rejectionReason,
  pending,
  emoji,
  children,
  className,
}: OfferCardProps): React.JSX.Element {
  return (
    <div
      className={clsx('bg-white rounded-2xl p-4 shadow-soft border border-stone-200', className)}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0',
            CATEGORY_BG[category] ?? 'bg-stone-100',
          )}
        >
          {emoji ?? CATEGORY_EMOJI[category] ?? '📦'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-stone-900">{title}</div>
            <StatusBadge tone={STATUS_TONE[status]}>{OFFER_STATUS_LABEL_FR[status]}</StatusBadge>
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            {siteName}
            {subtitle ? ` · ${subtitle}` : ''}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-stone-900 tabular-nums">{quantity}</span>
              <span className="text-xs text-stone-500">{OFFER_UNIT_LABEL_FR_PLURAL[unit]}</span>
            </div>
            <span className="text-stone-300">·</span>
            <Money amount={priceFcfa} className="font-bold text-stone-900" />
            <span className="text-xs text-stone-500">/{categoryUnitLabel(unit)}</span>
          </div>
          {pending && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-medium">
              ⏳ En attente de validation MATA
            </div>
          )}
          {rejectionReason &&
            (status === 'withdrawn' ? (
              <div className="mt-2 text-xs text-stone-700 bg-stone-100 inline-block px-2 py-1 rounded-md">
                Retirée par MATA : {rejectionReason}
              </div>
            ) : status === 'changes_requested' ? (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 inline-block px-2 py-1 rounded-md">
                Corrections demandées : {rejectionReason}
              </div>
            ) : (
              <div className="mt-2 text-xs text-red-700 bg-red-50 inline-block px-2 py-1 rounded-md">
                Refusée : {rejectionReason}
              </div>
            ))}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {/* Note catégorie pour SEO/a11y, masqué visuellement */}
      <span className="sr-only">{CATEGORY_LABEL_FR[category] ?? category}</span>
    </div>
  );
}

function categoryUnitLabel(unit: OfferUnit): string {
  // Étiquette courte pour le prix (`/unité`, `/kg`, `/plateau`...)
  return (
    { unit: 'unité', kg: 'kg', tray: 'plateau', crate: 'caisse', head: 'tête' } as Record<
      OfferUnit,
      string
    >
  )[unit];
}
