/**
 * Decision Bar — APPROVE/DENY stamp buttons, rationale code picker,
 * and next ticket control.
 *
 * Flow: player clicks stamp → rationale modal opens → player picks rationale
 * → decision is recorded via the onDecision callback.
 */

import { openModal } from './modal.js';

/** Common rationale codes for APPROVE decisions */
const APPROVE_RATIONALES = [
  'role-allows-intern',
  'role-allows-developer',
  'role-allows-security-engineer',
  'role-allows-data-analyst',
  'role-allows-auditor',
  'role-allows-admin',
  'break-glass-approved',
];

/** Common rationale codes for DENY decisions */
const DENY_RATIONALES = [
  'implicit-deny',
  'wildcard-no-breakglass',
  'breakglass-required',
  'abac-environment-mismatch',
  'abac-team-mismatch',
  'abac-classification-mismatch',
  'guardrail-scp-deny',
  'guardrail-permission-boundary',
  'invalid-request',
  'empty-request',
];

/**
 * @typedef {object} DecisionBarCallbacks
 * @property {(decision: string, reasonCode: string) => void} onDecision
 * @property {() => void} onNextTicket
 */

let _callbacks = null;
let _modalHandle = null;
let _pendingDecision = null;
let _disabled = false;

/**
 * Initialize the decision bar event listeners.
 * @param {DecisionBarCallbacks} callbacks
 */
export function initDecisionBar(callbacks) {
  _callbacks = callbacks;

  document.getElementById('btn-approve').addEventListener('click', () => handleStamp('APPROVE'));
  document.getElementById('btn-deny').addEventListener('click', () => handleStamp('DENY'));
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-close-modal').addEventListener('click', closeRationaleModal);
}

/**
 * Handle a stamp button click — open the rationale picker modal.
 * @param {'APPROVE'|'DENY'} decision
 */
function handleStamp(decision) {
  if (_disabled || !_callbacks) return;
  _pendingDecision = decision;
  showRationaleModal(decision);
}

/**
 * Show the rationale picker modal with options for the given decision type.
 * @param {'APPROVE'|'DENY'} decision
 */
function showRationaleModal(decision) {
  const modalEl = document.getElementById('rationale-modal');
  const optionsEl = document.getElementById('rationale-options');
  const triggerBtn = decision === 'APPROVE'
    ? document.getElementById('btn-approve')
    : document.getElementById('btn-deny');

  const rationales = decision === 'APPROVE' ? APPROVE_RATIONALES : DENY_RATIONALES;

  optionsEl.innerHTML = '';
  for (const code of rationales) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rationale-btn';
    btn.textContent = code;
    btn.addEventListener('click', () => selectRationale(code));
    optionsEl.appendChild(btn);
  }

  _modalHandle = openModal(modalEl, triggerBtn);
}

/**
 * Handle rationale selection — close modal and fire the decision callback.
 * @param {string} reasonCode
 */
function selectRationale(reasonCode) {
  const decision = _pendingDecision;
  closeRationaleModal();
  if (decision && _callbacks && _callbacks.onDecision) {
    _callbacks.onDecision(decision, reasonCode);
  }
}

/** Close the rationale modal. */
function closeRationaleModal() {
  if (_modalHandle) {
    _modalHandle.close();
    _modalHandle = null;
  } else {
    const modalEl = document.getElementById('rationale-modal');
    if (modalEl) modalEl.hidden = true;
  }
  _pendingDecision = null;
}

/** Handle the Next Ticket button click. */
function handleNext() {
  if (_callbacks && _callbacks.onNextTicket) {
    _callbacks.onNextTicket();
  }
}

/**
 * Update the decision bar state after a decision has been made.
 * Disables stamps, enables next ticket button.
 */
export function setDecisionMade() {
  _disabled = true;
  document.getElementById('btn-approve').disabled = true;
  document.getElementById('btn-deny').disabled = true;
  document.getElementById('btn-next').disabled = false;
}

/**
 * Reset the decision bar for a new ticket.
 * Enables stamps, disables next ticket button.
 */
export function resetDecisionBar() {
  _disabled = false;
  document.getElementById('btn-approve').disabled = false;
  document.getElementById('btn-deny').disabled = false;
  document.getElementById('btn-next').disabled = true;
}

/**
 * Update the ticket progress display.
 * @param {number} current - Current ticket number (1-based)
 * @param {number} total - Total tickets in the day
 */
export function updateProgress(current, total) {
  const el = document.getElementById('progress-text');
  if (el) el.textContent = `Ticket ${current} / ${total}`;
}

/**
 * Fully disable the decision bar (e.g. when day is complete).
 */
export function disableDecisionBar() {
  _disabled = true;
  document.getElementById('btn-approve').disabled = true;
  document.getElementById('btn-deny').disabled = true;
  document.getElementById('btn-next').disabled = true;
}

/**
 * Expose closeRationaleModal for keyboard handler.
 */
export { closeRationaleModal };
