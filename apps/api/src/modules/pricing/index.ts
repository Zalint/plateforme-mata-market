/**
 * Module pricing · interface publique.
 *
 * Référence : ARCHITECTURE.md §3 (« Communication entre modules uniquement
 * via leur interface publique »).
 */

export {
  computePricing,
  type PricingEngineInput,
  type PricingEngineOutput,
} from './pricing-engine.js';
export { pricingRoutes } from './pricing-routes.js';
export { pricingService } from './pricing-service.js';
export { type CreateSnapshotArgs, pricingSnapshotService } from './pricing-snapshot-service.js';
