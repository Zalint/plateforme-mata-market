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
  'validated', // visible au catalogue, stock dispo
  'rejected', // refusée par MATA
  'suspended', // masquée par admin ou producteur
  'reserved', // Lot 4 : stock épuisé temporairement (un cancel peut revenir validated)
  'sold', // Lot 4 : épuisé définitivement (tout livré, retiré catalogue)
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABEL_FR: Record<OfferStatus, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  validated: 'Validée',
  rejected: 'Refusée',
  suspended: 'Suspendue',
  reserved: 'Réservée',
  sold: 'Vendue',
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

// ─────────────────────────────────────────────────────────────────
// Orders (Lot 4)

// Cycle nominal 7 étapes + cancelled. Statuts "lateral" payment_pending
// et disputed réservés Lot 5 (paiements Bictorys).
export const ORDER_STATUSES = [
  'created', // panier validé, en attente confirmation MATA
  'confirmed', // MATA accepte, producteurs notifiés, stock réservé
  'collecting', // MLC en tournée chez les producteurs
  'collected', // tous les items récupérés, en route vers dépôt
  'stored', // entrée chambre froide, en attente tournée livraison
  'delivering', // livreur en route vers client
  'delivered', // client a confirmé la réception, déclenche reversement
  'cancelled', // annulée client (avant collecte) OU MATA (rupture, problème)
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL_FR: Record<OrderStatus, string> = {
  created: 'Créée',
  confirmed: 'Confirmée',
  collecting: 'En collecte',
  collected: 'Collectée',
  stored: 'Stockée',
  delivering: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

// Matrice des transitions valides. Source de vérité du state-machine guard
// côté service (order-service.ts) et de l'UI (boutons disabled selon status).
//
//   created    → confirmed | cancelled
//   confirmed  → collecting | cancelled
//   collecting → collected
//   collected  → stored
//   stored     → delivering
//   delivering → delivered
//   delivered  → (terminal)
//   cancelled  → (terminal)
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['confirmed', 'cancelled'],
  confirmed: ['collecting', 'cancelled'],
  collecting: ['collected'],
  collected: ['stored'],
  stored: ['delivering'],
  delivering: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

// Créneau livraison (cf. §I glossaire).
export const DELIVERY_PERIODS = ['morning', 'afternoon'] as const;
export type DeliveryPeriod = (typeof DELIVERY_PERIODS)[number];

export const DELIVERY_PERIOD_LABEL_FR: Record<DeliveryPeriod, string> = {
  morning: 'Matin (6h–12h)',
  afternoon: 'Après-midi (14h–18h)',
};

// ─────────────────────────────────────────────────────────────────
// Payments (Lot 5)
//
// PaymentStatus traduit l'état d'un payment intent Bictorys côté MATA.
// Mapping provider :
//  - Bictorys `opened` / `pending`  → MATA `pending`
//  - Bictorys `paid` / `succeeded`  → MATA `paid`
//  - Bictorys `refunded`            → MATA `refunded`
//  - Bictorys `disputed` / `chargeback` → MATA `disputed`
// `expired` côté Bictorys reste `pending` côté MATA jusqu'au cancel order
// (puis bascule `refunded` si webhook 'paid' arrive après cancel, sinon reste pending).

export const PAYMENT_STATUSES = ['pending', 'paid', 'refunded', 'disputed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL_FR: Record<PaymentStatus, string> = {
  pending: 'En attente',
  paid: 'Payé',
  refunded: 'Remboursé',
  disputed: 'Contesté',
};

// PayoutStatus traduit l'état d'un disbursement Bictorys côté MATA.
//  - pending  : créé côté MATA, en attente d'envoi Bictorys (court terme)
//  - sent     : Bictorys a confirmé le virement vers le producteur
//  - failed   : Bictorys a refusé / erreur réseau / coordonnées invalides
//  - blocked  : bloqué manuellement (dispute, fraude, KYC)

export const PAYOUT_STATUSES = ['pending', 'sent', 'failed', 'blocked'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_STATUS_LABEL_FR: Record<PayoutStatus, string> = {
  pending: 'À envoyer',
  sent: 'Envoyé',
  failed: 'Échec',
  blocked: 'Bloqué',
};

// ─────────────────────────────────────────────────────────────────
// Téléconseil (Lot 6)

// Raisons de fermeture d'une session déléguée (cf. ARCHITECTURE.md §9).
//   expired                  → cron a fermé après expires_at < now
//   closed_by_teleconsultant → le téléconseiller a cliqué "Fermer"
//   revoked_by_producer      → le producteur a interrompu via son téléphone
//   revoked_by_admin         → un super_admin a forcé la fin (fraude, dispute)
export const TELECONSULT_CLOSE_REASONS = [
  'expired',
  'closed_by_teleconsultant',
  'revoked_by_producer',
  'revoked_by_admin',
] as const;
export type TeleconsultCloseReason = (typeof TELECONSULT_CLOSE_REASONS)[number];

export const TELECONSULT_CLOSE_REASON_LABEL_FR: Record<TeleconsultCloseReason, string> = {
  expired: 'Expirée (15 min)',
  closed_by_teleconsultant: 'Fermée par téléconseiller',
  revoked_by_producer: 'Interrompue par producteur',
  revoked_by_admin: 'Bloquée par admin',
};

/**
 * Whitelist d'actions INTERDITES en session déléguée téléconseil.
 *
 * Source : ARCHITECTURE.md §9 « Whitelist d'actions interdites en session
 * déléguée » + CLAUDE.md §G8.
 *
 * Toute route qui exécute une de ces actions DOIT appeler
 * `assertActionAllowedDuringTeleconsult(req, action)` AVANT d'agir. Si
 * `req.actingOnBehalfOf` est défini (session active), l'action est refusée
 * avec 403 + audit `teleconsult.session.action_forbidden`.
 *
 * Ne JAMAIS retirer une entrée sans validation explicite. Pour en ajouter :
 * éditer ici + ajouter le câblage dans la route correspondante.
 */
export const TELECONSULT_FORBIDDEN_ACTIONS = [
  'producer.bank_details.update',
  'producer.phone.update',
  'producer.delete',
  'user.password.reset',
  'teleconsult.session.start', // pas de session-dans-session
] as const;
export type TeleconsultForbiddenAction = (typeof TELECONSULT_FORBIDDEN_ACTIONS)[number];

// Durée maximale d'une session (cf. ARCHITECTURE.md §9 + mockup §2898).
export const TELECONSULT_SESSION_DURATION_MS = 15 * 60 * 1000;

// Durée de vie d'un code 6 chiffres (cf. ARCHITECTURE.md §9).
export const TELECONSULT_CODE_TTL_MS = 15 * 60 * 1000;

// Lockout anti-bruteforce : 5 échecs en 1h → blocage 30 min.
export const TELECONSULT_LOCKOUT_MAX_ATTEMPTS = 5;
export const TELECONSULT_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;
export const TELECONSULT_LOCKOUT_DURATION_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────
// Tournées de collecte (Lot 7)

// Cycle d'une tournée, aligné sur la légende mockup §admin/pickup
// (l.2575-2579) + `cancelled` :
//   scheduled  (Planifiée)  → to_confirm | cancelled
//   to_confirm (À confirmer)→ confirmed | cancelled
//   confirmed  (Confirmée)  → collecting | cancelled
//   collecting (En cours)   → collected | cancelled
//   collected  (Effectuée)  → (terminal)
//   cancelled               → (terminal)
export const PICKUP_STATUSES = [
  'scheduled', // planifiée, créée par l'admin
  'to_confirm', // en attente de confirmation des producteurs
  'confirmed', // confirmée, prête à démarrer
  'collecting', // en cours (chauffeur en tournée)
  'collected', // effectuée (tous items traités)
  'cancelled', // annulée (libère les order_items)
] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

export const PICKUP_STATUS_LABEL_FR: Record<PickupStatus, string> = {
  scheduled: 'Planifiée',
  to_confirm: 'À confirmer',
  confirmed: 'Confirmée',
  collecting: 'En cours',
  collected: 'Effectuée',
  cancelled: 'Annulée',
};

// Matrice des transitions valides. Source de vérité du guard côté service
// (pickup-service.ts) et de l'UI (boutons disabled selon status).
export const PICKUP_TRANSITIONS: Record<PickupStatus, readonly PickupStatus[]> = {
  scheduled: ['to_confirm', 'cancelled'],
  to_confirm: ['confirmed', 'cancelled'],
  confirmed: ['collecting', 'cancelled'],
  collecting: ['collected', 'cancelled'],
  collected: [],
  cancelled: [],
};

export function isValidPickupTransition(from: PickupStatus, to: PickupStatus): boolean {
  return PICKUP_TRANSITIONS[from].includes(to);
}

// ─────────────────────────────────────────────────────────────────
// Notifications push (Lot 7)

// Catégories d'événements notifiables. Stockées dans
// notification_preferences.categories (JSON { [cat]: boolean }). Une catégorie
// absente = activée par défaut (opt-out par catégorie).
export const NOTIFICATION_CATEGORIES = [
  'order', // transitions de commande (confirmée, livrée…)
  'pickup', // tournées de collecte (planifiée, en cours)
  'payout', // reversements producteur
  'offer', // validation/refus d'offre
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABEL_FR: Record<NotificationCategory, string> = {
  order: 'Commandes',
  pickup: 'Collectes',
  payout: 'Reversements',
  offer: 'Offres',
};

// ─────────────────────────────────────────────────────────────────
// Paiement · moyen choisi à la commande (Lot 8 — guest checkout)

// `online` (défaut) = flux Bictorys existant (payment intent + webhook).
// `cash_on_delivery` = paiement cash à la livraison : la commande invité est
// confirmable sans payment intent (cf. order-service transition guard).
export const PAYMENT_METHODS = ['online', 'cash_on_delivery'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL_FR: Record<PaymentMethod, string> = {
  online: 'Paiement en ligne',
  cash_on_delivery: 'Paiement à la livraison',
};
