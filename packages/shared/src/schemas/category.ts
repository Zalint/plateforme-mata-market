import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';
import { ProductCategorySchema } from './offer.js';

/**
 * Schémas Catégorie produit (taxonomie data-driven, table `product_categories`).
 *
 * Le `slug` est l'identifiant stable (clé étrangère sur offers/pricing_rules) :
 * non modifiable après création. Le label, l'emoji, l'ordre et le statut actif
 * sont éditables par un admin. On désactive (`isActive=false`) au lieu de
 * supprimer, pour ne jamais casser une offre/commande qui pointe dessus.
 */

const LabelSchema = z.string().min(2).max(40);
const EmojiSchema = z.string().min(1).max(8);

export const CategoryOutputSchema = z.object({
  slug: ProductCategorySchema,
  labelFr: LabelSchema,
  emoji: EmojiSchema,
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CategoryOutput = z.infer<typeof CategoryOutputSchema>;

export const CategoryListResponseSchema = z.object({
  categories: z.array(CategoryOutputSchema),
});
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

/** Création (admin). Le slug est imposé à la création puis figé. */
export const CategoryCreateSchema = z.object({
  slug: ProductCategorySchema,
  labelFr: LabelSchema,
  emoji: EmojiSchema,
  sortOrder: z.number().int().nonnegative().optional(),
});
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;

/** Édition (admin). Slug NON modifiable (c'est la FK). Au moins un champ. */
export const CategoryUpdateSchema = z
  .object({
    labelFr: LabelSchema,
    emoji: EmojiSchema,
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Aucun champ à modifier' });
export type CategoryUpdate = z.infer<typeof CategoryUpdateSchema>;
