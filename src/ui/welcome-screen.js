/**
 * Welcome Screen — initial screen shown when the game loads.
 * Provides game introduction, player name entry, game ID input, and navigation.
 */

const PLAYER_PROFILE_KEY = 'iam-please-player-profile';

/**
 * Validate a player name.
 * @param {string} name
 * @returns {boolean}
 */
export function validatePlayerName(name) {
  if (typeof name !== 'string') return false;
  return name.trim().length > 0;
}

/**
 * Generate a UUID v4.
 * @returns {string}
 */
function generatePlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Load the saved player profile from localStorage.
 * @returns {{ player_id: string, player_name: string } | null}
 */
export function loadPlayerProfile() {
  try {
    const json = localStorage.getItem(PLAYER_PROFILE_KEY);
    if (!json) return null;
    const profile = JSON.parse(json);
    if (profile && typeof profile.player_id === 'string' && typeof profile.player_name === 'string') {
      return profile;
    }
  } catch { /* corrupted */ }
  return null;
}

/**
 * Save a player profile to localStorage.
 * @param {string} playerId
 * @param {string} playerName
 */
export function savePlayerProfile(playerId, playerName) {
  try {
    localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify({
      player_id: playerId,
      player_name: playerName,
    }));
  } catch { /* unavailable */ }
}

/**
 * Show the welcome screen overlay.
 * @param {object} options
 * @param {string|null} options.savedName
 * @param {boolean} options.hasSavedGame
 * @param {string|null} options.savedGameId
 * @param {function} options.onStartGame - (name, id) => void
 * @param {function} options.onContinueGame - (name, id) => void
 * @param {function} options.onViewLeaderboard
 * @param {function} options.onLookupGameId - (gameId) => Promise<{found, entry}>
 */
export function showWelcomeScreen(options) {
  const { savedName, savedGameId, onStartGame, onContinueGame, onViewLeaderboard, onLookupGameId } = options;

  let overlay = document.getElementById('welcome-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'welcome-title');
    document.body.appendChild(overlay);
  }

  let html = `<div class="modal-content paper" style="max-width:440px;text-align:center;">`;
  html += `<h3 id="welcome-title" class="modal-title" style="text-align:center;">IAM Please</h3>`;
  html += `<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.5;">`;
  html += `Review IAM access requests. Approve or deny each ticket based on the rulebook. `;
  html += `Earn points for correct decisions and climb the leaderboard.`;
  html += `</p>`;

  // Name input
  html += `<div style="margin-bottom:0.75rem;text-align:left;">`;
  html += `<label for="welcome-name-input" style="font-size:0.8rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Inspector Name</label>`;
  html += `<input id="welcome-name-input" type="text" maxlength="30" placeholder="Enter your name…" `;
  html += `value="${esc(savedName || '')}" `;
  html += `style="width:100%;font-family:inherit;font-size:0.9rem;padding:0.5rem 0.6rem;border:2px solid var(--border-color);border-radius:3px;background:var(--paper-bg);" />`;
  html += `<div id="welcome-name-error" role="alert" style="color:var(--stamp-deny);font-size:0.8rem;margin-top:0.25rem;min-height:1.2em;"></div>`;
  html += `</div>`;

  // Buttons
  html += `<div style="display:flex;flex-direction:column;gap:0.5rem;">`;
  html += `<button id="btn-continue-game" class="stamp-btn approve" type="button" style="width:100%;justify-content:center;">Continue Game</button>`;
  html += `<button id="btn-start-game" class="control-btn" type="button" style="width:100%;">New Game</button>`;
  html += `<button id="btn-view-leaderboard" class="control-btn" type="button" style="width:100%;">View Leaderboard</button>`;
  html += `</div>`;
  html += `</div>`;

  overlay.innerHTML = html;
  overlay.hidden = false;

  const nameInput = document.getElementById('welcome-name-input');
  const nameError = document.getElementById('welcome-name-error');
  const continueBtn = document.getElementById('btn-continue-game');
  const startBtn = document.getElementById('btn-start-game');
  const lbBtn = document.getElementById('btn-view-leaderboard');

  // Clear errors on input
  if (nameInput) nameInput.addEventListener('input', () => { if (nameError) nameError.textContent = ''; });

  // New Game — always generates fresh ID
  if (startBtn) {
    startBtn.onclick = () => {
      const name = nameInput ? nameInput.value : '';
      if (!validatePlayerName(name)) {
        if (nameError) nameError.textContent = 'Please enter a name to continue.';
        if (nameInput) nameInput.focus();
        return;
      }
      const playerId = generatePlayerId();
      savePlayerProfile(playerId, name.trim());
      hideWelcomeScreen();
      if (onStartGame) onStartGame(name.trim(), playerId);
    };
  }

  // Continue Game — opens a modal to enter Game ID
  if (continueBtn) {
    continueBtn.onclick = () => {
      const name = nameInput ? nameInput.value : '';
      if (!validatePlayerName(name)) {
        if (nameError) nameError.textContent = 'Please enter a name first.';
        if (nameInput) nameInput.focus();
        return;
      }
      showContinueModal(name.trim(), savedGameId, onLookupGameId, (gameName, gameId) => {
        savePlayerProfile(gameId, gameName);
        hideWelcomeScreen();
        if (onContinueGame) onContinueGame(gameName, gameId);
      });
    };
  }

  if (lbBtn) {
    lbBtn.onclick = () => { if (onViewLeaderboard) onViewLeaderboard(); };
  }

  if (nameInput) nameInput.focus();
}

