import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildScenarioPrompt } from '../../scripts/generate-scenarios.js';
import { getFeaturesForDay } from '../../src/engine/game-controller.js';

// Load actual game data for realistic testing
import rolesData from '../../src/data/roles.json' with { type: 'json' };
import abacData from '../../src/data/abac-rules.json' with { type: 'json' };
import guardrailsData from '../../src/data/guardrails.json' with { type: 'json' };

describe('Gemini Client', () => {
  /**
   * Feature: ai-dynamic-leaderboard, Property 3: Prompt completeness for act context
   * Validates: Requirements 1.5, 1.6
   *
   * For any day number and configuration (role matrix, ABAC overlay, guardrails),
   * the generated prompt should contain: the role matrix data, the active ABAC rules
   * (if the day is >= 4), the active guardrails (if the day is >= 8), and the target
   * difficulty level matching the day's act.
   */
  it('Property 3: prompt contains role matrix, active ABAC/guardrails, and difficulty for any day', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (day, count) => {
          const features = getFeaturesForDay(day);
          const abacOverlay = features.abac ? abacData : null;
          const guardrails = features.guardrails ? (guardrailsData.guardrails || []) : [];

          const prompt = buildScenarioPrompt(day, rolesData, abacOverlay, guardrails, count);

          // 1. Prompt always contains the role matrix
          expect(prompt).toContain('"Intern"');
          expect(prompt).toContain('"Developer"');
          expect(prompt).toContain('"Admin"');

          // 2. If ABAC is active (day >= 4), prompt contains ABAC rules
          if (features.abac) {
            expect(prompt).toContain('ABAC');
            for (const rule of abacData.rules) {
              expect(prompt).toContain(rule.id);
            }
          }

          // 3. If guardrails are active (day >= 8), prompt contains guardrails
          if (features.guardrails) {
            expect(prompt).toContain('Guardrails');
            for (const g of guardrailsData.guardrails) {
              expect(prompt).toContain(g.id);
            }
          }

          // 4. Prompt contains difficulty information
          expect(prompt).toContain('difficulty');
          expect(prompt).toContain(`day ${day}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
