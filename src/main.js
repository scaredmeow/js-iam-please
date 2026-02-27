/**
 * IAM Please — main entry point.
 * Wires engine modules to UI components at startup.
 * Integrates Supabase, welcome screen, leaderboard, and Supabase-first scenario loading.
 */

import { GameController } from './engine/game-controller.js';
import { loadFromLocalStorage, saveToLocalStorage, getInitialState } from './engine/persistence.js';
import { renderRequestPanel, showStampOverlay } from './ui/request-panel.js';
import { renderRulebookPanel, initRulebookTabs } from './ui/rulebook-panel.js';
import { initDecisionBar, setDecisionMade, resetDecisionBar, updateProgress, disableDecisionBar } from './ui/decision-bar.js';
import { showTicketFeedback, hideFeedback, showDaySummary } from './ui/feedback-panel.js';
import { initKeyboardHandler } from './ui/keyboard-handler.js';
import { initSupabase, isAvailable, fetchLeaderboard, upsertLeaderboardEntry, lookupGameId } from './engine/supabase-client.js';
import { showLeaderboard, showLeaderboardUnavailable } from './ui/leaderboard-panel.js';
import { showWelcomeScreen, loadPlayerProfile } from './ui/welcome-screen.js';
import { loadScenariosForDay } from './engine/scenario-generator.js';

/** @type {GameController|null} */
let game = null;

/** @type {object} */
let roleMatrix = {};

/** @type {object|null} */
let abacOverlay = null;

/** @type {object[]} */
let guardrails = [];

/** @type {object[]} */
let allScenarios = [];

/** @type {object[]} */
let currentDayTickets = [];

/** @type {{ player_id: string, player_name: string }|null} */
let playerProfile = null;

/** @type {object[]} All score events across all completed days (for leaderboard computation) */
let allScoreEvents = [];

/**
 * Fetch a JSON file and return parsed content.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

/**
 * Load static data files: role matrix, ABAC rules, guardrails.
 * Scenarios are loaded per-day via Supabase-first loader.
 */
async function loadStaticData() {
  const [roles, abac, guardrailsData] = await Promise.all([
    fetchJSON('src/data/roles.json'),
    fetchJSON('src/data/abac-rules.json'),
    fetchJSON('src/data/guardrails.json'),
  ]);

  roleMatrix = roles;
  abacOverlay = abac;
  guardrails = guardrailsData.guardrails || [];
}

/**
 * Load scenarios for a specific day using Supabase-first loader,
 * then merge them into allScenarios (replacing any existing for that day).
 * @param {number} day
 * @returns {Promise<object[]>}
 */
async function loadDayScenarios(day) {
  const scenarios = await loadScenariosForDay(day);
  // Remove any existing scenarios for this day from allScenarios
  allScenarios = allScenarios.filter(s => s.day !== day);
  // Add the newly loaded ones
  allScenarios.push(...scenarios);
  return scenarios;
}

/**
 * Present the current ticket to the player.
 */
function showCurrentTicket() {
  const ticket = game.getCurrentTicket();
  renderRequestPanel(ticket);
  hideFeedback();

  if (ticket) {
    resetDecisionBar();
    const idx = game._currentTicketIndex;
    const total = game._dayTickets.length;
    updateProgress(idx + 1, total);
  } else {
    disableDecisionBar();
  }
}

/**
 * Update the rulebook panel based on the current day's active features.
 */
function updateRulebook() {
  const effectiveABAC = game.getEffectiveABAC();
  const effectiveGuardrails = game.getEffectiveGuardrails();
  renderRulebookPanel(roleMatrix, effectiveABAC, effectiveGuardrails);
}

/**
 * Update the header display with current day, score, and game ID.
 */
