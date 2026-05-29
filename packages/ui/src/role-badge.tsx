import clsx from 'clsx';

export type RoleBadgeRole = 'producer' | 'client' | 'admin';

const ROLE_CLASSES: Record<RoleBadgeRole, string> = {
  producer: 'bg-amber-100 text-amber-800',
  client: 'bg-blue-100 text-blue-800',
  admin: 'bg-mata-100 text-mata-800',
};

const ROLE_LABELS: Record<RoleBadgeRole, string> = {
  producer: 'Producteur',
  client: 'Client',
  admin: 'Admin MATA',
};

type RoleBadgeProps = {
  role: RoleBadgeRole;
  className?: string;
};

export function RoleBadge({ role, className }: RoleBadgeProps): React.JSX.Element {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
        ROLE_CLASSES[role],
        className,
      )}
      data-role={role}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
