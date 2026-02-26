/**
 * Feedback Panel — displays micro-feedback after each decision
 * and end-of-day summary with patterns and teaching points.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { openModal } from './modal.js';

/**
 * Show micro-feedback after a single ticket decision.
 * @param {object} scoreEvent - The score event from computeScore
 * @param {object} ticket - The scenario ticket
 * @param {string|null} warning - Optional missing-field warning
 */
export function showTicketFeedback(scoreEvent, ticket, warning) {
  const panel = document.getElementById('feedback-panel');
  const content = document.getElementById('feedback-content');
  if (!panel || !content) return;

  const expected = ticket.expected || {};
  let html = '';

  // Warning banner if present
  if (warning) {
    html += `<div class="warning-banner"><span class="warning-icon">⚠</span> ${esc(warning)}</div>`;
  }

  if (scoreEvent.isCorrect) {
    html += `<div class="feedback-correct">`;
    html += `<strong>Correct!</strong> `;
    if (scoreEvent.rationaleCorrect) {
      html += `Perfect reasoning. +${scoreEvent.scoreDelta} points.`;
    } else {
      html += `Right decision, but the expected rationale was: <em>${esc(expected.reasonCode)}</em>. +${scoreEvent.scoreDelta} points.`;
    }
    html += `</div>`;
  } else {
    html += `<div class="feedback-incorrect">`;
    html += `<strong>Incorrect.</strong> `;
    if (scoreEvent.isDangerous) {
      html += `Dangerous false approval! `;
    }
    html += `${scoreEvent.scoreDelta} points.`;
    html += `</div>`;

    // Hint: what would have been correct (Requirement 6.2)
    html += `<div class="feedback-hint">`;
    html += `<strong>Expected:</strong> ${esc(expected.decision)} — ${esc(expected.reasonCode)}`;
    html += `</div>`;
  }

  content.innerHTML = html;
  panel.hidden = false;

  // Wire explain button
  const explainBtn = document.getElementById('btn-explain');
  if (explainBtn) {
    explainBtn.onclick = () => showExplanation(ticket);
  }

  // Wire dismiss button
  const dismissBtn = document.getElementById('btn-dismiss-feedback');
  if (dismissBtn) {
    dismissBtn.onclick = () => { panel.hidden = true; };
  }
}

/**
 * Show the full expected reasoning for the current ticket (Requirement 6.4).
 * @param {object} ticket
 */
function showExplanation(ticket) {
  const content = document.getElementById('feedback-content');
  if (!content) return;

  const expected = ticket.expected || {};
  let html = content.innerHTML;
  html += `<div class="feedback-explanation">`;
  html += `<strong>Full Explanation:</strong><br>`;
  html += esc(expected.explanation || 'No explanation available.');
  html += `<br><br><strong>Teaching Point:</strong><br>`;
  html += esc(ticket.teachingPoint || '');
  html += `</div>`;
  content.innerHTML = html;

  // Disable explain button after showing
  const explainBtn = document.getElementById('btn-explain');
  if (explainBtn) explainBtn.disabled = true;
}

/**
 * Hide the feedback panel.
 */
export function hideFeedback() {
  const panel = document.getElementById('feedback-panel');
  if (panel) panel.hidden = true;
  const explainBtn = document.getElementById('btn-explain');
  if (explainBtn) explainBtn.disabled = false;
}

/**
 * Show the end-of-day summary in the summary modal (Requirement 6.3).
 * @param {object} summary - From GameController.getDaySummary()
 * @param {object[]} tickets - The day's scenario tickets
 * @param {{ onNextDay: () => void }} callbacks
 */
export function showDaySummary(summary, tickets, callbacks) {
  const modalEl = document.getElementById('summary-modal');
  const body = document.getElementById('summary-body');
  if (!modalEl || !body) return;

  const accuracy = Math.round(summary.accuracy * 100);

  let html = '';
  // Stats
  html += `<div class="summary-stat"><span class="summary-stat-label">Day</span><span class="summary-stat-value">${summary.day}</span></div>`;
  html += `<div class="summary-stat"><span class="summary-stat-label">Score</span><span class="summary-stat-value">${summary.totalScore}</span></div>`;
  html += `<div class="summary-stat"><span class="summary-stat-label">Accuracy</span><span class="summary-stat-value">${accuracy}%</span></div>`;
  html += `<div class="summary-stat"><span class="summary-stat-label">Tickets</span><span class="summary-stat-value">${summary.ticketCount}</span></div>`;

  // Per-ticket breakdown
  html += `<div class="summary-tickets">`;
  for (let i = 0; i < summary.scoreEvents.length; i++) {
    const evt = summary.scoreEvents[i];
    const ticket = tickets[i];
    const cls = evt.isCorrect ? 'correct' : 'incorrect';
    const label = evt.isCorrect ? '✓' : '✗';
    html += `<div class="summary-ticket-row ${cls}">`;
    html += `<span>${esc(ticket ? ticket.title : evt.scenarioId)}</span>`;
    html += `<span class="summary-ticket-result ${cls}">${label} ${evt.scoreDelta > 0 ? '+' : ''}${evt.scoreDelta}</span>`;
    html += `</div>`;

    // Teaching point for missed tickets (Requirement 6.3)
    if (!evt.isCorrect && ticket && ticket.teachingPoint) {
      html += `<div class="summary-teaching-point">${esc(ticket.teachingPoint)}</div>`;
    }
  }
  html += `</div>`;

  // Patterns analysis (Requirement 6.3)
  const patterns = analyzePatterns(summary.scoreEvents, tickets);
  if (patterns.length > 0) {
    html += `<div class="summary-patterns"><strong>Patterns:</strong><ul>`;
    for (const p of patterns) {
      html += `<li>${esc(p)}</li>`;
    }
    html += `</ul></div>`;
  }

  body.innerHTML = html;

  const nextDayBtn = document.getElementById('btn-next-day');
  if (nextDayBtn) {
    nextDayBtn.onclick = () => {
      modalEl.hidden = true;
      if (callbacks && callbacks.onNextDay) callbacks.onNextDay();
    };
  }

  openModal(modalEl);
}

/**
 * Analyze patterns in the player's mistakes for the debrief.
 * @param {object[]} scoreEvents
 * @param {object[]} tickets
 * @returns {string[]}
 */
function analyzePatterns(scoreEvents, tickets) {
  const patterns = [];
  let falseApprovals = 0;
  let falseDenials = 0;
  let prodMistakes = 0;

  for (let i = 0; i < scoreEvents.length; i++) {
    const evt = scoreEvents[i];
    if (evt.isCorrect) continue;

    const ticket = tickets[i];
    const expected = ticket?.expected?.decision;

    if (evt.decision === 'APPROVE' && expected === 'DENY') {
      falseApprovals++;
      if (ticket?.request?.environment === 'prod') prodMistakes++;
    }
    if (evt.decision === 'DENY' && expected === 'APPROVE') {
      falseDenials++;
    }
  }

  if (falseApprovals > 1) patterns.push(`You over-approved ${falseApprovals} requests that should have been denied`);
  if (falseDenials > 1) patterns.push(`You over-denied ${falseDenials} legitimate requests`);
  if (prodMistakes > 0) patterns.push(`You incorrectly approved ${prodMistakes} production access request(s)`);

  return patterns;
}

/** Escape HTML special characters. */
function esc(str) {
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
