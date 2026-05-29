/**
 * Mapping centralisé catégorie produit → emoji.
 *
 * Source unique de vérité. Tout affichage produit doit passer par ici (jamais
 * d'emoji inline dans un composant ou un template).
 *
 * Référence : CLAUDE.md §G1 « Mapping productCategory → emoji centralisé ».
 */
export const CATEGORY_EMOJI = {
  poultry: '🐓',
  eggs: '🥚',
  cattle: '🐄',
  sheep: '🐑',
  vegetables: '🥬',
  fish: '🐟',
} as const;

export type ProductCategory = keyof typeof CATEGORY_EMOJI;

export const CATEGORY_LABEL_FR: Record<ProductCategory, string> = {
  poultry: 'Volaille',
  eggs: 'Œufs',
  cattle: 'Bovin',
  sheep: 'Ovin',
  vegetables: 'Maraîcher',
  fish: 'Poisson',
};
