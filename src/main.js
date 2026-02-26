/**
 * IAM Please — main entry point.
 * Wires engine modules to UI components at startup.
 */

import { GameController } from './engine/game-controller.js';
import { loadFromLocalStorage, saveToLocalStorage, getInitialState } from './engine/persistence.js';
import { renderRequestPanel, showStampOverlay } from './ui/request-panel.js';
import { renderRulebookPanel, initRulebookTabs } from './ui/rulebook-panel.js';
import { initDecisionBar, setDecisionMade, resetDecisionBar, updateProgress, disableDecisionBar } from './ui/decision-bar.js';
import { showTicketFeedback, hideFeedback, showDaySummary } from './ui/feedback-panel.js';
import { initKeyboardHandler } from './ui/keyboard-handler.js';

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
 * Load all data files: scenarios, role matrix, ABAC rules, guardrails.
 */
async function loadData() {
  const [roles, abac, guardrailsData, day1, day2, day3] = await Promise.all([
    fetchJSON('src/data/roles.json'),
    fetchJSON('src/data/abac-rules.json'),
    fetchJSON('src/data/guardrails.json'),
    fetchJSON('src/data/scenarios/day1.json'),
    fetchJSON('src/data/scenarios/day2.json'),
    fetchJSON('src/data/scenarios/day3.json'),
  ]);

  roleMatrix = roles;
  abacOverlay = abac;
  guardrails = guardrailsData.guardrails || [];
  allScenarios = [...day1, ...day2, ...day3];
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
 * Update the header display with current day and score.
 * Shows cumulative score plus any in-progress day score.
 */
function updateHeader() {
  const dayEl = document.getElementById('header-day');
  const scoreEl = document.getElementById('header-score');
  if (dayEl) dayEl.textContent = `Day ${game.currentDay}`;
  if (scoreEl) {
    const dayScore = game._dayScoreEvents.reduce((sum, e) => sum + e.scoreDelta, 0);
    const totalDisplay = game.cumulativeScore + dayScore;
    scoreEl.textContent = `Score: ${totalDisplay}`;
  }
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

  // Check for missing-field warning before recording (Requirement 4.5)
  const warningText = checkMissingFieldWarning(ticket, decision);
  if (warningText && !confirmApproval(warningText)) {
    return; // Player cancelled after seeing warning
  }

  const { scoreEvent, warning } = game.submitDecision(decision, reasonCode);

  // Show stamp overlay on the request document
  showStampOverlay(decision);

  // Disable stamps, enable next
  setDecisionMade();

  // Show micro-feedback (Requirement 6.1)
  showTicketFeedback(scoreEvent, ticket, warning);

  // Update header to reflect new score
  updateHeader();

  // Persist state after each decision (Requirement 5.5, 10.1)
  saveGameState();
}

/**
 * Check if approving a request with missing fields should trigger a warning.
 * Returns warning text or null.
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
 * @returns {boolean} true if player confirms approval
 */
function confirmApproval(warningText) {
  return window.confirm(`⚠ ${warningText}\n\nDo you still want to APPROVE?`);
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
 * Handle day completion — show summary, persist state.
 */
function handleDayComplete() {
  const summary = game.completeDay();
  disableDecisionBar();
  hideFeedback();

  // Update header with new cumulative score
  updateHeader();

  // Persist completed day (Requirement 10.1)
  saveGameState();

  // Show end-of-day summary (Requirement 6.3)
  showDaySummary(summary, currentDayTickets, {
    onNextDay: () => startNextDay(),
  });
}

/**
 * Start the next day.
 */
function startNextDay() {
  const nextDay = game.currentDay + 1;
  const hasScenarios = allScenarios.some(s => s.day === nextDay);

  if (!hasScenarios) {
    showNoDaysMessage();
    return;
  }

  startDay(nextDay);
}

/**
 * Start a specific day.
 * @param {number} dayNumber
 */
function startDay(dayNumber) {
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
  // If there's a current day with remaining tickets, resume it
  if (savedState.currentDay > 0) {
    const hasTickets = allScenarios.some(s => s.day === savedState.currentDay);
    if (hasTickets) return savedState.currentDay;
  }

  // Otherwise find the first incomplete day
  const completedSet = new Set(savedState.completedDays || []);
  for (let d = 1; d <= 20; d++) {
    if (!completedSet.has(d) && allScenarios.some(s => s.day === d)) {
      return d;
    }
  }

  return 1;
}

/**
 * Reset the game to day 1 with a fresh state.
 */
function handleNewGame() {
  if (!game) return;
  if (!window.confirm('Start a new game? All progress will be lost.')) return;

  saveToLocalStorage(getInitialState());
  game.loadGameState(getInitialState());
  startDay(1);
  hideFeedback();
}

/**
 * Main initialization.
 */
async function init() {
  // Always initialize UI components first so buttons are wired up
  initRulebookTabs();
  initDecisionBar({
    onDecision: handleDecision,
    onNextTicket: handleNextTicket,
  });
  initKeyboardHandler();

  const newGameBtn = document.getElementById('btn-new-game');
  if (newGameBtn) newGameBtn.addEventListener('click', handleNewGame);

  // Disable decision bar until data is loaded
  disableDecisionBar();

  try {
    await loadData();
  } catch (err) {
    console.error('Failed to load game data:', err);
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

  // Create game controller
  game = new GameController(allScenarios, roleMatrix, abacOverlay, guardrails);
  console.log(`IAM Please loaded: ${allScenarios.length} scenarios across days`);

  // Load saved state from localStorage (Requirement 10.2)
  const savedState = loadFromLocalStorage();

  // Restore state if there's a saved game
  if (savedState.currentDay > 0 || savedState.completedDays.length > 0) {
    game.loadGameState(savedState);
  }

  // Determine which day to start/resume
  const startingDay = getStartingDay(savedState);
  startDay(startingDay);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
