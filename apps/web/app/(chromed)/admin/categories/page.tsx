'use client';

import type { CategoryOutput } from '@mata/shared/schemas';
import { Icon, StatusBadge, useToast } from '@mata/ui';
import { useState } from 'react';
import {
  ApiError,
  useAdminCategories,
  useCreateCategory,
  useUpdateCategory,
} from '../../../../src/lib/api';

/**
 * Admin / Catégories produit · taxonomie data-driven (table product_categories).
 *
 * Créer une catégorie (slug figé + label + emoji + ordre), éditer
 * (label / emoji / ordre) et activer/désactiver. On ne supprime jamais : la
 * désactivation la retire des listes sans casser les offres existantes.
 *
 * Rappel : une nouvelle catégorie a besoin d'une règle de pricing (écran
 * Pricing, scope catégorie) avant qu'un client puisse commander.
 */
export default function AdminCategoriesPage(): React.JSX.Element {
  const { data, isLoading } = useAdminCategories();
  const categories = data?.categories ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-stone-900">Catégories produit</h1>
        <p className="text-sm text-stone-500 mt-1">
          La taxonomie est dynamique : créez ou désactivez des catégories sans déploiement. Pensez à
          créer une règle de pricing pour toute nouvelle catégorie.
        </p>
      </div>

      <CreateCategoryCard />

      <section className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <h2 className="font-bold text-stone-900 mb-3">Catégories existantes</h2>
        {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
        {!isLoading && categories.length === 0 && (
          <p className="text-sm text-stone-500">Aucune catégorie.</p>
        )}
        <ul className="divide-y divide-stone-100">
          {categories.map((c) => (
            <CategoryRow key={c.slug} category={c} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function CreateCategoryCard(): React.JSX.Element {
  const create = useCreateCategory();
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [labelFr, setLabelFr] = useState('');
  const [emoji, setEmoji] = useState('');
  const [sortOrder, setSortOrder] = useState(0);

  async function handleCreate(): Promise<void> {
    try {
      await create.mutateAsync({ slug, labelFr, emoji, sortOrder });
      toast.success(`Catégorie « ${labelFr} » créée.`);
      setSlug('');
      setLabelFr('');
      setEmoji('');
      setSortOrder(0);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Création impossible');
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
      <h2 className="font-bold text-stone-900 mb-3">Nouvelle catégorie</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Slug (figé)">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="caprin"
            className="w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          />
        </Field>
        <Field label="Libellé FR">
          <input
            value={labelFr}
            onChange={(e) => setLabelFr(e.target.value)}
            placeholder="Caprin"
            className="w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
          />
        </Field>
        <Field label="Emoji">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🐐"
            className="w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm text-center"
          />
        </Field>
        <Field label="Ordre">
          <input
            type="number"
            value={sortOrder}
            min={0}
            onChange={(e) => setSortOrder(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            className="w-full px-3 py-2 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm tabular-nums"
          />
        </Field>
      </div>
      <button
        type="button"
        onClick={handleCreate}
        disabled={create.isPending || !slug || !labelFr || !emoji}
        className="mt-4 px-4 py-2.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2"
      >
        <Icon name="plus" className="w-4 h-4" />
        {create.isPending ? 'Création…' : 'Créer la catégorie'}
      </button>
    </section>
  );
}

function CategoryRow({ category }: { category: CategoryOutput }): React.JSX.Element {
  const update = useUpdateCategory();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [labelFr, setLabelFr] = useState(category.labelFr);
  const [emoji, setEmoji] = useState(category.emoji);
  const [sortOrder, setSortOrder] = useState(category.sortOrder);

  async function save(data: Parameters<typeof update.mutateAsync>[0]['data']): Promise<void> {
    try {
      await update.mutateAsync({ slug: category.slug, data });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Modification impossible');
    }
  }

  async function handleSaveEdit(): Promise<void> {
    await save({ labelFr, emoji, sortOrder });
    setEditing(false);
  }

  return (
    <li className="py-3 flex items-center gap-3">
      <span className="text-2xl w-8 text-center shrink-0">{category.emoji}</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="grid grid-cols-3 gap-2">
            <input
              value={labelFr}
              onChange={(e) => setLabelFr(e.target.value)}
              className="px-2 py-1.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm"
            />
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="px-2 py-1.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm text-center"
            />
            <input
              type="number"
              value={sortOrder}
              min={0}
              onChange={(e) => setSortOrder(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
              className="px-2 py-1.5 border-2 border-stone-200 rounded-lg outline-none focus:border-mata-700 text-sm tabular-nums"
            />
          </div>
        ) : (
          <>
            <div className="font-semibold text-stone-900 text-sm">{category.labelFr}</div>
            <div className="text-xs text-stone-500">
              <code>{category.slug}</code> · ordre {category.sortOrder}
            </div>
          </>
        )}
      </div>
      <StatusBadge tone={category.isActive ? 'success' : 'neutral'}>
        {category.isActive ? 'Active' : 'Désactivée'}
      </StatusBadge>
      {editing ? (
        <button
          type="button"
          onClick={handleSaveEdit}
          disabled={update.isPending}
          className="px-3 py-1.5 rounded-lg bg-mata-700 hover:bg-mata-800 text-white text-xs font-bold disabled:opacity-50"
        >
          Enregistrer
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-50"
        >
          Modifier
        </button>
      )}
      <button
        type="button"
        onClick={() => save({ isActive: !category.isActive })}
        disabled={update.isPending}
        className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-50 disabled:opacity-50"
      >
        {category.isActive ? 'Désactiver' : 'Activer'}
      </button>
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="block">
      <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider">{label}</span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
