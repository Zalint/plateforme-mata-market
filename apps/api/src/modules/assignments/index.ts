/**
 * Module assignments · interface publique (affectations producteur ↔
 * téléconseiller, portée de modération).
 *
 * Référence : ARCHITECTURE.md §3 (« Communication entre modules uniquement
 * via leur interface publique »).
 */

export { assignmentRoutes } from './assignment-routes.js';
export { assertModeratorForProducer, scopeOfferWhereForModerator } from './assignment-scope.js';
export { assignmentService, type TeleconsultantScopeView } from './assignment-service.js';
