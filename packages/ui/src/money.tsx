import clsx from 'clsx';

/**
 * Formate un montant en FCFA. Entier strict (jamais de centimes).
 *
 * Note : Node 22 / ICU récent utilise U+202F (narrow no-break space) ou
 * U+00A0 (no-break space) comme séparateur de milliers en `fr-FR`. On
 * normalise vers un espace ASCII simple pour rester cohérent avec le mockup
 * HTML et faciliter les tests de comparaison de chaînes.
 *
 * Référence : ARCHITECTURE.md §14 « FCFA / F · int, jamais de centimes ».
 */
export function formatFcfa(amount: number): string {
  if (!Number.isFinite(amount)) return '— F';
  const rounded = Math.trunc(amount);
  const formatted = rounded.toLocaleString('fr-FR').replace(/[    ]/g, ' ');
  return `${formatted} F`;
}

type MoneyProps = {
  amount: number;
  className?: string;
  bold?: boolean;
};

export function Money({ amount, className, bold = true }: MoneyProps): React.JSX.Element {
  return (
    <span
      className={clsx('tabular', bold && 'font-bold', className)}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {formatFcfa(amount)}
    </span>
  );
}
