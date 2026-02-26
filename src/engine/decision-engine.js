/**
 * Decision Engine — evaluates access requests against roles, ABAC tags, and guardrails.
 *
 * Evaluation order (mirrors simplified IAM logic):
 * 1. Guardrails — if any explicit deny matches, DENY immediately
 * 2. ABAC overlay — if any tag constraint fails, DENY
 * 3. Role matrix — if no explicit allow exists, DENY (implicit deny)
 * 4. Wildcard/break-glass — wildcards require ticket ID + time window
 * 5. If all checks pass, APPROVE
 */

import { evaluateGuardrails } from './guardrails.js';
import { evaluateABAC } from './abac-overlay.js';
import { lookupPermission } from './role-matrix.js';

/**
 * Evaluate an access request against the full policy stack.
 *
 * @param {object} request - The access request to evaluate
 * @param {object} roleMatrix - Current role permissions config
 * @param {object|null} abacOverlay - Active ABAC rules (null if not yet unlocked)
 * @param {object[]} guardrails - Active guardrails (empty array if not yet unlocked)
 * @returns {{ decision: string, reasonCode: string, explanation: string }}
 */
export function evaluate(request, roleMatrix, abacOverlay, guardrails) {
  // Validate request has minimum required fields
  if (!request || typeof request !== 'object') {
    return deny('invalid-request', 'Request is missing or not an object');
  }
  if (!request.requester || !request.requester.role) {
    return deny('invalid-request', 'Request is missing requester role');
  }
  if (!Array.isArray(request.actions) || request.actions.length === 0) {
    return deny('empty-request', 'Request has no actions specified');
  }
  if (!Array.isArray(request.resources) || request.resources.length === 0) {
    return deny('empty-request', 'Request has no resources specified');
  }

  // Step 1: Check guardrails (explicit deny overrides everything)
  const guardrailDeny = evaluateGuardrails(guardrails || [], request);
  if (guardrailDeny) {
    return deny(
      `guardrail-${guardrailDeny.guardrailId}`,
      `Denied by guardrail: ${guardrailDeny.description}`
    );
  }

  // Step 2: Check ABAC overlay (if active)
  const abacDeny = evaluateABAC(abacOverlay, request);
  if (abacDeny) {
    return deny(
      `abac-${abacDeny.ruleId}`,
      `Denied by ABAC rule: ${abacDeny.description}`
    );
  }

  // Step 3: Check role matrix for each action/resource combination
  const role = request.requester.role;
  const environment = request.environment || 'dev';
  const resourceType = request.resourceType || deriveResourceType(request.actions[0]);

  for (const action of request.actions) {
    const actionResourceType = deriveResourceType(action) || resourceType;
    const perm = lookupPermission(roleMatrix, role, action, actionResourceType, environment);
    if (!perm) {
      return deny(
        'implicit-deny',
        `No matching allow in Role Matrix for role "${role}", action "${action}", resource type "${actionResourceType}", environment "${environment}"`
      );
    }

    // Step 4: Check wildcard/break-glass constraints
    if (hasWildcard(action, request.resources)) {
      if (!request.ticketId || !request.timeWindow) {
        return deny(
          'wildcard-no-breakglass',
          `Wildcard action or resource requires break-glass conditions (ticket ID and time window)`
        );
      }
    }

    // Check if the permission requires break-glass
    if (perm.requiresBreakGlass) {
      if (!request.ticketId || !request.timeWindow) {
        return deny(
          'breakglass-required',
          `Role "${role}" requires break-glass access (ticket ID and time window)`
        );
      }
    }
  }

  // All checks passed
  return approve(
    `role-allows-${role.toLowerCase().replace(/\s+/g, '-')}`,
    `Role "${role}" has explicit allow for the requested actions in "${environment}" environment`
  );
}

/**
 * Derive the resource type from an action string (e.g., "s3:GetObject" → "s3").
 */
function deriveResourceType(action) {
  if (!action || typeof action !== 'string') return '';
  if (action === '*') return '*';
  const colonIndex = action.indexOf(':');
  return colonIndex > 0 ? action.substring(0, colonIndex) : '';
}

/**
 * Check if any action or resource contains a wildcard.
 */
function hasWildcard(action, resources) {
  if (action === '*') return true;
  if (Array.isArray(resources) && resources.some(r => r === '*')) return true;
  return false;
}

function deny(reasonCode, explanation) {
  return { decision: 'DENY', reasonCode, explanation };
}

function approve(reasonCode, explanation) {
  return { decision: 'APPROVE', reasonCode, explanation };
}
