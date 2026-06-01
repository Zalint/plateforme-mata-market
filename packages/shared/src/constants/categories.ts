/**
 * Mapping centralisé catégorie produit → emoji.
 *
 * Source unique de vérité. Tout affichage produit doit passer par ici (jamais
 * d'emoji inline dans un composant ou un template).
 *
 * Référence : CLAUDE.md §G1 « Mapping productCategory → emoji centralisé ».
 */
/**
 * Catégorie produit = SLUG dynamique (table `product_categories`, gérée par
 * l'admin). La source de vérité du label + de l'emoji est l'API `/v1/categories`.
 *
 * Les maps ci-dessous ne sont qu'un FALLBACK pour les 6 catégories historiques
 * (affichage avant chargement de l'API, ou hors contexte React). Indexées par
 * slug → `string | undefined` ; toujours prévoir un repli côté appelant.
 */
export const CATEGORY_EMOJI: Record<string, string> = {
  poultry: '🐓',
  eggs: '🥚',
  cattle: '🐄',
  sheep: '🐑',
  vegetables: '🥬',
  fish: '🐟',
};

export type ProductCategory = string;

export const CATEGORY_LABEL_FR: Record<string, string> = {
  poultry: 'Volaille',
  eggs: 'Œufs',
  cattle: 'Bovin',
  sheep: 'Ovin',
  vegetables: 'Maraîcher',
  fish: 'Poisson',
};