function updateHeader() {
  const dayEl = document.getElementById('header-day');
  const scoreEl = document.getElementById('header-score');
  const gameIdEl = document.getElementById('header-game-id');
  const actionGameIdEl = document.getElementById('action-game-id-value');
  if (dayEl) dayEl.textContent = `Day ${game.currentDay}`;
  if (scoreEl) {
    const dayScore = game._dayScoreEvents.reduce((sum, e) => sum + e.scoreDelta, 0);
    const totalDisplay = game.cumulativeScore + dayScore;
    scoreEl.textContent = `Score: ${totalDisplay}`;
  }
  if (playerProfile) {
    const shortId = playerProfile.player_id.substring(0, 8).toUpperCase();
    if (gameIdEl) {
      gameIdEl.textContent = `Game: ${shortId}`;
      gameIdEl.title = `Game ID: ${playerProfile.player_id}`;
    }
    if (actionGameIdEl) {
      actionGameIdEl.textContent = shortId;
      actionGameIdEl.title = playerProfile.player_id;
    }
  }
}

/**
 * Check if approving a request with missing fields should trigger a warning.
 * @param {object} ticket
 * @param {string} decision
 * @returns {string|null}
 */
function checkMissingFieldWarning(ticket, decision) {
  if (decision !== 'APPROVE') return null;

  const request = ticket.request || {};
  const warnings = [];

  if (!request.justification) {
    warnings.push('no justification provided');
  }
  if (!request.resources || request.resources.length === 0) {
    warnings.push('no resources specified');
  }

  const role = request.requester?.role;
  const actions = request.actions || [];
  const hasWildcard = actions.includes('*');
  if ((role === 'Admin' || hasWildcard) && !request.ticketId) {
    warnings.push('no ticket ID for elevated access');
  }

  if (warnings.length > 0) {
    return `This request is missing: ${warnings.join(', ')}. Consider implicit deny before approving.`;
  }
  return null;
}

/**
 * Show a confirmation dialog for missing-field warnings.
 * @param {string} warningText
 * @returns {boolean}
 */
function confirmApproval(warningText) {
  return window.confirm(`⚠ ${warningText}\n\nDo you still want to APPROVE?`);
}

/**
 * Compute and upsert the current leaderboard entry to Supabase.
 * Called after every decision and at day completion.
 */
function syncLeaderboard() {
  if (!playerProfile) return;
  const gameState = game.getGameState();
  // Include current in-progress day score events in the total
  const currentDayEvents = game._dayScoreEvents || [];
  const allEvents = [...allScoreEvents, ...currentDayEvents];
  const totalDecisions = allEvents.length;
  const correctDecisions = allEvents.filter(e => e.isCorrect).length;
  const accuracyPct = totalDecisions > 0
    ? Math.round((correctDecisions / totalDecisions) * 1000) / 10
    : 0;
  const dayScore = currentDayEvents.reduce((sum, e) => sum + e.scoreDelta, 0);

  const entry = {
    player_id: playerProfile.player_id,
    player_name: playerProfile.player_name,
    cumulative_score: gameState.cumulativeScore + dayScore,
    days_completed: (gameState.completedDays || []).length,
    accuracy_pct: accuracyPct,
  };
  upsertLeaderboardEntry(entry).catch(err => {
    console.warn('Failed to sync leaderboard:', err.message);
  });
}

/**
 * Handle a player decision (stamp + rationale).
 * @param {string} decision - 'APPROVE' or 'DENY'
 * @param {string} reasonCode - The selected rationale code
 */
function handleDecision(decision, reasonCode) {
  if (!game) return;
  const ticket = game.getCurrentTicket();
  if (!ticket) return;

  const warningText = checkMissingFieldWarning(ticket, decision);
  if (warningText && !confirmApproval(warningText)) {
    return;
  }

  const { scoreEvent, warning } = game.submitDecision(decision, reasonCode);

  showStampOverlay(decision);
  setDecisionMade();
  showTicketFeedback(scoreEvent, ticket, warning);
  updateHeader();
  saveGameState();

  // Update leaderboard after every decision
  syncLeaderboard();
}

/**
 * Handle advancing to the next ticket.
 */
function handleNextTicket() {
  if (!game) return;
  if (game.isDayComplete()) {
    handleDayComplete();
    return;
  }
  showCurrentTicket();
}

/**
 * Handle day completion — show summary, persist state, upsert leaderboard.
 */
async function handleDayComplete() {
  const summary = game.completeDay();
  disableDecisionBar();
  hideFeedback();
  updateHeader();
  saveGameState();

  // Accumulate score events for leaderboard computation
  allScoreEvents.push(...summary.scoreEvents);

  // Sync leaderboard with final day scores
  syncLeaderboard();

  showDaySummary(summary, currentDayTickets, {
    onNextDay: () => startNextDay(),
  });
}

