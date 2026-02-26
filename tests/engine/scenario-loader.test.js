import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseScenario, printScenario, ValidationError } from '../../src/engine/scenario-loader.js';

/**
 * Arbitrary generator for valid Scenario objects.
 */
const arbRequester = fc.record({
  name: fc.string({ minLength: 1 }),
  role: fc.string({ minLength: 1 }),
  team: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  environment: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
});

const arbRequest = fc.record({
  requester: arbRequester,
  actions: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
  resources: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
  justification: fc.string({ minLength: 1 }),
  ticketId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  timeWindow: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  constraints: fc.option(
    fc.record({
      requiresMfa: fc.option(fc.boolean(), { nil: undefined }),
      dataClassification: fc.option(
        fc.constantFrom('internal', 'confidential', 'restricted'),
        { nil: undefined }
      ),
    }),
    { nil: undefined }
  ),
});

const arbExpected = fc.record({
  decision: fc.constantFrom('APPROVE', 'DENY'),
  reasonCode: fc.string({ minLength: 1 }),
  explanation: fc.string({ minLength: 1 }),
});

const arbScenario = fc.record({
  id: fc.string({ minLength: 1 }),
  day: fc.integer({ min: 1, max: 30 }),
  title: fc.string({ minLength: 1 }),
  difficulty: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  request: arbRequest,
  expected: arbExpected,
  teachingPoint: fc.string({ minLength: 1 }),
});

/**
 * Helper: deep-equal comparison that strips undefined keys
 * (JSON.stringify drops undefined, so round-tripped objects won't have them)
 */
function jsonNormalize(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('Scenario Loader', () => {
  /**
   * Feature: iam-please, Property 6: Scenario parse/print round-trip
   * Validates: Requirements 2.3, 2.4, 2.5
   *
   * For any valid Scenario object, printing it to JSON and then parsing
   * the resulting JSON should produce a Scenario object equivalent to the original.
   */
  it('Property 6: parse(print(scenario)) === scenario for all valid scenarios', () => {
    fc.assert(
      fc.property(arbScenario, (scenario) => {
        const json = printScenario(scenario);
        const parsed = parseScenario(json);
        expect(parsed).toEqual(jsonNormalize(scenario));
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: iam-please, Property 7: Invalid scenario rejection
   * Validates: Requirements 2.2
   *
   * For any JSON string that is missing required fields (id, day, title, request,
   * expected, or teachingPoint) or has fields of incorrect types, the Scenario_Loader
   * should reject it with a descriptive validation error.
   */
  it('Property 7: parseScenario rejects objects missing any required top-level field', () => {
    const requiredKeys = ['id', 'day', 'title', 'request', 'expected', 'teachingPoint'];

    fc.assert(
      fc.property(
        arbScenario,
        fc.constantFrom(...requiredKeys),
        (scenario, keyToRemove) => {
          // Create a copy with one required field removed
          const broken = { ...scenario };
          delete broken[keyToRemove];
          const json = JSON.stringify(broken);

          expect(() => parseScenario(json)).toThrow(ValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7: parseScenario rejects objects with wrong types for required fields', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.constantFrom(
          { field: 'id', value: 123 },
          { field: 'day', value: 'not-a-number' },
          { field: 'day', value: -1 },
          { field: 'day', value: 0 },
          { field: 'day', value: 1.5 },
          { field: 'title', value: 42 },
          { field: 'teachingPoint', value: [] },
          { field: 'request', value: 'not-an-object' },
          { field: 'request', value: null },
          { field: 'expected', value: 'not-an-object' },
          { field: 'expected', value: null }
        ),
        (scenario, { field, value }) => {
          const broken = { ...scenario, [field]: value };
          const json = JSON.stringify(broken);

          expect(() => parseScenario(json)).toThrow(ValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });
});
