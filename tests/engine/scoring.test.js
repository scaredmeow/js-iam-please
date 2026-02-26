import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeScore } from '../../src/engine/scoring.js';

// --- Generators ---

const DECISIONS = ['APPROVE', 'DENY'];
const ENVIRONMENTS = ['dev', 'staging', 'prod'];
const CLASSIFICATIONS = ['internal', 'confidential', 'restricted'];

const arbReasonCode = fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/);

const arbPlayerDecision = fc.record({
  decision: fc.constantFrom(...DECISIONS),
  reasonCode: arbReasonCode,
});

const arbExpected = fc.record({
  decision: fc.constantFrom(...DECISIONS),
  reasonCode: arbReasonCode,
  explanation: fc.string({ minLength: 1 }),
});

/**
 * Generate a scenario with controllable danger signals.
 */
const arbScenario = fc.record({
  id: fc.string({ minLength: 1 }),
  day: fc.integer({ min: 1, max: 30 }),
  title: fc.string({ minLength: 1 }),
  request: fc.record({
    requester: fc.record({
      name: fc.string({ minLength: 1 }),
      role: fc.string({ minLength: 1 }),
    }),
    actions: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
    resources: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
    justification: fc.string({ minLength: 1 }),
    environment: fc.constantFrom(...ENVIRONMENTS),
    constraints: fc.record({
      dataClassification: fc.constantFrom(...CLASSIFICATIONS),
    }),
  }),
  expected: arbExpected,
  teachingPoint: fc.string({ minLength: 1 }),
});

/**
 * Generate a scenario that is "dangerous" — prod + restricted/confidential or wildcard.
 */
const arbDangerousScenario = fc.oneof(
  // Prod + restricted/confidential
  fc.record({
    id: fc.string({ minLength: 1 }),
    day: fc.integer({ min: 1, max: 30 }),
    title: fc.string({ minLength: 1 }),
    request: fc.record({
      requester: fc.record({
        name: fc.string({ minLength: 1 }),
        role: fc.string({ minLength: 1 }),
      }),
      actions: fc.array(fc.stringMatching(/^[a-z]{2,6}:[A-Za-z]+$/), { minLength: 1, maxLength: 3 }),
      resources: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/), { minLength: 1, maxLength: 2 }),
      justification: fc.string({ minLength: 1 }),
      environment: fc.constant('prod'),
      constraints: fc.record({
        dataClassification: fc.constantFrom('restricted', 'confidential'),
      }),
    }),
    expected: fc.record({
      decision: fc.constant('DENY'),
      reasonCode: arbReasonCode,
      explanation: fc.string({ minLength: 1 }),
    }),
    teachingPoint: fc.string({ minLength: 1 }),
  }),
  // Wildcard actions
  fc.record({
    id: fc.string({ minLength: 1 }),
    day: fc.integer({ min: 1, max: 30 }),
    title: fc.string({ minLength: 1 }),
    request: fc.record({
      requester: fc.record({
        name: fc.string({ minLength: 1 }),
        role: fc.string({ minLength: 1 }),
      }),
      actions: fc.constant(['*']),
      resources: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
      justification: fc.string({ minLength: 1 }),
      environment: fc.constantFrom(...ENVIRONMENTS),
      constraints: fc.record({
        dataClassification: fc.constantFrom(...CLASSIFICATIONS),
      }),
    }),
    expected: fc.record({
      decision: fc.constant('DENY'),
      reasonCode: arbReasonCode,
      explanation: fc.string({ minLength: 1 }),
    }),
    teachingPoint: fc.string({ minLength: 1 }),
  })
);

/**
 * Generate a "safe" scenario — no wildcards, not prod+restricted/confidential.
 */
const arbSafeScenario = fc.record({
  id: fc.string({ minLength: 1 }),
  day: fc.integer({ min: 1, max: 30 }),
  title: fc.string({ minLength: 1 }),
  request: fc.record({
    requester: fc.record({
      name: fc.string({ minLength: 1 }),
      role: fc.string({ minLength: 1 }),
    }),
    actions: fc.array(fc.stringMatching(/^[a-z]{2,6}:[A-Za-z]+$/), { minLength: 1, maxLength: 3 }),
    resources: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/), { minLength: 1, maxLength: 2 }),
    justification: fc.string({ minLength: 1 }),
    environment: fc.constantFrom('dev', 'staging'),
    constraints: fc.record({
      dataClassification: fc.constant('internal'),
    }),
  }),
  expected: fc.record({
    decision: fc.constant('DENY'),
    reasonCode: arbReasonCode,
    explanation: fc.string({ minLength: 1 }),
  }),
  teachingPoint: fc.string({ minLength: 1 }),
});

describe('Scoring System', () => {
  /**
   * Feature: iam-please, Property 9: Scoring correctness
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4
   *
   * For any player decision and expected outcome pair, the Scoring_System should
   * compute the correct score delta: +10 for correct decisions (with +3 bonus if
   * rationale code matches), −15 for dangerous false approvals (prod
   * restricted/confidential data or wildcard permissions), and −5 for false denials.
   */
  it('Property 9: correct decisions score +10, with +3 bonus for matching rationale', () => {
    fc.assert(
      fc.property(arbScenario, arbReasonCode, (scenario, sharedCode) => {
        // Player matches expected decision
        const expected = scenario.expected;
        const playerDecision = { decision: expected.decision, reasonCode: sharedCode };
        const expectedObj = { ...expected, reasonCode: sharedCode };

        const result = computeScore(playerDecision, expectedObj, scenario);
        expect(result.isCorrect).toBe(true);
        expect(result.scoreDelta).toBe(13); // 10 + 3 bonus

        // Now with a different rationale code
        const differentCode = sharedCode + '-different';
        const playerWrongRationale = { decision: expected.decision, reasonCode: differentCode };
        const result2 = computeScore(playerWrongRationale, expectedObj, scenario);
        expect(result2.isCorrect).toBe(true);
        expect(result2.scoreDelta).toBe(10); // no bonus
      }),
      { numRuns: 100 }
    );
  });

  it('Property 9: dangerous false approvals score −15', () => {
    fc.assert(
      fc.property(arbDangerousScenario, arbReasonCode, (scenario, code) => {
        // Player approves what should be denied, in a dangerous context
        const playerDecision = { decision: 'APPROVE', reasonCode: code };
        const result = computeScore(playerDecision, scenario.expected, scenario);

        expect(result.isCorrect).toBe(false);
        expect(result.scoreDelta).toBe(-15);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 9: false denials score −5', () => {
    fc.assert(
      fc.property(arbScenario, arbReasonCode, (scenario, code) => {
        // Force expected to APPROVE so player denying is a false denial
        const expected = { ...scenario.expected, decision: 'APPROVE' };
        const playerDecision = { decision: 'DENY', reasonCode: code };

        const result = computeScore(playerDecision, expected, scenario);
        expect(result.isCorrect).toBe(false);
        expect(result.scoreDelta).toBe(-5);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 9: non-dangerous false approvals score −5', () => {
    fc.assert(
      fc.property(arbSafeScenario, arbReasonCode, (scenario, code) => {
        // Player approves what should be denied, but scenario is safe
        const playerDecision = { decision: 'APPROVE', reasonCode: code };
        const result = computeScore(playerDecision, scenario.expected, scenario);

        expect(result.isCorrect).toBe(false);
        expect(result.scoreDelta).toBe(-5);
      }),
      { numRuns: 100 }
    );
  });
});
