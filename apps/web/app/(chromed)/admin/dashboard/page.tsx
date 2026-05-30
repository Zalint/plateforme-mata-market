import { KpiCard, RoleBadge } from '@mata/ui';

export default function AdminDashboardPage(): React.JSX.Element {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-sm text-stone-500 flex items-center gap-2">
            <span>Espace</span>
            <RoleBadge role="admin" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-1">Dashboard MATA</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Producteurs actifs" value={0} icon="users" />
        <KpiCard label="Offres en attente" value={0} icon="clock" variant="warning" />
        <KpiCard label="Commandes du jour" value={0} icon="shopping-bag" />
        <KpiCard label="Reversements" value="0 F" icon="wallet" variant="primary" />
      </div>
    </div>
  );
}
