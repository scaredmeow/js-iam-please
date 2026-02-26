/**
 * ABAC Overlay — attribute-based access control constraint checking.
 *
 * Evaluates tag-based constraints (environment, team, data classification)
 * against access request attributes. Returns a deny result if any constraint
 * is violated, or null if all constraints pass.
 */

/**
 * Check a single ABAC rule against a request.
 * @param {object} rule - An ABAC rule from the config
 * @param {object} request - The access request
 * @returns {{ ruleId: string, description: string } | null} Deny info if violated, null if passes
 */
function checkRule(rule, request) {
  const cond = rule.condition;
  const requesterRole = request.requester?.role;
  const environment = request.environment;
  const requesterTeam = request.requester?.team;
  const resourceTeam = request.resourceTeam;
  const dataClassification = request.constraints?.dataClassification;

  switch (rule.dimension) {
    case 'environment': {
      if (cond.requesterRole && requesterRole !== cond.requesterRole) return null;
      if (cond.deniedEnvironments && cond.deniedEnvironments.includes(environment)) {
        return { ruleId: rule.id, description: rule.description };
      }
      return null;
    }

    case 'team': {
      if (cond.requesterRole && requesterRole !== cond.requesterRole) return null;
      if (cond.requireTeamMatch && requesterTeam && resourceTeam && requesterTeam !== resourceTeam) {
        return { ruleId: rule.id, description: rule.description };
      }
      return null;
    }

    case 'dataClassification': {
      if (cond.requesterRole && requesterRole !== cond.requesterRole) return null;
      if (cond.deniedClassifications && cond.deniedClassifications.includes(dataClassification)) {
        return { ruleId: rule.id, description: rule.description };
      }
      if (cond.dataClassification && dataClassification === cond.dataClassification) {
        if (cond.requiresTicketId && !request.ticketId) {
          return { ruleId: rule.id, description: rule.description };
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Evaluate all ABAC rules against a request.
 * Returns the first deny result, or null if all rules pass.
 *
 * @param {object} abacConfig - The ABAC overlay config (with .active and .rules)
 * @param {object} request - The access request
 * @returns {{ ruleId: string, description: string } | null}
 */
export function evaluateABAC(abacConfig, request) {
  if (!abacConfig || !abacConfig.active || !Array.isArray(abacConfig.rules)) {
    return null;
  }

  for (const rule of abacConfig.rules) {
    const result = checkRule(rule, request);
    if (result) return result;
  }

  return null;
}

/**
 * Parse ABAC config from JSON string.
 * @param {string} jsonString
 * @returns {object}
 */
export function parseABACConfig(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new Error('ABAC config input must be a JSON string');
  }
  const parsed = JSON.parse(jsonString);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('ABAC config must be a non-null object');
  }
  if (typeof parsed.active !== 'boolean') {
    throw new Error('ABAC config must have a boolean "active" field');
  }
  if (!Array.isArray(parsed.rules)) {
    throw new Error('ABAC config must have a "rules" array');
  }
  return parsed;
}
