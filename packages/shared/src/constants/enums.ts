/**
 * Valeurs d'enum métier partagées entre `apps/api`, `apps/web` et `packages/shared`.
 *
 * Source de vérité formelle = `apps/api/prisma/schema.prisma`. Ce fichier réplique
 * les mêmes valeurs en tableau `as const` pour pouvoir construire les schemas Zod
 * et les selects UI sans faire dépendre `@mata/shared` de `@prisma/client` (le
 * client Prisma ne doit pas voyager côté navigateur).
 *
 * Un test côté API (cf. `apps/api/src/modules/__tests__/enum-coherence.test.ts`)
 * vérifie que les deux listes restent alignées : ajouter une valeur Prisma
 * sans la répliquer ici fera échouer le test.
 *
 * Référence : ARCHITECTURE.md §6, CLAUDE.md §G2 « Zod aux frontières ».
 */

// ─────────────────────────────────────────────────────────────────
// Producer

export const PRODUCER_TYPES = [
  'poultry', // aviculteur (poulets et/ou œufs)
  'cattle', // éleveur bovin
  'sheep', // éleveur ovin (mouton)
  'vegetables', // maraîcher
  'fish', // mareyeur / pêche
  'mixed', // multi-élevages / mixte
] as const;
export type ProducerType = (typeof PRODUCER_TYPES)[number];

export const PRODUCER_TYPE_LABEL_FR: Record<ProducerType, string> = {
  poultry: 'Aviculteur',
  cattle: 'Éleveur bovin',
  sheep: 'Éleveur ovin',
  vegetables: 'Maraîcher',
  fish: 'Mareyeur',
  mixed: 'Multi-élevages',
};

export const PRODUCER_STATUSES = ['pending', 'validated', 'suspended', 'blacklisted'] as const;
export type ProducerStatus = (typeof PRODUCER_STATUSES)[number];

export const PRODUCER_STATUS_LABEL_FR: Record<ProducerStatus, string> = {
  pending: 'À valider',
  validated: 'Validé',
  suspended: 'Suspendu',
  blacklisted: 'Blacklisté',
};

// ─────────────────────────────────────────────────────────────────
// Site

export const SITE_TYPES = ['poulailler', 'ferme', 'depot', 'mareyage'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const SITE_TYPE_LABEL_FR: Record<SiteType, string> = {
  poulailler: 'Poulailler',
  ferme: 'Ferme',
  depot: 'Dépôt',
  mareyage: 'Mareyage',
};

export const SITE_STATUSES = ['active', 'archived'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

// Pour les selects du formulaire site (champ libre côté DB, valeurs guidées en UI).
export const SITE_VEHICLE_ACCESS = ['moto', 'tricycle', 'utilitaire', 'camion'] as const;
export type SiteVehicleAccess = (typeof SITE_VEHICLE_ACCESS)[number];

export const SITE_VEHICLE_ACCESS_LABEL_FR: Record<SiteVehicleAccess, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  utilitaire: 'Utilitaire',
  camion: 'Camion',
};

// ─────────────────────────────────────────────────────────────────
// Offer

export const OFFER_STATUSES = [
  'draft', // brouillon producteur, modifiable
  'pending', // soumise à MATA pour validation
  'validated', // visible au catalogue
  'rejected', // refusée par MATA
  'suspended', // masquée par admin ou producteur
  // Lot 2 : `reserved` / `sold` volontairement omis, ajoutés au Lot 4 (orders).
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABEL_FR: Record<OfferStatus, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  validated: 'Validée',
  rejected: 'Refusée',
  suspended: 'Suspendue',
};

export const OFFER_UNITS = ['unit', 'kg', 'tray', 'crate', 'head'] as const;
export type OfferUnit = (typeof OFFER_UNITS)[number];

export const OFFER_UNIT_LABEL_FR: Record<OfferUnit, string> = {
  unit: 'unité',
  kg: 'kg',
  tray: 'plateau',
  crate: 'caisse',
  head: 'tête',
};

// Labels pluriels pour affichage qty > 1 (« 5 unités », « 2 têtes »).
export const OFFER_UNIT_LABEL_FR_PLURAL: Record<OfferUnit, string> = {
  unit: 'unités',
  kg: 'kg',
  tray: 'plateaux',
  crate: 'caisses',
  head: 'têtes',
};

// ─────────────────────────────────────────────────────────────────
// Producer documents (jsonb dans producer_profiles.documents)

export const PRODUCER_DOCUMENT_TYPES = ['cni', 'farm_photo', 'other'] as const;
export type ProducerDocumentType = (typeof PRODUCER_DOCUMENT_TYPES)[number];

export const PRODUCER_DOCUMENT_TYPE_LABEL_FR: Record<ProducerDocumentType, string> = {
  cni: 'CNI',
  farm_photo: 'Photo ferme',
  other: 'Autre',
};

// ─────────────────────────────────────────────────────────────────
// Pricing (Lot 3)

export const PRICING_MODELS = [
  'commission_pct', // commission = base × pct / 100
  'fixed_margin', // commission = montant FCFA fixe par unité
  'mixed', // commission = base × pct / 100 + montant fixe
  'negotiated', // étiquette métier "gros volume négocié", math = fixed_margin
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const PRICING_MODEL_LABEL_FR: Record<PricingModel, string> = {
  commission_pct: 'Commission %',
  fixed_margin: 'Marge fixe',
  mixed: 'Mixte',
  negotiated: 'Négocié gros volume',
};

export const PRICING_MODEL_DESCRIPTION_FR: Record<PricingModel, string> = {
  commission_pct: '% sur la base configurée',
  fixed_margin: 'Montant fixe par unité',
  mixed: 'Commission + marge fixe',
  negotiated: 'Prix client = prix proposé',
};

export const PRICING_SCOPES = ['category', 'offer'] as const;
export type PricingScope = (typeof PRICING_SCOPES)[number];

export const PRICING_SCOPE_LABEL_FR: Record<PricingScope, string> = {
  category: 'Catégorie (défaut)',
  offer: 'Offre (override)',
};

// Base sur laquelle s'applique un pourcentage (commission %, marge sécurité %).
// 9 combinaisons possibles si commission_base et safety_margin_base diffèrent.
export const PRICING_BASES = [
  'producer_price', // base = prix producteur
  'final_price', // base = prix final client (formule circulaire)
  'subtotal_pre_pct', // base = producer + collecte + livraison + storage
] as const;
export type PricingBase = (typeof PRICING_BASES)[number];

export const PRICING_BASE_LABEL_FR: Record<PricingBase, string> = {
  producer_price: 'Sur prix producteur',
  final_price: 'Sur prix final',
  subtotal_pre_pct: 'Sur sous-total (hors %)',
};

// Les 7 composantes du prix (clés stables, utilisées en UI et en stockage).
// L'ordre reflète celui du mockup §2656-2754.
export const PRICING_COMPONENT_KEYS = [
  'producerPrice',
  'commission',
  'collection',
  'delivery',
  'storage',
  'safetyMargin',
  'discount',
] as const;
export type PricingComponentKey = (typeof PRICING_COMPONENT_KEYS)[number];

export const PRICING_COMPONENT_LABEL_FR: Record<PricingComponentKey, string> = {
  producerPrice: 'Prix producteur',
  commission: 'Commission plateforme',
  collection: 'Coût collecte',
  delivery: 'Coût livraison',
  storage: 'Coût stockage',
  safetyMargin: 'Marge sécurité',
  discount: 'Remise',
};
