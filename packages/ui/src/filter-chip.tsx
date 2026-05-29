import clsx from 'clsx';

type FilterChipProps = {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * Chip de filtre (mockup : `Toutes · 6`, `Validées · 3`, etc.).
 *
 * Style figé : foncé/blanc selon `selected`. Pattern récurrent en haut de
 * /producer/offers, /admin/producers, /client/catalog.
 */
export function FilterChip({
  selected,
  onClick,
  children,
  className,
}: FilterChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition',
        selected
          ? 'bg-stone-900 text-white'
          : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300',
        className,
      )}
    >
      {children}
    </button>
  );
}
