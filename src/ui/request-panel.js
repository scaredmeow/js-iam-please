/**
 * Request Panel — renders the current ticket's access request document
 * into the left panel of the game UI.
 *
 * Displays: requester name, role, team, environment, actions, resources,
 * justification, ticket ID, and time window.
 */

/**
 * Render a scenario ticket into the request panel.
 * @param {object|null} ticket - The current scenario object, or null to clear
 */
export function renderRequestPanel(ticket) {
  const els = {
    requester: document.getElementById('req-requester'),
    role: document.getElementById('req-role'),
    team: document.getElementById('req-team'),
    environment: document.getElementById('req-environment'),
    actions: document.getElementById('req-actions'),
    resources: document.getElementById('req-resources'),
    justification: document.getElementById('req-justification'),
    ticketId: document.getElementById('req-ticket-id'),
    timeWindow: document.getElementById('req-time-window'),
  };

  // Clear stamp overlay
  const stampOverlay = document.getElementById('stamp-overlay');
  if (stampOverlay) {
    stampOverlay.textContent = '';
    stampOverlay.className = 'stamp-overlay';
  }

  if (!ticket) {
    for (const el of Object.values(els)) {
      if (el) el.textContent = '—';
    }
    return;
  }

  const req = ticket.request || {};
  const requester = req.requester || {};
  const constraints = req.constraints || {};

  els.requester.textContent = requester.name || '—';
  els.role.textContent = requester.role || '—';
  els.team.textContent = requester.team || '—';
  els.environment.textContent = req.environment || '—';
  els.actions.textContent = Array.isArray(req.actions) ? req.actions.join(', ') : '—';
  els.resources.textContent = Array.isArray(req.resources) ? req.resources.join(', ') : '—';
  els.justification.textContent = req.justification || '—';
  els.ticketId.textContent = req.ticketId || '—';

  if (req.timeWindowMinutes) {
    els.timeWindow.textContent = `${req.timeWindowMinutes} minutes`;
  } else if (req.timeWindow) {
    els.timeWindow.textContent = req.timeWindow;
  } else {
    els.timeWindow.textContent = '—';
  }
}

/**
 * Show a stamp overlay on the request panel after a decision.
 * @param {'APPROVE'|'DENY'} decision
 */
export function showStampOverlay(decision) {
  const stampOverlay = document.getElementById('stamp-overlay');
  if (!stampOverlay) return;

  if (decision === 'APPROVE') {
    stampOverlay.textContent = 'APPROVED';
    stampOverlay.className = 'stamp-overlay approved';
  } else {
    stampOverlay.textContent = 'DENIED';
    stampOverlay.className = 'stamp-overlay denied';
  }
}
