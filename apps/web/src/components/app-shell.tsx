'use client';

import { Icon } from '@mata/ui';
import { useState } from 'react';
import { Sidebar } from './sidebar';
import { TeleconsultBanner } from './teleconsult-banner';
import { Topbar } from './topbar';

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * AppShell complet : sidebar dark desktop + drawer mobile + topbar.
 * Le contenu enfant est rendu dans `<main>` avec scroll vertical.
 *
 * Référence : ARCHITECTURE.md §8 « Layouts · Chromed ».
 */
export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-stone-25">
      {/* Drawer overlay (mobile) */}
      {drawerOpen ? (
        <button
          type="button"
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          aria-label="Fermer le menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      {/* Sidebar — visible dès lg, drawer en dessous */}
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Colonne principale */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          onMenuClick={() => setDrawerOpen(true)}
          menuIcon={<Icon name="menu" className="w-5 h-5" />}
        />
        {/* Lot 6 — banniere session teleconseil (visible uniquement quand active). */}
        <TeleconsultBanner />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