/**
 * Start the next day.
 */
async function startNextDay() {
  const nextDay = game.currentDay + 1;
  await startDay(nextDay);
}

/**
 * Start a specific day. Loads scenarios via Supabase-first loader.
 * @param {number} dayNumber
 */
async function startDay(dayNumber) {
  // Load scenarios for this day (Supabase first, fallback to local JSON)
  const dayScenarios = await loadDayScenarios(dayNumber);

  if (dayScenarios.length === 0) {
    showNoDaysMessage();
    return;
  }

  // Sync the game controller's scenario pool with the latest loaded scenarios
  game._allScenarios = allScenarios;

  game.startDay(dayNumber);
  currentDayTickets = allScenarios.filter(s => s.day === dayNumber);
  updateHeader();
  updateRulebook();
  showCurrentTicket();
  saveGameState();
}

/**
 * Show a message when no more days are available.
 */
function showNoDaysMessage() {
  renderRequestPanel(null);
  disableDecisionBar();
  const content = document.getElementById('feedback-content');
  const panel = document.getElementById('feedback-panel');
  if (content && panel) {
    content.innerHTML = '<div class="feedback-correct"><strong>Congratulations!</strong> You have completed all available days. Check back for new scenarios.</div>';
    panel.hidden = false;
  }
}

/**
 * Save the current game state to localStorage.
 */
function saveGameState() {
  const state = game.getGameState();
  saveToLocalStorage(state);
}

/**
 * Determine the starting day from saved state.
 * @param {object} savedState
 * @returns {number}
 */
function getStartingDay(savedState) {
  if (savedState.currentDay > 0) {
    return savedState.currentDay;
  }

  const completedSet = new Set(savedState.completedDays || []);
  for (let d = 1; d <= 20; d++) {
    if (!completedSet.has(d)) {
      return d;
    }
  }

  return 1;
}

/**
 * Go back to the welcome screen for a new game.
 */
async function handleNewGame() {
  if (!game) return;

  // Hide game UI
  const gameArea = document.getElementById('game-area');
  const decisionBar = document.getElementById('decision-bar');
  const header = document.querySelector('header');
  const actionBar = document.getElementById('action-bar');
  if (gameArea) gameArea.style.display = 'none';
  if (decisionBar) decisionBar.style.display = 'none';
  if (header) header.style.display = 'none';
  if (actionBar) actionBar.style.display = 'none';

  hideFeedback();

  // Show welcome screen again
  const existingProfile = loadPlayerProfile();
  const savedState = loadFromLocalStorage();
  const hasSavedGame = savedState.currentDay > 0 || savedState.completedDays.length > 0;

  showWelcomeScreen({
    savedName: null,
    hasSavedGame: hasSavedGame && existingProfile != null,
    savedGameId: null,
    onStartGame: (name, id) => beginGame(name, id, true),
    onContinueGame: (name, id) => beginGame(name, id, false),
    onViewLeaderboard: openLeaderboard,
    onLookupGameId: lookupGameId,
  });
}

/**
 * Open the leaderboard view (mid-game or from welcome screen).
 */
async function openLeaderboard() {
  const available = await isAvailable();
  if (!available) {
    showLeaderboardUnavailable(() => {});
    return;
  }

  const entries = await fetchLeaderboard(50);
  const currentName = playerProfile ? playerProfile.player_name : null;
  showLeaderboard(entries, currentName, () => {});
}

/**
 * Start the game after the welcome screen.
 * @param {string} playerName
 * @param {string} playerId
 * @param {boolean} isNewGame - true for "Start Game" / "New Game", false for "Continue Game"
 */
