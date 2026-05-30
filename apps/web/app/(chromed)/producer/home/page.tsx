import { KpiCard, RoleBadge } from '@mata/ui';

export default function ProducerHomePage(): React.JSX.Element {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-sm text-stone-500 flex items-center gap-2">
            <span>Espace</span>
            <RoleBadge role="producer" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-1">Accueil producteur</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Offres actives" value={0} icon="package" />
        <KpiCard label="À recevoir" value="0 F" icon="wallet" variant="primary" />
        <KpiCard label="Commandes du mois" value={0} icon="shopping-bag" />
        <KpiCard label="Note moyenne" value="—" icon="badge-check" />
      </div>
    </div>
  );
}
