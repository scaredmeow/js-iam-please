/**
 * Scenario Generator — browser-side module that loads scenarios for a given day.
 * Checks Supabase first; falls back to local JSON files when Supabase is
 * unreachable or has no scenarios for the requested day.
 *
 * Randomization: shuffles the full pool and picks a random subset each play,
 * so 30 players get different scenario orders and combinations.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { isAvailable, fetchScenarios } from './supabase-client.js';

/** Number of scenarios each player sees per day */
const SCENARIOS_PER_DAY = 5;

/**
 * Fisher-Yates shuffle (in-place, returns same array).
 * @param {any[]} arr
 * @returns {any[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Load scenarios for a day. Checks Supabase first, falls back to local JSON.
 * Returns a randomized subset so each player gets a unique experience.
 * @param {number} day - Day number (positive integer)
 * @returns {Promise<object[]>} Array of validated scenario objects
 */
export async function loadScenariosForDay(day) {
  let pool = [];

  // Try Supabase first (Requirement 5.1)
  try {
    const available = await isAvailable();
    if (available) {
      const scenarios = await fetchScenarios(day);
      if (scenarios.length > 0) {
        pool = scenarios;
      }
    }
  } catch (err) {
    console.warn(`Supabase lookup failed for day ${day}:`, err.message);
  }

  // Fall back to local JSON files (Requirement 5.3)
  if (pool.length === 0) {
    pool = await loadLocalScenarios(day);
  }

  // Shuffle and pick a random subset for this play session
  shuffle(pool);
  const count = Math.min(SCENARIOS_PER_DAY, pool.length);
  return pool.slice(0, count);
}

/**
 * Load scenarios from local JSON files.
 * @param {number} day - Day number
 * @returns {Promise<object[]>} Array of scenario objects (empty if file not found)
 */
async function loadLocalScenarios(day) {
  const url = `src/data/scenarios/day${day}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
