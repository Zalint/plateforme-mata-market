import { CATEGORY_EMOJI, type OfferUnit, type ProductCategory } from '@mata/shared/constants';
import clsx from 'clsx';
import { Icon } from './icon.js';
import { Money } from './money.js';

const CATEGORY_BG: Record<ProductCategory, string> = {
  poultry: 'bg-amber-50',
  eggs: 'bg-yellow-50',
  cattle: 'bg-red-50',
  sheep: 'bg-stone-100',
  vegetables: 'bg-green-50',
  fish: 'bg-blue-50',
};

const UNIT_SHORT: Record<OfferUnit, string> = {
  unit: 'u',
  kg: 'kg',
  tray: 'pl',
  crate: 'c',
  head: '',
};

type ProductCardProps = {
  category: ProductCategory;
  title: string;
  unit: OfferUnit;
  priceFcfa: number;
  subtitle?: string; // ex: "3 producteurs · Pout, Thiès"
  onClick?: () => void;
  className?: string;
};

/**
 * Carte produit catalogue client (mockup section CLIENT/CATALOG).
 *
 * Lot 2 — décision MVP : 1 carte = 1 offre validée (pas d'agrégation par
 * produit). L'agrégation viendra avec le pricing normalisé.
 */
export function ProductCard({
  category,
  title,
  unit,
  priceFcfa,
  subtitle,
  onClick,
  className,
}: ProductCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex flex-col bg-white rounded-2xl shadow-soft border border-stone-200 overflow-hidden text-left hover:shadow-card transition',
        className,
      )}
    >
      <div
        className={clsx(
          'aspect-square shrink-0 flex items-center justify-center text-6xl lg:text-7xl',
          CATEGORY_BG[category],
        )}
      >
        {CATEGORY_EMOJI[category]}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-center gap-1">
          <Icon name="badge-check" className="w-3.5 h-3.5 text-mata-700" />
          <span className="text-[10px] font-semibold text-mata-700 uppercase tracking-wider">
            Validé MATA
          </span>
        </div>
        <div className="font-bold text-stone-900 text-sm mt-1">{title}</div>
        {subtitle && <div className="text-[11px] text-stone-500">{subtitle}</div>}
        <div className="mt-auto pt-2 flex items-end gap-1">
          <span className="text-[10px] text-stone-500">dès</span>
          <Money amount={priceFcfa} className="font-bold text-stone-900" />
          <span className="text-[10px] text-stone-500 mb-0.5">/{UNIT_SHORT[unit]}</span>
        </div>
      </div>
    </button>
  );
}
