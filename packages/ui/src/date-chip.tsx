import clsx from 'clsx';

const MONTH_FR = [
  'jan',
  'fév',
  'mars',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sept',
  'oct',
  'nov',
  'déc',
] as const;

type DateChipProps = {
  date: Date | string;
  className?: string;
};

/**
 * Chip compact « Mois / Jour » utilisé dans les listes de tournées et de
 * commandes (cf. mockup « Prochaines collectes »).
 */
export function DateChip({ date, className }: DateChipProps): React.JSX.Element {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const monthIdx = d.getMonth();
  const month = monthIdx >= 0 && monthIdx < 12 ? MONTH_FR[monthIdx] : '?';

  return (
    <div className={clsx('text-center', className)}>
      <div className="text-[10px] uppercase text-stone-500 font-semibold">{month}</div>
      <div
        className="text-xl font-bold text-stone-900 tabular"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {day}
      </div>
    </div>
  );
}
