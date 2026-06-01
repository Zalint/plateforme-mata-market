import { DomainError } from '@mata/shared/errors';
import type {
  CatalogOfferDetail,
  CatalogOfferItem,
  CatalogOfferListQuery,
  CreateGuestOrder,
  GuestCatalogOfferDetail,
  GuestCatalogOfferItem,
  GuestCatalogOfferListQuery,
  GuestCatalogOfferListResponse,
  OrderOutput,
  PaymentIntentResponse,
} from '@mata/shared/schemas';
import type { FastifyRequest } from 'fastify';
import { catalogService } from '../catalog/index.js';
import { categoryService } from '../categories/index.js';
import { orderService, withIdempotency } from '../orders/index.js';
import { paymentService } from '../payments/index.js';
import { zoneService } from '../zones/index.js';

/**
 * Service guest · orchestration du mode invité (Lot 8).
 *
 * Référence : CLAUDE.md §G3 (« Mode invité SÉPARÉ : routes /v1/guest/*, plugin
 * Fastify dédié, rate-limit strict »), §G2 (communication inter-modules via
 * interface publique uniquement).
 *
 * Ce service ne touche PAS directement aux repos des autres modules : il
 * délègue à `zoneService`, `catalogService`, `orderService`, `paymentService`
 * (leurs interfaces publiques). Sa valeur ajoutée :
 *  1. Masquer l'identité producteur dans le catalogue invité.
 *  2. Créer une commande invité (clientUserId null + identité de contact).
 *  3. Vérifier l'« ownership » invité (orderId + guestPhoneNumber) avant de
 *     créer un payment intent — un invité n'a pas de JWT.
 */

// ─────────────────────────────────────────────────────────────────
// Catalogue masqué

/** Retire toute information identifiant le producteur (nom, site). */
function maskCatalogItem(o: CatalogOfferItem): GuestCatalogOfferItem {
  return {
    id: o.id,
    category: o.category,
    title: o.title,
    unit: o.unit,
    quantity: o.quantity,
    priceFcfa: o.priceFcfa,
    availableFrom: o.availableFrom,
    qualityNote: o.qualityNote,
    photoPublicIds: o.photoPublicIds,
    zoneId: o.site.zoneId,
  };
}

async function listCatalogInternal(
  query: GuestCatalogOfferListQuery,
): Promise<GuestCatalogOfferListResponse> {
  // GuestCatalogOfferListQuery a la même forme que CatalogOfferListQuery.
  const res = await catalogService.listValidated(query as CatalogOfferListQuery);
  return {
    offers: res.offers.map(maskCatalogItem),
    meta: res.meta,
  };
}

async function getCatalogOfferInternal(id: string): Promise<GuestCatalogOfferDetail> {
  const detail: CatalogOfferDetail = await catalogService.getValidatedById(id);
  return {
    ...maskCatalogItem(detail),
    availableUntil: detail.availableUntil,
  };
}

// ─────────────────────────────────────────────────────────────────
// Zones (lecture publique invité)

async function listZonesInternal() {
  return zoneService.listActive();
}

async function listCategoriesInternal() {
  return categoryService.listActive();
}

// ─────────────────────────────────────────────────────────────────
// Création de commande invité

interface CreateGuestOrderArgs {
  input: CreateGuestOrder;
  request: FastifyRequest;
}

interface GuestOrderOutcome {
  order: OrderOutput;
  replay: boolean;
}

async function createOrderInternal(args: CreateGuestOrderArgs): Promise<GuestOrderOutcome> {
  const { input, request } = args;

  // Idempotence scopée par téléphone invité (pas de userId). Un invité retentant
  // le POST avec la même X-Idempotency-Key récupère la même commande.
  const outcome = await withIdempotency({
    request,
    scopeOwner: `guest:${input.guestPhoneNumber}`,
    actorUserId: null, // invité → pas d'audit replay
    handler: () =>
      orderService.create({
        clientUserId: null,
        input: { items: input.items, delivery: input.delivery },
        guest: { fullName: input.guestFullName, phoneNumber: input.guestPhoneNumber },
        paymentMethod: input.paymentMethod,
        request,
      }),
  });

  return { order: outcome.body, replay: outcome.replay };
}

// ─────────────────────────────────────────────────────────────────
// Payment intent invité (online uniquement)

interface CreateGuestPaymentIntentArgs {
  orderId: string;
  guestPhoneNumber: string;
  request: FastifyRequest;
}

async function createPaymentIntentInternal(
  args: CreateGuestPaymentIntentArgs,
): Promise<PaymentIntentResponse> {
  const { orderId, guestPhoneNumber, request } = args;

  // « Ownership » invité : la commande doit être une commande invité dont le
  // téléphone correspond exactement à celui fourni. Pas de JWT → c'est ce
  // couple (orderId + phone) qui autorise la création d'intent.
  const order = await orderService.getById(orderId);
  if (order.clientUserId !== null || order.guestPhoneNumber !== guestPhoneNumber) {
    // Message volontairement vague (ne révèle pas l'existence de la commande).
    throw new DomainError('FORBIDDEN', 'Commande invité introuvable pour ce numéro');
  }
  if (order.paymentMethod !== 'online') {
    throw new DomainError(
      'CONFLICT',
      'Cette commande est réglée à la livraison — aucun paiement en ligne requis',
    );
  }

  return paymentService.createCheckoutSession({ actorUserId: null, orderId, request });
}

// ─────────────────────────────────────────────────────────────────
// Export

export const guestService = {
  listZones: listZonesInternal,
  listCategories: listCategoriesInternal,
  listCatalog: listCatalogInternal,
  getCatalogOffer: getCatalogOfferInternal,
  createOrder: createOrderInternal,
  createPaymentIntent: createPaymentIntentInternal,
};
