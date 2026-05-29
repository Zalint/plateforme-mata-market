import { Icon, RoleBadge } from '@mata/ui';

export default function ClientCatalogPage(): React.JSX.Element {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-sm text-stone-500 flex items-center gap-2">
            <span>Espace</span>
            <RoleBadge role="client" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-1">Catalogue client</h1>
          <p className="text-sm text-stone-500 mt-1">
            Placeholder Lot 1 · le vrai catalogue validé MATA arrive au Lot 2 (offers) puis au Lot 4
            (commandes).
          </p>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-white border border-stone-200 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Icon name="info" className="w-5 h-5 text-blue-700" />
        </div>
        <div>
          <div className="font-bold text-stone-900">Lot 1 en place</div>
          <div className="text-sm text-stone-600 mt-1">
            L’AppShell est connecté côté client. Le catalogue produits, le panier, le checkout et la
            demande de gros volume arrivent dans les Lots 2 et 4.
          </div>
        </div>
      </div>
    </div>
  );
}
