'use client';

import { CATEGORY_LABEL_FR, type ProductCategory } from '@mata/shared/constants';
import { FilterChip, Icon, ProductCard } from '@mata/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useCatalogOffers } from '../../../../src/lib/api';
import { useCart } from '../../../../src/lib/cart/use-cart';

/**
 * Client / Catalogue · offres validées MATA (lecture publique authentifiée).
 *
 * Reproduit la maquette `mockup/index.html` section CLIENT/CATALOG.
 *
 * Lot 4 : bouton "+ Panier" sur chaque carte qui pousse dans le panier
 * localStorage (cf. `useCart`). Le badge en haut affiche le compteur live.
 */

const CATEGORIES: (ProductCategory | 'all')[] = [
  'all',
  'poultry',
  'cattle',
  'sheep',
  'eggs',
  'vegetables',
  'fish',
];

export default function ClientCatalogPage(): React.JSX.Element {
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const cart = useCart();

  const { data, isLoading, error } = useCatalogOffers({
    page: 1,
    limit: 50,
    category: category === 'all' ? undefined : category,
    q: search.length >= 2 ? search : undefined,
  });

  const offers = data?.offers ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-stone-900">Catalogue</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-xl shadow-soft w-full sm:w-auto sm:max-w-xs">
            <Icon name="search" className="w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-stone-400"
            />
          </div>
          <Link
            href="/client/cart"
            className="px-3 py-2 bg-mata-700 hover:bg-mata-800 text-white rounded-xl text-sm font-bold shadow-soft flex items-center gap-2"
          >
            <Icon name="shopping-cart" className="w-4 h-4" /> Panier
            {cart.totalCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white text-mata-700 rounded-full text-[10px] font-bold tabular">
                {cart.totalCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-5 pb-1">
        {CATEGORIES.map((c) => (
          <FilterChip key={c} selected={category === c} onClick={() => setCategory(c)}>
            {c === 'all' ? 'Tout' : CATEGORY_LABEL_FR[c]}
          </FilterChip>
        ))}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-md">
          Erreur : {error.message}
        </p>
      )}
      {!isLoading && offers.length === 0 && (
        <div className="text-center py-12 text-stone-500">
          <Icon name="package" className="w-12 h-12 mx-auto text-stone-300" />
          <p className="mt-3 text-sm">Aucune offre disponible pour ces filtres.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
        {offers.map((o) => {
          const inCart = cart.items.find((i) => i.offerId === o.id);
          return (
            <div key={o.id} className="relative">
              <ProductCard
                category={o.category}
                title={o.title}
                unit={o.unit}
                priceFcfa={o.priceFcfa}
                subtitle={`${o.producer.displayName} · ${o.site.name}`}
              />
              <button
                type="button"
                onClick={() => cart.add(o.id, 1)}
                className="absolute bottom-2 right-2 px-2.5 py-1.5 bg-mata-700 hover:bg-mata-800 text-white rounded-lg text-xs font-bold shadow-soft flex items-center gap-1"
              >
                <Icon name="plus" className="w-3 h-3" />
                {inCart ? ` ${inCart.quantity}` : ' Panier'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
