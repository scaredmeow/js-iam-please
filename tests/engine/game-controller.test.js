import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { GameController, getFeaturesForDay } from '../../src/engine/game-controller.js';

// --- Generators ---

const DECISIONS = ['APPROVE', 'DENY'];
const ENVIRONMENTS = ['dev', 'staging', 'prod'];
const CLASSIFICATIONS = ['internal', 'confidential', 'restricted'];

const arbReasonCode = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);

/**
 * Generate a valid scenario for a given day.
 */
function arbScenarioForDay(day) {
  return fc.record({
    id: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/).map(s => `${s}-d${day}`),
    day: fc.constant(day),
    title: fc.string({ minLength: 1, maxLength: 40 }),
    request: fc.record({
      requester: fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        role: fc.constantFrom('Intern', 'Developer', 'Security Engineer'),
        team: fc.constantFrom('alpha', 'beta'),
      }),
      actions: fc.array(
        fc.constantFrom('s3:GetObject', 's3:ListBucket', 'ec2:DescribeInstances'),
        { minLength: 1, maxLength: 2 }
      ),
      resources: fc.array(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        { minLength: 1, maxLength: 2 }
      ),
      justification: fc.string({ minLength: 1, maxLength: 50 }),
      environment: fc.constantFrom(...ENVIRONMENTS),
      constraints: fc.record({
        dataClassification: fc.constantFrom(...CLASSIFICATIONS),
      }),
    }),
    expected: fc.record({
      decision: fc.constantFrom(...DECISIONS),
      reasonCode: arbReasonCode,
      explanation: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    teachingPoint: fc.string({ minLength: 1, maxLength: 50 }),
  });
}

/**
 * Generate a list of N scenarios all assigned to the same day.
 */
function arbDayScenarios(day, minCount, maxCount) {
  return fc.integer({ min: minCount, max: maxCount }).chain(count =>
    fc.array(arbScenarioForDay(day), { minLength: count, maxLength: count })
  );
}

const EMPTY_ROLE_MATRIX = { roles: {} };
const NULL_ABAC = null;
const EMPTY_GUARDRAILS = [];

