'use client';

import { CATEGORY_LABEL_FR, type ProductCategory } from '@mata/shared/constants';
import { FilterChip, Icon, ProductCard } from '@mata/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useGuestCatalog } from '../src/lib/api';
import { useCart } from '../src/lib/cart/use-cart';
import { cloudinaryThumb } from '../src/lib/cloudinary-url';

/**
 * Accueil public (racine `/`) · catalogue invité.
 *
 * Page d'entrée par défaut : tout visiteur (non identifié) voit le catalogue
 * complet, AVEC l'identité des producteurs MASQUÉE (API `/v1/guest/catalog/*`,
 * décision Lot 8). Il ajoute au panier (localStorage, partagé avec le checkout)
 * et finalise sur `/guest/checkout` (nom + téléphone + adresse). La connexion
 * est optionnelle (bouton « Se connecter »). Route exemptée d'auth (middleware).
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

export default function HomeCatalogPage(): React.JSX.Element {
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const cart = useCart();

  const { data, isLoading, error } = useGuestCatalog({
    page: 1,
    limit: 50,
    category: category === 'all' ? undefined : category,
    q: search.length >= 2 ? search : undefined,
  });

  const offers = data?.offers ?? [];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* En-tête public */}
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-9 h-9 rounded-lg bg-mata-700 flex items-center justify-center text-white font-extrabold text-sm">
              MA
            </span>
            <span className="hidden sm:block leading-tight">
              <span className="block font-bold text-stone-900 text-sm">MATA</span>
              <span className="block text-[10px] text-stone-500 uppercase tracking-wider">
                Du champ à l'assiette
              </span>
            </span>
          </Link>
          <div className="flex-1" />
          <Link
            href="/api/auth/login"
            className="px-3 py-2 rounded-xl text-sm font-semibold text-stone-700 hover:bg-stone-100"
          >
            Se connecter
          </Link>
          <Link
            href="/guest/checkout"
            className="relative px-3 py-2 bg-mata-700 hover:bg-mata-800 text-white rounded-xl text-sm font-bold flex items-center gap-2"
          >
            <Icon name="shopping-cart" className="w-4 h-4" />
            <span className="hidden sm:inline">Panier</span>
            {cart.totalCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-white text-mata-700 rounded-full text-[10px] font-bold tabular">
                {cart.totalCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-stone-900">Catalogue</h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Commandez vos produits frais — sans compte.
            </p>
          </div>
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
              <div key={o.id} className="flex flex-col h-full">
                <ProductCard
                  category={o.category}
                  title={o.title}
                  unit={o.unit}
                  priceFcfa={o.priceFcfa}
                  subtitle={o.qualityNote ?? undefined}
                  imageUrl={cloudinaryThumb(o.photoPublicIds[0]) ?? undefined}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => cart.add(o.id, 1)}
                  className="mt-2 w-full py-2 rounded-xl bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold flex items-center justify-center gap-1.5"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  {inCart ? `Ajouter (${inCart.quantity})` : 'Ajouter'}
                </button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
