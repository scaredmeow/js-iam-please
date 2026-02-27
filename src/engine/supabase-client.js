/**
 * Supabase Client — handles all communication with the Supabase database.
 * Manages scenarios storage and leaderboard operations.
 * Loaded via CDN import (no npm install needed for browser runtime).
 */

const SUPABASE_URL = 'https://chhrprxsqvnabdhjicnp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoaHJwcnhzcXZuYWJkaGppY25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTY2MzksImV4cCI6MjA4NzY5MjYzOX0.E45fo1Fk_pUZ8olu1HTJwEtwAaNXrY5H8W-9HHJuKNs';

/** @type {object|null} */
let supabase = null;

/**
 * Initialize the Supabase client.
 * Uses dynamic import from CDN for browser compatibility.
 * @returns {Promise<object>} Supabase client instance
 */
export async function initSupabase() {
  if (supabase) return supabase;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabase;
  } catch (err) {
    console.warn('Failed to initialize Supabase:', err.message);
    return null;
  }
}

/**
 * Get the current Supabase client instance (or null if not initialized).
 * @returns {object|null}
 */
export function getClient() {
  return supabase;
}

/**
 * Check if Supabase is reachable by performing a lightweight query.
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('leaderboard').select('player_id').limit(1);
    return !error;
  } catch {
    return false;
  }
}


/**
 * Serialize a scenario object for Supabase storage.
 * @param {object} scenario - A validated scenario object
 * @param {string} source - 'pre-authored' or 'ai-generated'
 * @returns {object} Row object for the scenarios table
 */
export function serializeScenarioForStorage(scenario, source) {
  return {
    id: scenario.id,
    day: scenario.day,
    difficulty: scenario.difficulty || 1,
    scenario_data: scenario,
    source: source,
    created_at: new Date().toISOString(),
  };
}

/**
 * Deserialize a Supabase row back into a scenario object.
 * @param {object} row - A row from the scenarios table
 * @returns {object} Scenario object
 */
export function deserializeScenarioFromStorage(row) {
  return row.scenario_data;
}

/**
 * Store a scenario in Supabase.
 * @param {object} scenario - Validated scenario object
 * @param {string} source - 'pre-authored' or 'ai-generated'
 * @returns {Promise<boolean>} true if stored successfully
 */
export async function storeScenario(scenario, source) {
  if (!supabase) return false;
  try {
    const row = serializeScenarioForStorage(scenario, source);
    const { error } = await supabase.from('scenarios').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to store scenario:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to store scenario:', err.message);
    return false;
  }
}

/**
 * Fetch scenarios for a given day from Supabase.
 * @param {number} day - Day number
 * @returns {Promise<object[]>} Array of scenario objects (empty on failure)
 */
export async function fetchScenarios(day) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('day', day);
    if (error) {
      console.warn('Failed to fetch scenarios:', error.message);
      return [];
    }
    return (data || []).map(deserializeScenarioFromStorage);
  } catch (err) {
    console.warn('Failed to fetch scenarios:', err.message);
    return [];
  }
}

/**
 * Fetch leaderboard entries, ordered by score descending.
 * @param {number} [limit=50] - Max entries to return
 * @returns {Promise<object[]>} Array of leaderboard entries (empty on failure)
 */
export async function fetchLeaderboard(limit = 50) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('cumulative_score', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('Failed to fetch leaderboard:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Failed to fetch leaderboard:', err.message);
    return [];
  }
}

/**
 * Upsert a player's leaderboard entry.
 * @param {object} entry - { player_id, player_name, cumulative_score, days_completed, accuracy_pct }
 * @returns {Promise<boolean>} true if upserted successfully
 */
export async function upsertLeaderboardEntry(entry) {
  if (!supabase) return false;
  try {
    const row = {
      player_id: entry.player_id,
      player_name: entry.player_name,
      cumulative_score: entry.cumulative_score,
      days_completed: entry.days_completed,
      accuracy_pct: entry.accuracy_pct,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('leaderboard')
      .upsert(row, { onConflict: 'player_id' });
    if (error) {
      console.warn('Failed to upsert leaderboard entry:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to upsert leaderboard entry:', err.message);
    return false;
  }
}

/**
 * Check if a game ID (player_id) exists in the leaderboard.
 * @param {string} gameId - The game ID to look up
 * @returns {Promise<{found: boolean, entry: object|null}>}
 */
export async function lookupGameId(gameId) {
  if (!supabase) return { found: false, entry: null };
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('player_id', gameId)
      .limit(1);
    if (error) {
      console.warn('Failed to lookup game ID:', error.message);
      return { found: false, entry: null };
    }
    if (data && data.length > 0) {
      return { found: true, entry: data[0] };
    }
    return { found: false, entry: null };
  } catch (err) {
    console.warn('Failed to lookup game ID:', err.message);
    return { found: false, entry: null };
  }
}

/**
 * Compute a leaderboard entry from the current game state.
 * @param {string} playerId
 * @param {string} playerName
 * @param {object} gameState - { cumulativeScore, completedDays, dayScoreEvents }
 * @param {object[]} allScoreEvents - All score events across all completed days
 * @returns {object} LeaderboardEntry
 */
export function computeLeaderboardEntry(playerId, playerName, gameState, allScoreEvents) {
  const totalDecisions = allScoreEvents.length;
  const correctDecisions = allScoreEvents.filter(e => e.isCorrect).length;
  const accuracyPct = totalDecisions > 0
    ? Math.round((correctDecisions / totalDecisions) * 1000) / 10
    : 0;

  return {
    player_id: playerId,
    player_name: playerName,
    cumulative_score: gameState.cumulativeScore,
    days_completed: (gameState.completedDays || []).length,
    accuracy_pct: accuracyPct,
  };
}
