/**
 * Module orders · interface publique.
 *
 * Référence : ARCHITECTURE.md §3 (« Communication entre modules uniquement
 * via leur interface publique »).
 */

export { withIdempotency } from './idempotency.js';
export { generateOrderNumber } from './order-numbering.js';
export { orderRoutes } from './order-routes.js';
export { orderService } from './order-service.js';
