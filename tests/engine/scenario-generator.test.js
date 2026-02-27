import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseScenario, ValidationError } from '../../src/engine/scenario-loader.js';

/**
 * Arbitrary generators for scenario objects.
 */
const arbRequester = fc.record({
  name: fc.string({ minLength: 1 }),
  role: fc.string({ minLength: 1 }),
});

const arbRequest = fc.record({
  requester: arbRequester,
  actions: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
  resources: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
  justification: fc.string({ minLength: 1 }),
});

const arbExpected = fc.record({
  decision: fc.constantFrom('APPROVE', 'DENY'),
  reasonCode: fc.string({ minLength: 1 }),
  explanation: fc.string({ minLength: 1 }),
});

const arbValidScenario = fc.record({
  id: fc.string({ minLength: 1 }),
  day: fc.integer({ min: 1, max: 30 }),
  title: fc.string({ minLength: 1 }),
  request: arbRequest,
  expected: arbExpected,
  teachingPoint: fc.string({ minLength: 1 }),
});

/**
 * Generator for invalid scenario-like objects: takes a valid scenario
 * and corrupts exactly one required field (removes it or sets wrong type).
 */
const REQUIRED_FIELDS = ['id', 'day', 'title', 'request', 'expected', 'teachingPoint'];

const arbCorruption = fc.oneof(
  // Remove a required field
  fc.record({
    kind: fc.constant('remove'),
    field: fc.constantFrom(...REQUIRED_FIELDS),
  }),
  // Set wrong type for a field
  fc.record({
    kind: fc.constant('wrongType'),
    field: fc.constantFrom(
      { field: 'id', value: 123 },
      { field: 'day', value: 'not-a-number' },
      { field: 'day', value: -1 },
      { field: 'day', value: 0 },
      { field: 'title', value: 42 },
      { field: 'teachingPoint', value: [] },
      { field: 'request', value: 'string' },
      { field: 'request', value: null },
      { field: 'expected', value: 'string' },
      { field: 'expected', value: null },
    ),
  })
);

describe('Scenario Generator — Property 2: Generated scenario schema validation', () => {
  /**
   * Feature: ai-dynamic-leaderboard, Property 2: Generated scenario schema validation
   * Validates: Requirements 1.2
   *
   * For any JSON object returned by the Gemini API, the Scenario_Generator should
   * only accept it if it passes the existing scenario schema validation (has all
   * required fields with correct types). Invalid objects should be rejected.
   */
  it('Property 2: parseScenario accepts all valid scenarios', () => {
    fc.assert(
      fc.property(arbValidScenario, (scenario) => {
        const json = JSON.stringify(scenario);
        const parsed = parseScenario(json);
        expect(parsed.id).toBe(scenario.id);
        expect(parsed.day).toBe(scenario.day);
        expect(parsed.title).toBe(scenario.title);
        expect(parsed.teachingPoint).toBe(scenario.teachingPoint);
        expect(parsed.request.requester.name).toBe(scenario.request.requester.name);
        expect(parsed.expected.decision).toBe(scenario.expected.decision);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 2: parseScenario rejects scenarios with missing or wrong-typed fields', () => {
    fc.assert(
      fc.property(arbValidScenario, fc.constantFrom(...REQUIRED_FIELDS), (scenario, fieldToRemove) => {
        const broken = { ...scenario };
        delete broken[fieldToRemove];
        const json = JSON.stringify(broken);
        expect(() => parseScenario(json)).toThrow(ValidationError);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 2: parseScenario rejects scenarios with wrong field types', () => {
    const wrongTypes = [
      { field: 'id', value: 123 },
      { field: 'day', value: 'not-a-number' },
      { field: 'day', value: -1 },
      { field: 'day', value: 0 },
      { field: 'title', value: 42 },
      { field: 'teachingPoint', value: [] },
      { field: 'request', value: 'string' },
      { field: 'request', value: null },
      { field: 'expected', value: 'string' },
      { field: 'expected', value: null },
    ];

    fc.assert(
      fc.property(arbValidScenario, fc.constantFrom(...wrongTypes), (scenario, { field, value }) => {
        const broken = { ...scenario, [field]: value };
        const json = JSON.stringify(broken);
        expect(() => parseScenario(json)).toThrow(ValidationError);
      }),
      { numRuns: 100 }
    );
  });
});
