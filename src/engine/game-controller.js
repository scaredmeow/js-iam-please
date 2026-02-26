/**
 * Game Controller — orchestrates game flow: day loading, ticket progression,
 * decision submission, day completion, and summary generation.
 *
 * Progressive difficulty:
 *   Act 1 (days 1-3):  RBAC only
 *   Act 2 (days 4-7):  + ABAC overlay
 *   Act 3 (days 8-11): + Guardrails
 *   Act 4 (days 12+):  All features (break-glass, advanced)
 */

import { evaluate } from './decision-engine.js';
import { computeScore } from './scoring.js';

/**
 * Determine which features are unlocked for a given day number.
 * @param {number} day
 * @returns {{ abac: boolean, guardrails: boolean, breakGlass: boolean }}
 */
export function getFeaturesForDay(day) {
  return {
    abac: day >= 4,
    guardrails: day >= 8,
    breakGlass: day >= 12,
  };
}

export class GameController {
  /**
   * @param {object[]} scenarios - All scenario objects (across all days)
   * @param {object} roleMatrix - Role matrix config
   * @param {object} abacOverlay - ABAC overlay config
   * @param {object[]} guardrails - Guardrails array
   */
  constructor(scenarios, roleMatrix, abacOverlay, guardrails) {
    this._allScenarios = scenarios;
    this._roleMatrix = roleMatrix;
    this._abacOverlay = abacOverlay;
    this._guardrails = guardrails;

    this._currentDay = 0;
    this._dayTickets = [];
    this._currentTicketIndex = 0;
    this._dayScoreEvents = [];
    this._cumulativeScore = 0;
    this._completedDays = [];
  }

  /**
   * Start a day by loading its tickets.
   * @param {number} dayNumber
   */
  startDay(dayNumber) {
    if (typeof dayNumber !== 'number' || dayNumber < 1) {
      throw new Error('Day number must be a positive integer');
    }

    this._currentDay = dayNumber;
    this._dayTickets = this._allScenarios.filter(s => s.day === dayNumber);
    this._currentTicketIndex = 0;
    this._dayScoreEvents = [];
  }

  /**
   * Get the current ticket (scenario) being reviewed.
   * @returns {object|null} The current scenario, or null if day is complete
   */
  getCurrentTicket() {
    if (this._currentTicketIndex >= this._dayTickets.length) {
      return null;
    }
    return this._dayTickets[this._currentTicketIndex];
  }

  /**
   * Submit a player decision for the current ticket.
   * Evaluates the decision, computes score, records the event, and advances.
   *
   * @param {string} decision - 'APPROVE' or 'DENY'
   * @param {string} reasonCode - The rationale code selected by the player
   * @returns {{ scoreEvent: object, warning: string|null }} The score event and optional warning
   */
  submitDecision(decision, reasonCode) {
    const ticket = this.getCurrentTicket();
    if (!ticket) {
      throw new Error('No current ticket to submit a decision for');
    }

    // Check for missing-field warning on approval (Requirement 4.5)
    let warning = null;
    if (decision === 'APPROVE') {
      warning = this._checkMissingFields(ticket);
    }

    const playerDecision = { decision, reasonCode };
    const scoreEvent = computeScore(playerDecision, ticket.expected, ticket);

    this._dayScoreEvents.push(scoreEvent);
    this._currentTicketIndex++;

    return { scoreEvent, warning };
  }

  /**
   * Check if a ticket has missing fields that should trigger a warning
   * when the player tries to approve.
   * @param {object} ticket
   * @returns {string|null}
   */
  _checkMissingFields(ticket) {
    const request = ticket.request || {};
    const warnings = [];

    if (!request.justification) {
      warnings.push('no justification provided');
    }
    if (!request.resources || request.resources.length === 0) {
      warnings.push('no resources specified');
    }

    // For elevated access (Admin/break-glass), require ticket ID
    const role = request.requester?.role;
    const actions = request.actions || [];
    const hasWildcard = actions.includes('*');
    if ((role === 'Admin' || hasWildcard) && !request.ticketId) {
      warnings.push('no ticket ID for elevated access');
    }

    return warnings.length > 0
      ? `Warning: ${warnings.join(', ')}. Consider implicit deny.`
      : null;
  }

  /**
   * Check if the current day is complete (all tickets processed).
   * @returns {boolean}
   */
  isDayComplete() {
    return this._currentTicketIndex >= this._dayTickets.length;
  }

  /**
   * Get the end-of-day summary.
   * @returns {{ day: number, totalScore: number, accuracy: number, scoreEvents: object[], ticketCount: number }}
   */
  getDaySummary() {
    const totalScore = this._dayScoreEvents.reduce((sum, e) => sum + e.scoreDelta, 0);
    const correctCount = this._dayScoreEvents.filter(e => e.isCorrect).length;
    const ticketCount = this._dayScoreEvents.length;
    const accuracy = ticketCount > 0 ? correctCount / ticketCount : 0;

    return {
      day: this._currentDay,
      totalScore,
      accuracy,
      scoreEvents: [...this._dayScoreEvents],
      ticketCount,
    };
  }

  /**
   * Mark the current day as completed and update cumulative score.
   */
  completeDay() {
    if (!this.isDayComplete()) {
      throw new Error('Cannot complete day: not all tickets have been processed');
    }

    const summary = this.getDaySummary();
    this._cumulativeScore += summary.totalScore;

    if (!this._completedDays.includes(this._currentDay)) {
      this._completedDays.push(this._currentDay);
    }

    return summary;
  }

  /**
   * Get the active features for the current day based on progressive difficulty.
   * @returns {{ abac: boolean, guardrails: boolean, breakGlass: boolean }}
   */
  getActiveFeatures() {
    return getFeaturesForDay(this._currentDay);
  }

  /**
   * Get the effective ABAC overlay for the current day (null if not unlocked).
   * @returns {object|null}
   */
  getEffectiveABAC() {
    const features = this.getActiveFeatures();
    return features.abac ? this._abacOverlay : null;
  }

  /**
   * Get the effective guardrails for the current day (empty if not unlocked).
   * @returns {object[]}
   */
  getEffectiveGuardrails() {
    const features = this.getActiveFeatures();
    return features.guardrails ? this._guardrails : [];
  }

  /**
   * Serialize the current game state for persistence.
   * @returns {object}
   */
  getGameState() {
    return {
      currentDay: this._currentDay,
      completedDays: [...this._completedDays],
      currentTicketIndex: this._currentTicketIndex,
      dayScoreEvents: [...this._dayScoreEvents],
      cumulativeScore: this._cumulativeScore,
      unlockedFeatures: getFeaturesForDay(this._currentDay),
    };
  }

  /**
   * Restore game state from a saved state object.
   * @param {object} state
   */
  loadGameState(state) {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid game state');
    }

    this._currentDay = state.currentDay || 0;
    this._completedDays = Array.isArray(state.completedDays) ? [...state.completedDays] : [];
    this._currentTicketIndex = state.currentTicketIndex || 0;
    this._dayScoreEvents = Array.isArray(state.dayScoreEvents) ? [...state.dayScoreEvents] : [];
    this._cumulativeScore = state.cumulativeScore || 0;

    // Reload tickets for the current day
    if (this._currentDay > 0) {
      this._dayTickets = this._allScenarios.filter(s => s.day === this._currentDay);
    }
  }

  /** @returns {number} */
  get currentDay() { return this._currentDay; }

  /** @returns {number[]} */
  get completedDays() { return [...this._completedDays]; }

  /** @returns {number} */
  get cumulativeScore() { return this._cumulativeScore; }
}
