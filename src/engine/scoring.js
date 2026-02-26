/**
 * Scoring System — computes score deltas from player decisions vs expected outcomes.
 *
 * Scoring rules:
 *   Correct decision:            +10
 *   Correct rationale code bonus: +3
 *   Dangerous false approval:    −15  (approving prod restricted/confidential or wildcard)
 *   False denial:                −5
 */

/**
 * Determine whether a false approval is "dangerous".
 * A false approval is dangerous when the player approved a request that should
 * have been denied AND the scenario involves production restricted/confidential
 * data or wildcard permissions.
 *
 * @param {object} scenario - The scenario object with request details
 * @returns {boolean}
 */
function isDangerousFalseApproval(scenario) {
  const request = scenario.request || {};
  const env = request.environment;
  const classification = request.constraints?.dataClassification;
  const actions = request.actions || [];
  const resources = request.resources || [];

  // Wildcard actions or resources are always dangerous
  if (actions.includes('*') || resources.includes('*')) {
    return true;
  }

  // Production + restricted or confidential data is dangerous
  if (env === 'prod' && (classification === 'restricted' || classification === 'confidential')) {
    return true;
  }

  return false;
}

/**
 * Compute the score delta for a single ticket decision.
 *
 * @param {{ decision: string, reasonCode: string }} playerDecision
 * @param {{ decision: string, reasonCode: string, explanation: string }} expected
 * @param {object} scenario - The full scenario object (for context)
 * @returns {{ scenarioId: string, decision: string, isCorrect: boolean, rationaleCorrect: boolean, scoreDelta: number, isDangerous: boolean }}
 */
export function computeScore(playerDecision, expected, scenario) {
  const isCorrect = playerDecision.decision === expected.decision;
  const rationaleCorrect = isCorrect && playerDecision.reasonCode === expected.reasonCode;

  if (isCorrect) {
    const base = 10;
    const bonus = rationaleCorrect ? 3 : 0;
    return {
      scenarioId: scenario.id,
      decision: playerDecision.decision,
      isCorrect: true,
      rationaleCorrect,
      scoreDelta: base + bonus,
      isDangerous: false,
    };
  }

  // Incorrect decision
  const falseApproval = playerDecision.decision === 'APPROVE' && expected.decision === 'DENY';
  const dangerous = falseApproval && isDangerousFalseApproval(scenario);

  if (dangerous) {
    return {
      scenarioId: scenario.id,
      decision: playerDecision.decision,
      isCorrect: false,
      rationaleCorrect: false,
      scoreDelta: -15,
      isDangerous: true,
    };
  }

  // False denial OR non-dangerous false approval
  return {
    scenarioId: scenario.id,
    decision: playerDecision.decision,
    isCorrect: false,
    rationaleCorrect: false,
    scoreDelta: -5,
    isDangerous: false,
  };
}
