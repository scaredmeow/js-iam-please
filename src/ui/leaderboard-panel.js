/**
 * Leaderboard Panel — displays global leaderboard and computes entries.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

/**
 * Sort leaderboard entries by cumulative_score descending and limit to max entries.
 * @param {object[]} entries - Raw leaderboard entries
 * @param {number} [limit=50] - Maximum entries to return
 * @returns {object[]} Sorted and limited entries
 */
export function sortAndLimitEntries(entries, limit = 50) {
  return [...entries]
    .sort((a, b) => b.cumulative_score - a.cumulative_score)
    .slice(0, limit);
}

/**
 * Compute a leaderboard entry from game state.
 * @param {string} playerId
 * @param {string} playerName
 * @param {object} gameState - { cumulativeScore, completedDays }
 * @param {object[]} allScoreEvents - All score events across completed days
 * @returns {object} LeaderboardEntry
 */
export function computeLeaderboardEntry(playerId, playerName, gameState, allScoreEvents) {
  const totalDecisions = allScoreEvents.length;
  const correctDecisions = allScoreEvents.filter(e => e.isCorrect).length;
  const accuracyPct = totalDecisions > 0
    ? Math.round((correctDecisions / totalDecisions) * 1000) / 10
    : 0;

  return {
    player_id: playerId,
    player_name: playerName,
    cumulative_score: gameState.cumulativeScore,
    days_completed: (gameState.completedDays || []).length,
    accuracy_pct: accuracyPct,
  };
}

/**
 * Render a single leaderboard entry row as an HTML string.
 * @param {object} entry - A leaderboard entry
 * @param {number} rank - 1-based rank
 * @param {boolean} isCurrentPlayer - Whether this is the current player
 * @returns {string} HTML string
 */
export function renderLeaderboardEntry(entry, rank, isCurrentPlayer) {
  const cls = isCurrentPlayer ? 'leaderboard-row current-player' : 'leaderboard-row';
  return `<tr class="${cls}">` +
    `<td class="lb-rank">${rank}</td>` +
    `<td class="lb-name">${esc(entry.player_name)}</td>` +
    `<td class="lb-score">${entry.cumulative_score}</td>` +
    `<td class="lb-days">${entry.days_completed}</td>` +
    `<td class="lb-accuracy">${entry.accuracy_pct}%</td>` +
    `</tr>`;
}


/**
 * Show the leaderboard panel.
 * @param {object[]} entries - Sorted leaderboard entries
 * @param {string|null} currentPlayerName - Name to highlight
 * @param {function} onClose - Callback to close leaderboard
 */
export function showLeaderboard(entries, currentPlayerName, onClose) {
  let overlay = document.getElementById('leaderboard-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'leaderboard-overlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'leaderboard-title');
    document.body.appendChild(overlay);
  }

  const sorted = sortAndLimitEntries(entries);

  let html = `<div class="modal-content paper" style="max-width:560px;">`;
  html += `<h3 id="leaderboard-title" class="modal-title">Global Leaderboard</h3>`;

  if (sorted.length === 0) {
    html += `<p class="placeholder">No scores yet — be the first!</p>`;
  } else {
    html += `<table class="leaderboard-table" style="width:100%;border-collapse:collapse;font-size:0.85rem;">`;
    html += `<thead><tr>`;
    html += `<th style="text-align:left;padding:0.3rem 0.5rem;">Rank</th>`;
    html += `<th style="text-align:left;padding:0.3rem 0.5rem;">Player</th>`;
    html += `<th style="text-align:right;padding:0.3rem 0.5rem;">Score</th>`;
    html += `<th style="text-align:right;padding:0.3rem 0.5rem;">Days</th>`;
    html += `<th style="text-align:right;padding:0.3rem 0.5rem;">Accuracy</th>`;
    html += `</tr></thead><tbody>`;

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const isCurrentPlayer = currentPlayerName != null &&
        entry.player_name === currentPlayerName;
      html += renderLeaderboardEntry(entry, i + 1, isCurrentPlayer);
    }

    html += `</tbody></table>`;
  }

  html += `<button id="btn-close-leaderboard" class="control-btn modal-close" type="button" aria-label="Close leaderboard">Close</button>`;
  html += `</div>`;

  overlay.innerHTML = html;
  overlay.hidden = false;
  overlay.style.zIndex = '110';

  const closeBtn = document.getElementById('btn-close-leaderboard');
  if (closeBtn) {
    closeBtn.onclick = () => {
      hideLeaderboard();
      if (onClose) onClose();
    };
  }
}

/**
 * Show a "temporarily unavailable" message in the leaderboard panel.
 * @param {function} onClose - Callback to close
 */
export function showLeaderboardUnavailable(onClose) {
  let overlay = document.getElementById('leaderboard-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'leaderboard-overlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `<div class="modal-content paper" style="max-width:400px;">` +
    `<h3 class="modal-title">Leaderboard</h3>` +
    `<p class="placeholder">Leaderboard is temporarily unavailable. Please try again later.</p>` +
    `<button id="btn-close-leaderboard" class="control-btn modal-close" type="button">Close</button>` +
    `</div>`;
  overlay.hidden = false;
  overlay.style.zIndex = '110';

  const closeBtn = document.getElementById('btn-close-leaderboard');
  if (closeBtn) {
    closeBtn.onclick = () => {
      hideLeaderboard();
      if (onClose) onClose();
    };
  }
}

/**
 * Show a loading state in the leaderboard panel.
 */
export function showLeaderboardLoading() {
  let overlay = document.getElementById('leaderboard-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'leaderboard-overlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `<div class="modal-content paper" style="max-width:400px;text-align:center;">` +
    `<h3 class="modal-title">Leaderboard</h3>` +
    `<p style="padding:1.5rem 0;font-size:0.9rem;color:var(--text-secondary);">Loading…</p>` +
    `</div>`;
  overlay.hidden = false;
  overlay.style.zIndex = '110';
}

/**
 * Hide the leaderboard panel.
 */
export function hideLeaderboard() {
  const overlay = document.getElementById('leaderboard-overlay');
  if (overlay) overlay.hidden = true;
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
