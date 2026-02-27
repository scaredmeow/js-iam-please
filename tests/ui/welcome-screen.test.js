import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePlayerName } from '../../src/ui/welcome-screen.js';

describe('Welcome Screen', () => {
  /**
   * Feature: ai-dynamic-leaderboard, Property 8: Player name validation
   * Validates: Requirements 4.5
   *
   * For any string composed entirely of whitespace characters (or empty string),
   * the Welcome_Screen validation should reject it and prevent game start.
   */
  it('Property 8: whitespace-only and empty strings are rejected', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 }).map(arr => arr.join('')),
        (whitespaceStr) => {
          expect(validatePlayerName(whitespaceStr)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: valid non-whitespace names are accepted', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (validName) => {
          expect(validatePlayerName(validName)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
