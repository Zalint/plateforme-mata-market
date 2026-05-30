/**
 * Module teleconsult · interface publique.
 *
 * Référence : ARCHITECTURE.md §3 (« Communication entre modules uniquement
 * via leur interface publique »).
 */

export { codeService } from './code-service.js';
export { assertActionAllowedDuringTeleconsult } from './forbid-during-teleconsult.js';
export { sessionService } from './session-service.js';
export { default as teleconsultPlugin } from './teleconsult-plugin.js';
export { teleconsultRoutes } from './teleconsult-routes.js';