describe('Game Controller', () => {

  /**
   * Feature: iam-please, Property 10: Game flow ticket progression
   * Validates: Requirements 4.2, 4.3, 4.4
   *
   * For any day with N tickets, submitting a decision for each ticket in sequence
   * should produce exactly N Score_Events, and after all N submissions the day
   * should be marked complete with a summary containing the correct total score
   * and accuracy.
   */
  it('Property 10: Game flow ticket progression', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        arbReasonCode,
        (dayNum, playerReasonCode) => {
          // Generate a fixed set of scenarios for this day
          const ticketCount = 3;
          const scenarios = [];
          for (let i = 0; i < ticketCount; i++) {
            scenarios.push({
              id: `scenario-${dayNum}-${i}`,
              day: dayNum,
              title: `Test Ticket ${i}`,
              request: {
                requester: { name: 'Test User', role: 'Developer', team: 'alpha' },
                actions: ['s3:GetObject'],
                resources: ['my-bucket'],
                justification: 'Testing',
                environment: 'dev',
                constraints: { dataClassification: 'internal' },
              },
              expected: {
                decision: i % 2 === 0 ? 'APPROVE' : 'DENY',
                reasonCode: `reason-${i}`,
                explanation: `Explanation ${i}`,
              },
              teachingPoint: `Teaching point ${i}`,
            });
          }

          const gc = new GameController(scenarios, EMPTY_ROLE_MATRIX, NULL_ABAC, EMPTY_GUARDRAILS);
          gc.startDay(dayNum);

          // Before any submissions, day should not be complete
          expect(gc.isDayComplete()).toBe(false);

          // Submit decisions for all tickets
          const results = [];
          for (let i = 0; i < ticketCount; i++) {
            expect(gc.getCurrentTicket()).not.toBeNull();
            const { scoreEvent } = gc.submitDecision('APPROVE', playerReasonCode);
            results.push(scoreEvent);
          }

          // After all submissions, day should be complete
          expect(gc.isDayComplete()).toBe(true);
          expect(gc.getCurrentTicket()).toBeNull();
          expect(results).toHaveLength(ticketCount);

          // Summary should have correct totals
          const summary = gc.getDaySummary();
          expect(summary.ticketCount).toBe(ticketCount);
          expect(summary.scoreEvents).toHaveLength(ticketCount);

          // Total score should equal sum of individual deltas
          const expectedTotal = results.reduce((sum, e) => sum + e.scoreDelta, 0);
          expect(summary.totalScore).toBe(expectedTotal);

          // Accuracy should equal correct count / total
          const correctCount = results.filter(e => e.isCorrect).length;
          expect(summary.accuracy).toBe(correctCount / ticketCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: iam-please, Property 11: Act feature unlocking
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4
   *
   * For any day number, the Game_Controller should activate exactly the correct
   * set of features: days 1-3 use only RBAC (no ABAC, no guardrails), days 4-7
   * add ABAC, days 8-11 add guardrails, and days 12+ enable all features
   * including break-glass.
   */
  it('Property 11: Act feature unlocking', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (dayNum) => {
          const features = getFeaturesForDay(dayNum);

          if (dayNum >= 1 && dayNum <= 3) {
            // Act 1: RBAC only
            expect(features.abac).toBe(false);
            expect(features.guardrails).toBe(false);
            expect(features.breakGlass).toBe(false);
          } else if (dayNum >= 4 && dayNum <= 7) {
            // Act 2: + ABAC
            expect(features.abac).toBe(true);
            expect(features.guardrails).toBe(false);
            expect(features.breakGlass).toBe(false);
          } else if (dayNum >= 8 && dayNum <= 11) {
            // Act 3: + Guardrails
            expect(features.abac).toBe(true);
            expect(features.guardrails).toBe(true);
            expect(features.breakGlass).toBe(false);
          } else {
            // Act 4 (day 12+): All features
            expect(features.abac).toBe(true);
            expect(features.guardrails).toBe(true);
            expect(features.breakGlass).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Also verify that GameController.getActiveFeatures() and the effective
   * ABAC/guardrails methods respect the day-based feature unlocking.
   */
  it('Property 11: GameController respects act feature unlocking', () => {
    const abacConfig = { active: true, rules: [] };
    const guardrailsConfig = [{ id: 'test', type: 'scp', description: 'test', denyCondition: {} }];

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (dayNum) => {
          const scenario = {
            id: 'test', day: dayNum, title: 'Test',
            request: {
              requester: { name: 'A', role: 'Dev' },
              actions: ['s3:Get'], resources: ['b'], justification: 'j',
              environment: 'dev', constraints: { dataClassification: 'internal' },
            },
            expected: { decision: 'DENY', reasonCode: 'r', explanation: 'e' },
            teachingPoint: 'tp',
          };

          const gc = new GameController([scenario], EMPTY_ROLE_MATRIX, abacConfig, guardrailsConfig);
          gc.startDay(dayNum);

          const features = gc.getActiveFeatures();
          const effectiveAbac = gc.getEffectiveABAC();
          const effectiveGuardrails = gc.getEffectiveGuardrails();

          if (dayNum < 4) {
            expect(features.abac).toBe(false);
            expect(effectiveAbac).toBeNull();
            expect(effectiveGuardrails).toEqual([]);
          } else if (dayNum < 8) {
            expect(features.abac).toBe(true);
            expect(effectiveAbac).toBe(abacConfig);
            expect(effectiveGuardrails).toEqual([]);
          } else if (dayNum < 12) {
            expect(features.abac).toBe(true);
            expect(effectiveAbac).toBe(abacConfig);
            expect(effectiveGuardrails).toBe(guardrailsConfig);
          } else {
            expect(features.abac).toBe(true);
            expect(features.guardrails).toBe(true);
            expect(features.breakGlass).toBe(true);
            expect(effectiveAbac).toBe(abacConfig);
            expect(effectiveGuardrails).toBe(guardrailsConfig);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
