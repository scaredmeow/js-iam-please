/**
 * Modal — accessible modal dialog with focus trap and Escape to close.
 *
 * Works with any element that has the class `modal-overlay` and
 * contains focusable elements inside `.modal-content`.
 */

/**
 * Open a modal by removing the hidden attribute and trapping focus.
 * @param {HTMLElement} modalEl - The modal overlay element
 * @param {HTMLElement} [triggerEl] - The element that triggered the modal (focus returns here on close)
 * @returns {{ close: () => void }} A handle to close the modal
 */
export function openModal(modalEl, triggerEl) {
  modalEl.hidden = false;

  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusableEls = modalEl.querySelectorAll(focusableSelector);
  const firstFocusable = focusableEls[0];
  const lastFocusable = focusableEls[focusableEls.length - 1];

  if (firstFocusable) firstFocusable.focus();

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      if (focusableEls.length === 0) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  }

  modalEl.addEventListener('keydown', handleKeydown);

  function close() {
    modalEl.hidden = true;
    modalEl.removeEventListener('keydown', handleKeydown);
    if (triggerEl && typeof triggerEl.focus === 'function') {
      triggerEl.focus();
    }
  }

  return { close };
}
