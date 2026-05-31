'use client';

import { USER_ROLE_LABEL_FR } from '@mata/shared/schemas';
import { Icon } from '@mata/ui';
import { useMe } from '../lib/api';

type TopbarProps = {
  onMenuClick: () => void;
  menuIcon: React.ReactNode;
};

export function Topbar({ onMenuClick, menuIcon }: TopbarProps): React.JSX.Element {
  const { data: me } = useMe();
  const displayName = me?.displayName ?? '';
  const roleLabel = me ? USER_ROLE_LABEL_FR[me.role] : '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <header className="h-14 border-b border-stone-200 bg-white px-3 lg:px-6 flex items-center gap-3 sticky top-0 z-30">
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-700"
        aria-label="Ouvrir le menu"
      >
        {menuIcon}
      </button>

      <div className="flex-1 min-w-0" />

      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-stone-100 rounded-lg max-w-xs">
        <Icon name="search" className="w-4 h-4 text-stone-400" />
        <input
          className="bg-transparent outline-none text-sm placeholder:text-stone-400 w-40"
          placeholder="Rechercher..."
        />
      </div>

      <button
        type="button"
        className="relative w-9 h-9 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-700"
        aria-label="Notifications"
      >
        <Icon name="bell" className="w-5 h-5" />
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-mata-700" />
      </button>

      <div className="flex items-center gap-2.5">
        <div className="hidden sm:block text-right leading-tight">
          <p className="text-sm font-semibold text-stone-900 truncate max-w-[12rem]">
            {displayName || '…'}
          </p>
          {roleLabel && <p className="text-xs text-stone-500">{roleLabel}</p>}
        </div>
        <div className="w-9 h-9 rounded-full bg-mata-700 flex items-center justify-center text-white font-bold text-xs">
          {initial}
        </div>
      </div>
    </header>
  );
}
