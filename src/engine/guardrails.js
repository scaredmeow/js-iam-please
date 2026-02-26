/**
 * Guardrails — SCP and permission boundary deny logic.
 *
 * Guardrails are deny-override rules that cap maximum permissions regardless
 * of role allowances. If any guardrail matches, the request is denied.
 */

/**
 * Check a single guardrail against a request.
 * @param {object} guardrail - A guardrail config entry
 * @param {object} request - The access request
 * @returns {{ guardrailId: string, description: string } | null} Deny info if matched, null if passes
 */
function checkGuardrail(guardrail, request) {
  const cond = guardrail.denyCondition;
  const requesterRole = request.requester?.role;
  const actions = request.actions || [];

  // Check role exemptions
  if (cond.exemptRoles && cond.exemptRoles.includes(requesterRole)) {
    return null;
  }

  // Check action prefix match (single prefix)
  if (cond.actionPrefix) {
    const hasMatchingAction = actions.some(a => a.startsWith(cond.actionPrefix));
    if (hasMatchingAction) {
      // For region-based SCPs, check region
      if (cond.deniedRegions) {
        if (cond.deniedRegions.includes(request.region)) {
          return { guardrailId: guardrail.id, description: guardrail.description };
        }
        return null;
      }
      return { guardrailId: guardrail.id, description: guardrail.description };
    }
    return null;
  }

  // Check action prefix list match
  if (cond.actionPrefixes) {
    const hasMatchingAction = actions.some(action =>
      cond.actionPrefixes.some(prefix => action.startsWith(prefix))
    );
    if (hasMatchingAction) {
      return { guardrailId: guardrail.id, description: guardrail.description };
    }
    return null;
  }

  // Check exact action list match
  if (cond.actions) {
    const hasMatchingAction = actions.some(a => cond.actions.includes(a));
    if (hasMatchingAction) {
      return { guardrailId: guardrail.id, description: guardrail.description };
    }
    return null;
  }

  return null;
}

/**
 * Evaluate all guardrails against a request.
 * Returns the first deny result, or null if no guardrail triggers.
 *
 * @param {object[]} guardrails - Array of guardrail config entries
 * @param {object} request - The access request
 * @returns {{ guardrailId: string, description: string } | null}
 */
export function evaluateGuardrails(guardrails, request) {
  if (!Array.isArray(guardrails) || guardrails.length === 0) {
    return null;
  }

  for (const guardrail of guardrails) {
    const result = checkGuardrail(guardrail, request);
    if (result) return result;
  }

  return null;
}

/**
 * Parse guardrails config from JSON string.
 * @param {string} jsonString
 * @returns {object[]}
 */
export function parseGuardrailsConfig(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new Error('Guardrails config input must be a JSON string');
  }
  const parsed = JSON.parse(jsonString);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Guardrails config must be a non-null object');
  }
  if (!Array.isArray(parsed.guardrails)) {
    throw new Error('Guardrails config must have a "guardrails" array');
  }
  return parsed.guardrails;
}
