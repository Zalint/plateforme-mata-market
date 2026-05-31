'use client';

import { Icon, KpiCard, Money, RoleBadge } from '@mata/ui';
import Link from 'next/link';
import { useMe, useMyClientDashboardKpis } from '../../../../src/lib/api';

// RoleBadge n'a qu'un libellé « client » (pas de distinction pro/particulier).

/** Formate une date ISO (YYYY-MM-DD) en JJ/MM/AAAA sans décalage de fuseau. */
function frDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function ClientHomePage(): React.JSX.Element {
  const { data: me } = useMe();
  const { data } = useMyClientDashboardKpis();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-sm text-stone-500 flex items-center gap-2">
            <span>Espace</span>
            <RoleBadge role="client" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-1">
            Bonjour{me?.displayName ? `, ${me.displayName}` : ''}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Commandes en cours" value={data?.commandesEnCours ?? '—'} icon="shopping-bag" />
        <KpiCard label="Livrées" value={data?.commandesLivrees ?? '—'} icon="package-check" />
        <KpiCard
          label="Total dépensé"
          value={data ? <Money amount={data.totalDepenseFcfa} /> : '—'}
          icon="wallet"
          variant="primary"
        />
        <KpiCard
          label="Prochaine livraison"
          value={data ? (data.prochaineLivraison ? frDate(data.prochaineLivraison) : '—') : '—'}
          icon="calendar"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/client/catalog"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold"
        >
          <Icon name="grid-2x2" className="w-4 h-4" /> Parcourir le catalogue
        </Link>
        <Link
          href="/client/orders"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-stone-200 text-stone-700 text-sm font-semibold hover:bg-stone-50"
        >
          <Icon name="package-check" className="w-4 h-4" /> Mes commandes
        </Link>
      </div>
    </div>
  );
}
