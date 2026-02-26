import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serializeState, deserializeState, getInitialState } from '../../src/engine/persistence.js';

/**
 * Arbitrary generator for a ScoreEvent (matches the shape produced by scoring.js).
 */
const arbScoreEvent = fc.record({
  scenarioId: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
  decision: fc.constantFrom('APPROVE', 'DENY'),
  isCorrect: fc.boolean(),
  rationaleCorrect: fc.boolean(),
  scoreDelta: fc.constantFrom(13, 10, -5, -15),
  isDangerous: fc.boolean(),
});

/**
 * Arbitrary generator for a valid game state object.
 */
const arbGameState = fc.record({
  currentDay: fc.integer({ min: 0, max: 30 }),
  completedDays: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 0, maxLength: 10 }),
  currentTicketIndex: fc.integer({ min: 0, max: 20 }),
  dayScoreEvents: fc.array(arbScoreEvent, { minLength: 0, maxLength: 10 }),
  cumulativeScore: fc.integer({ min: -200, max: 500 }),
  unlockedFeatures: fc.record({
    abac: fc.boolean(),
    guardrails: fc.boolean(),
    breakGlass: fc.boolean(),
  }),
});

describe('State Persistence', () => {
  /**
   * Feature: iam-please, Property 12: Game state persistence round-trip
   * Validates: Requirements 10.3, 10.4, 10.5
   *
   * For any valid game state object (containing currentDay, completedDays,
   * currentTicketIndex, dayScoreEvents, cumulativeScore, and unlockedFeatures),
   * serializing to JSON and then deserializing should produce an equivalent
   * game state object.
   */
  it('Property 12: deserialize(serialize(state)) === state for all valid game states', () => {
    fc.assert(
      fc.property(arbGameState, (state) => {
        const json = serializeState(state);
        const restored = deserializeState(json);
        expect(restored).toEqual(state);
      }),
      { numRuns: 100 },
    );
  });

  it('deserializeState returns initial state for invalid JSON', () => {
    const result = deserializeState('not valid json');
    expect(result).toEqual(getInitialState());
  });

  it('deserializeState returns initial state for structurally invalid objects', () => {
    const result = deserializeState(JSON.stringify({ foo: 'bar' }));
    expect(result).toEqual(getInitialState());
  });
});
