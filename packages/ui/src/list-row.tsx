import clsx from 'clsx';
import { Icon, type IconName } from './icon.js';

type ListRowProps = {
  icon?: IconName;
  iconClassName?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  onClick?: () => void;
};

export function ListRow({
  icon,
  iconClassName,
  title,
  meta,
  actions,
  className,
  onClick,
}: ListRowProps): React.JSX.Element {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-white text-left',
        onClick && 'hover:border-mata-300 transition',
        className,
      )}
    >
      {icon ? (
        <div
          className={clsx(
            'w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0',
            iconClassName,
          )}
        >
          <Icon name={icon} className="w-5 h-5 text-stone-700" />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-stone-900 text-sm">{title}</div>
        {meta ? <div className="text-xs text-stone-500 mt-0.5">{meta}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-1.5 shrink-0">{actions}</div> : null}
    </Tag>
  );
}
