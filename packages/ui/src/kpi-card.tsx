import clsx from 'clsx';
import { Icon, type IconName } from './icon.js';

export type KpiCardVariant = 'neutral' | 'primary' | 'success' | 'warning';

const VARIANT_CLASSES: Record<KpiCardVariant, { wrapper: string; label: string; iconBg: string }> =
  {
    neutral: {
      wrapper: 'bg-white border border-stone-200',
      label: 'text-stone-500',
      iconBg: 'bg-stone-100',
    },
    primary: {
      wrapper: 'bg-mata-700 text-white',
      label: 'text-mata-200',
      iconBg: 'bg-mata-800',
    },
    success: {
      wrapper: 'bg-white border border-stone-200',
      label: 'text-stone-500',
      iconBg: 'bg-green-50',
    },
    warning: {
      wrapper: 'bg-white border border-stone-200',
      label: 'text-stone-500',
      iconBg: 'bg-amber-50',
    },
  };

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  trend?: React.ReactNode;
  icon?: IconName;
  variant?: KpiCardVariant;
  className?: string;
};

export function KpiCard({
  label,
  value,
  trend,
  icon,
  variant = 'neutral',
  className,
}: KpiCardProps): React.JSX.Element {
  const classes = VARIANT_CLASSES[variant];
  return (
    <div className={clsx('rounded-xl p-4 shadow-soft', classes.wrapper, className)}>
      <div className="flex items-center justify-between">
        <div className={clsx('text-[11px] font-semibold uppercase tracking-wider', classes.label)}>
          {label}
        </div>
        {icon ? (
          <div
            className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', classes.iconBg)}
          >
            <Icon name={icon} className="w-3.5 h-3.5" />
          </div>
        ) : null}
      </div>
      <div
        className="text-2xl font-bold mt-2 tabular"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
      {trend ? (
        <div
          className={clsx(
            'text-xs font-semibold mt-1',
            variant === 'primary' ? 'text-mata-100' : 'text-stone-500',
          )}
        >
          {trend}
        </div>
      ) : null}
    </div>
  );
}
