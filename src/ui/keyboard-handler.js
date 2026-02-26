/**
 * Keyboard Handler — global keyboard shortcuts and focus management.
 *
 * Shortcuts:
 *   A — Approve stamp
 *   D — Deny stamp
 *   Escape — Close any open modal
 *
 * Tab/Shift+Tab cycles through all interactive elements naturally
 * via native HTML button elements. Focus trapping for modals is
 * handled by the modal module.
 *
 * Requirements: 9.1, 9.3, 9.4
 */

/**
 * Initialize the global keyboard handler.
 * Shortcuts only fire when no modal is open and no input is focused.
 */
export function initKeyboardHandler() {
  document.addEventListener('keydown', handleGlobalKeydown);
}

/**
 * @param {KeyboardEvent} e
 */
function handleGlobalKeydown(e) {
  // Don't intercept when typing in an input/textarea
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Escape: close any open modal
  if (e.key === 'Escape') {
    const rationaleModal = document.getElementById('rationale-modal');
    if (rationaleModal && !rationaleModal.hidden) {
      // Modal's own keydown handler (from modal.js focus trap) handles this,
      // but as a fallback we also handle it here
      return;
    }
    const feedbackPanel = document.getElementById('feedback-panel');
    if (feedbackPanel && !feedbackPanel.hidden) {
      feedbackPanel.hidden = true;
      return;
    }
    return;
  }

  // Don't fire shortcuts when a modal is open
  if (isModalOpen()) return;

  // A — Approve
  if (e.key === 'a' || e.key === 'A') {
    const btn = document.getElementById('btn-approve');
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
    return;
  }

  // D — Deny
  if (e.key === 'd' || e.key === 'D') {
    const btn = document.getElementById('btn-deny');
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
    return;
  }
}

/**
 * Check if any modal overlay is currently visible.
 * @returns {boolean}
 */
function isModalOpen() {
  const modals = document.querySelectorAll('.modal-overlay');
  for (const m of modals) {
    if (!m.hidden) return true;
  }
  return false;
}

/**
 * Clean up the keyboard handler (for testing or teardown).
 */
export function destroyKeyboardHandler() {
  document.removeEventListener('keydown', handleGlobalKeydown);
}
