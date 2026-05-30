import {
  TELECONSULT_FORBIDDEN_ACTIONS,
  type TeleconsultForbiddenAction,
} from '@mata/shared/constants';
import { DomainError } from '@mata/shared/errors';
import type { FastifyRequest } from 'fastify';
import { auditService } from '../audit/index.js';

/**
 * Helper · refuse une action si elle est dans la whitelist d'actions
 * INTERDITES en session déléguée téléconseil.
 *
 * À appeler AVANT toute action sensible dans une route métier :
 *   - producer-routes PUT /v1/producers/me/bank-details
 *   - producer-routes PATCH (futur) /v1/producers/me/phone
 *   - producer-routes DELETE (futur) /v1/producers/me
 *   - auth-routes (futur) reset password
 *   - teleconsult-routes POST /v1/teleconsult/sessions (pas de session-dans-session)
 *
 * Si `req.actingOnBehalfOf` est défini (session active) ET l'action est
 * dans la whitelist → throw 403 + audit `teleconsult.session.action_forbidden`.
 *
 * Si pas de session active → no-op.
 *
 * Référence : CLAUDE.md §G8 « Whitelist TELECONSULT_FORBIDDEN_ACTIONS
 * respectée rigoureusement », ARCHITECTURE.md §9.
 */
export async function assertActionAllowedDuringTeleconsult(
  req: FastifyRequest,
  action: TeleconsultForbiddenAction,
): Promise<void> {
  if (!req.actingOnBehalfOf) return; // pas de session déléguée → action OK

  // Garde-fou : si on a `actingOnBehalfOf` mais que l'action n'est PAS dans
  // la whitelist, c'est OK aussi (le helper n'est pas appelé pour tout).
  if (!TELECONSULT_FORBIDDEN_ACTIONS.includes(action)) return;

  // Audit obligatoire AVANT throw (CLAUDE.md §G8).
  if (req.user) {
    await auditService.log({
      actorUserId: req.user.id,
      onBehalfOfUserId: req.actingOnBehalfOf.id,
      action: 'teleconsult.session.action_forbidden',
      targetType: 'teleconsult_action',
      newValue: { forbiddenAction: action },
      request: req,
    });
  }

  throw new DomainError(
    'FORBIDDEN',
    "Cette action n'est pas autorisée pendant une session téléconseil",
    { details: { forbiddenAction: action } },
  );
}