async function beginGame(playerName, playerId, isNewGame) {
  playerProfile = { player_id: playerId, player_name: playerName };

  // Show the game UI
  const gameArea = document.getElementById('game-area');
  const decisionBar = document.getElementById('decision-bar');
  const header = document.querySelector('header');
  const actionBar = document.getElementById('action-bar');
  if (gameArea) gameArea.style.display = '';
  if (decisionBar) decisionBar.style.display = '';
  if (header) header.style.display = '';
  if (actionBar) actionBar.style.display = '';

  if (isNewGame) {
    saveToLocalStorage(getInitialState());
    game.loadGameState(getInitialState());
    allScoreEvents = [];

    // Create leaderboard entry immediately with score 0
    upsertLeaderboardEntry({
      player_id: playerId,
      player_name: playerName,
      cumulative_score: 0,
      days_completed: 0,
      accuracy_pct: 0,
    }).catch(err => {
      console.warn('Failed to create initial leaderboard entry:', err.message);
    });

    await startDay(1);
  } else {
    // Continue from saved state
    const savedState = loadFromLocalStorage();
    if (savedState.currentDay > 0 || savedState.completedDays.length > 0) {
      game.loadGameState(savedState);
    }
    const startingDay = getStartingDay(savedState);
    await startDay(startingDay);
  }
}

/**
 * Main initialization.
 */
async function init() {
  // Initialize UI components
  initRulebookTabs();
  initDecisionBar({
    onDecision: handleDecision,
    onNextTicket: handleNextTicket,
  });
  initKeyboardHandler();

  const newGameBtn = document.getElementById('btn-new-game');
  if (newGameBtn) newGameBtn.addEventListener('click', handleNewGame);

  // Wire up header leaderboard button
  const lbBtn = document.getElementById('btn-leaderboard-header');
  if (lbBtn) lbBtn.addEventListener('click', openLeaderboard);

  // Wire up copy game ID button
  const copyBtn = document.getElementById('btn-copy-game-id');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!playerProfile) return;
      navigator.clipboard.writeText(playerProfile.player_id).then(() => {
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
      }).catch(() => {
        copyBtn.textContent = '⚠ Failed';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
      });
    });
  }

  disableDecisionBar();

  // Hide game UI until welcome screen completes
  const gameArea = document.getElementById('game-area');
  const decisionBar = document.getElementById('decision-bar');
  const header = document.querySelector('header');
  const actionBar = document.getElementById('action-bar');
  if (gameArea) gameArea.style.display = 'none';
  if (decisionBar) decisionBar.style.display = 'none';
  if (header) header.style.display = 'none';
  if (actionBar) actionBar.style.display = 'none';

  // Initialize Supabase (non-blocking — game works without it)
  try {
    await initSupabase();
  } catch (err) {
    console.warn('Supabase init failed, continuing offline:', err.message);
  }

  try {
    await loadStaticData();
  } catch (err) {
    console.error('Failed to load game data:', err);
    // Show game area to display error
    if (gameArea) gameArea.style.display = '';
    if (header) header.style.display = '';
    const reqPanel = document.getElementById('request-panel');
    if (reqPanel) {
      reqPanel.innerHTML = `
        <h2 class="panel-heading">Error</h2>
        <div class="feedback-incorrect" style="margin-top:1rem;">
          <strong>Failed to load game data.</strong><br>${err.message}
        </div>
        <p style="margin-top:1rem; font-size:0.85rem; color:var(--text-secondary);">
          Make sure you are running a local server:<br>
          <code style="background:#eee;padding:0.2em 0.4em;border-radius:3px;">npx serve .</code><br><br>
          Opening index.html directly as a file won't work because the game needs to fetch JSON data.
        </p>`;
    }
    return;
  }

  // Create game controller (scenarios loaded per-day now, start with empty)
  game = new GameController(allScenarios, roleMatrix, abacOverlay, guardrails);
  console.log('IAM Please loaded — showing welcome screen');

  // Check for existing player profile and saved game
  const existingProfile = loadPlayerProfile();
  const savedState = loadFromLocalStorage();
  const hasSavedGame = savedState.currentDay > 0 || savedState.completedDays.length > 0;

  // Show welcome screen (Requirement 4.1, 4.2, 4.3)
  showWelcomeScreen({
    savedName: null,
    hasSavedGame: hasSavedGame && existingProfile != null,
    savedGameId: null,
    onStartGame: (name, id) => beginGame(name, id, true),
    onContinueGame: (name, id) => beginGame(name, id, false),
    onViewLeaderboard: openLeaderboard,
    onLookupGameId: lookupGameId,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
