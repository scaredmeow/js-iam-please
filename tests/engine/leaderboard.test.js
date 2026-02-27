import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  sortAndLimitEntries,
  computeLeaderboardEntry,
  renderLeaderboardEntry,
} from '../../src/ui/leaderboard-panel.js';

// --- Generators ---

const arbLeaderboardEntry = fc.record({
  player_id: fc.uuid(),
  player_name: fc.string({ minLength: 1, maxLength: 30 }),
  cumulative_score: fc.integer({ min: -500, max: 10000 }),
  days_completed: fc.integer({ min: 0, max: 30 }),
  accuracy_pct: fc.double({ min: 0, max: 100, noNaN: true }),
});

const arbScoreEvent = fc.record({
  scenarioId: fc.string({ minLength: 1 }),
  decision: fc.constantFrom('APPROVE', 'DENY'),
  isCorrect: fc.boolean(),
  rationaleCorrect: fc.boolean(),
  scoreDelta: fc.integer({ min: -15, max: 13 }),
  isDangerous: fc.boolean(),
});

describe('Leaderboard', () => {
  /**
   * Feature: ai-dynamic-leaderboard, Property 4: Leaderboard ordering and limit
   * Validates: Requirements 3.1, 3.2
   *
   * For any set of leaderboard entries, the displayed leaderboard should be
   * sorted by cumulative score in descending order and contain at most 50 entries.
   */
  it('Property 4: entries are sorted descending by score and limited to 50', () => {
    fc.assert(
      fc.property(
        fc.array(arbLeaderboardEntry, { minLength: 0, maxLength: 120 }),
        (entries) => {
          const result = sortAndLimitEntries(entries);

          // At most 50 entries
          expect(result.length).toBeLessThanOrEqual(50);

          // Length is min(entries.length, 50)
          expect(result.length).toBe(Math.min(entries.length, 50));

          // Sorted descending by cumulative_score
          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].cumulative_score).toBeGreaterThanOrEqual(
              result[i].cumulative_score
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Feature: ai-dynamic-leaderboard, Property 5: Leaderboard entry computation
   * Validates: Requirements 3.3
   *
   * For any completed game state, the computed leaderboard entry should have:
   * cumulative_score equal to gameState.cumulativeScore, days_completed equal to
   * the count of completed days, and accuracy_pct equal to
   * (correct decisions / total decisions) * 100.
   */
  it('Property 5: computed entry matches game state aggregates', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: -500, max: 10000 }),
        fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 0, maxLength: 20 }),
        fc.array(arbScoreEvent, { minLength: 0, maxLength: 50 }),
        (playerId, playerName, cumulativeScore, completedDays, scoreEvents) => {
          const gameState = { cumulativeScore, completedDays };
          const entry = computeLeaderboardEntry(playerId, playerName, gameState, scoreEvents);

          expect(entry.player_id).toBe(playerId);
          expect(entry.player_name).toBe(playerName);
          expect(entry.cumulative_score).toBe(cumulativeScore);
          expect(entry.days_completed).toBe(completedDays.length);

          const total = scoreEvents.length;
          const correct = scoreEvents.filter(e => e.isCorrect).length;
          const expectedAccuracy = total > 0
            ? Math.round((correct / total) * 1000) / 10
            : 0;
          expect(entry.accuracy_pct).toBe(expectedAccuracy);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: ai-dynamic-leaderboard, Property 6: Leaderboard entry rendering completeness
   * Validates: Requirements 3.4
   *
   * For any leaderboard entry, the rendered output should contain the rank number,
   * player name, cumulative score, days completed, and accuracy percentage.
   */
  it('Property 6: rendered entry contains rank, name, score, days, accuracy', () => {
    fc.assert(
      fc.property(
        arbLeaderboardEntry,
        fc.integer({ min: 1, max: 100 }),
        fc.boolean(),
        (entry, rank, isCurrentPlayer) => {
          const html = renderLeaderboardEntry(entry, rank, isCurrentPlayer);

          // Contains rank
          expect(html).toContain(`${rank}`);
          // Contains player name (escaped)
          expect(html).toContain(esc(entry.player_name));
          // Contains cumulative score
          expect(html).toContain(`${entry.cumulative_score}`);
          // Contains days completed
          expect(html).toContain(`${entry.days_completed}`);
          // Contains accuracy percentage
          expect(html).toContain(`${entry.accuracy_pct}%`);

          // Highlight class for current player
          if (isCurrentPlayer) {
            expect(html).toContain('current-player');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/** Escape HTML (mirrors the implementation). */
function esc(str) {
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
