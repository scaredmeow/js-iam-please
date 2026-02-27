import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  serializeScenarioForStorage,
  deserializeScenarioFromStorage,
  computeLeaderboardEntry,
} from '../../src/engine/supabase-client.js';

/**
 * Arbitrary generator for valid Scenario objects (reused from scenario-loader tests).
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

function jsonNormalize(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('Supabase Client', () => {
  /**
   * Feature: ai-dynamic-leaderboard, Property 1: Scenario serialization round-trip
   * Validates: Requirements 2.6, 2.7, 5.5, 5.6
   *
   * For any valid scenario object, serializing it for Supabase storage
   * and then deserializing the stored row should produce an equivalent scenario.
   */
  it('Property 1: serialize then deserialize scenario produces equivalent object', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.constantFrom('pre-authored', 'ai-generated'),
        (scenario, source) => {
          const row = serializeScenarioForStorage(scenario, source);
          const restored = deserializeScenarioFromStorage(row);
          expect(restored).toEqual(jsonNormalize(scenario));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: ai-dynamic-leaderboard, Property 9: Stored scenario metadata
   * Validates: Requirements 5.4
   *
   * For any scenario stored via serializeScenarioForStorage, the stored record
   * should include a source field and a created_at timestamp.
   */
  it('Property 9: stored scenario has source and created_at metadata', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.constantFrom('pre-authored', 'ai-generated'),
        (scenario, source) => {
          const row = serializeScenarioForStorage(scenario, source);
          expect(row.source).toBe(source);
          expect(typeof row.created_at).toBe('string');
          expect(row.created_at.length).toBeGreaterThan(0);
          // Verify it's a valid ISO date
          expect(isNaN(new Date(row.created_at).getTime())).toBe(false);
          expect(row.id).toBe(scenario.id);
          expect(row.day).toBe(scenario.day);
        }
      ),
      { numRuns: 100 }
    );
  });
});
