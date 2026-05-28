import clsx from 'clsx';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-stone-200 text-stone-700',
};

type StatusBadgeProps = {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
};

export function StatusBadge({ tone, children, className }: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