/**
 * Show a modal for entering a Game ID to continue a game.
 * @param {string} playerName
 * @param {string|null} savedGameId
 * @param {function} onLookupGameId - (gameId) => Promise<{found, entry}>
 * @param {function} onSuccess - (name, gameId) => void
 */
function showContinueModal(playerName, savedGameId, onLookupGameId, onSuccess) {
  let modal = document.getElementById('continue-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'continue-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'continue-modal-title');
    document.body.appendChild(modal);
  }

  let html = `<div class="modal-content paper" style="max-width:400px;text-align:center;">`;
  html += `<h3 id="continue-modal-title" class="modal-title" style="text-align:center;">Continue Game</h3>`;
  html += `<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.5;">`;
  html += `Enter your Game ID to resume where you left off.`;
  html += `</p>`;
  html += `<div style="margin-bottom:1rem;text-align:left;">`;
  html += `<label for="continue-gameid-input" style="font-size:0.8rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Game ID</label>`;
  html += `<input id="continue-gameid-input" type="text" maxlength="36" placeholder="Paste your Game ID…" `;
  html += `value="${esc(savedGameId || '')}" `;
  html += `style="width:100%;font-family:inherit;font-size:0.85rem;padding:0.5rem 0.6rem;border:2px solid var(--border-color);border-radius:3px;background:var(--paper-bg);letter-spacing:0.03em;" />`;
  html += `<div id="continue-gameid-error" role="alert" style="color:var(--stamp-deny);font-size:0.8rem;margin-top:0.25rem;min-height:1.2em;"></div>`;
  html += `</div>`;
  html += `<div style="display:flex;flex-direction:column;gap:0.5rem;">`;
  html += `<button id="btn-continue-submit" class="stamp-btn approve" type="button" style="width:100%;justify-content:center;">Continue</button>`;
  html += `<button id="btn-continue-cancel" class="control-btn" type="button" style="width:100%;">Cancel</button>`;
  html += `</div>`;
  html += `</div>`;

  modal.innerHTML = html;
  modal.hidden = false;

  const input = document.getElementById('continue-gameid-input');
  const error = document.getElementById('continue-gameid-error');
  const submitBtn = document.getElementById('btn-continue-submit');
  const cancelBtn = document.getElementById('btn-continue-cancel');

  if (input) {
    input.addEventListener('input', () => { if (error) error.textContent = ''; });
    input.focus();
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => { modal.hidden = true; };
  }

  if (submitBtn) {
    submitBtn.onclick = async () => {
      const gameId = input ? input.value.trim() : '';
      if (!gameId) {
        if (error) error.textContent = 'Please enter a Game ID.';
        if (input) input.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking…';

      try {
        if (onLookupGameId) {
          const result = await onLookupGameId(gameId);
          if (!result.found) {
            if (error) error.textContent = 'Game ID not found. Check your ID or play a new game.';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Continue';
            if (input) input.focus();
            return;
          }
        }
      } catch {
        if (error) error.textContent = 'Could not verify Game ID. Try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue';
        return;
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue';
      modal.hidden = true;
      onSuccess(playerName, gameId);
    };
  }
}

/**
 * Hide the welcome screen overlay.
 */
export function hideWelcomeScreen() {
  const overlay = document.getElementById('welcome-overlay');
  if (overlay) overlay.hidden = true;
}

/** Escape HTML special characters. */
function esc(str) {
  if (typeof str !== 'string') str = String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
