/**
 * State Persistence — serializes/deserializes game state to/from JSON
 * and manages localStorage read/write.
 *
 * Handles:
 *   - Corrupted data: resets to initial state
 *   - Missing localStorage: continues without persistence
 */

const STORAGE_KEY = 'iam-please-game-state';

/**
 * The initial (fresh) game state used when no saved state exists
 * or when saved state is corrupted.
 */
export function getInitialState() {
  return {
    currentDay: 0,
    completedDays: [],
    currentTicketIndex: 0,
    dayScoreEvents: [],
    cumulativeScore: 0,
    unlockedFeatures: {
      abac: false,
      guardrails: false,
      breakGlass: false,
    },
  };
}

/**
 * Validate that a state object has the expected shape and types.
 * @param {object} state
 * @returns {boolean}
 */
function isValidState(state) {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return false;
  }
  if (typeof state.currentDay !== 'number') return false;
  if (!Array.isArray(state.completedDays)) return false;
  if (typeof state.currentTicketIndex !== 'number') return false;
  if (!Array.isArray(state.dayScoreEvents)) return false;
  if (typeof state.cumulativeScore !== 'number') return false;
  if (typeof state.unlockedFeatures !== 'object' || state.unlockedFeatures === null) return false;
  if (typeof state.unlockedFeatures.abac !== 'boolean') return false;
  if (typeof state.unlockedFeatures.guardrails !== 'boolean') return false;
  if (typeof state.unlockedFeatures.breakGlass !== 'boolean') return false;
  return true;
}

/**
 * Serialize a game state object to a JSON string.
 * @param {object} state - A valid game state object
 * @returns {string} JSON string
 */
export function serializeState(state) {
  return JSON.stringify(state);
}

/**
 * Deserialize a JSON string into a game state object.
 * Returns the initial state if the JSON is invalid or the resulting
 * object doesn't match the expected shape.
 * @param {string} json
 * @returns {object} A valid game state object
 */
export function deserializeState(json) {
  try {
    const parsed = JSON.parse(json);
    if (isValidState(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to return initial state
  }
  return getInitialState();
}

/**
 * Check whether localStorage is available.
 * @returns {boolean}
 */
function isLocalStorageAvailable() {
  try {
    const testKey = '__iam_please_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save game state to localStorage.
 * Does nothing if localStorage is unavailable.
 * @param {object} state
 */
export function saveToLocalStorage(state) {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    // Silently fail (e.g. quota exceeded)
  }
}

/**
 * Load game state from localStorage.
 * Returns the initial state if localStorage is unavailable,
 * empty, or contains corrupted data.
 * @returns {object} A valid game state object
 */
export function loadFromLocalStorage() {
  if (!isLocalStorageAvailable()) return getInitialState();
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json === null) return getInitialState();
    return deserializeState(json);
  } catch {
    return getInitialState();
  }
}
