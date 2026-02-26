/**
 * Rulebook Panel — renders the current Role_Matrix, active ABAC rules,
 * and active Guardrails into the right panel with tabbed navigation.
 */

/**
 * Initialize the rulebook tab switching behavior.
 */
export function initRulebookTabs() {
  const tabBtns = document.querySelectorAll('.rulebook-tabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.id));
  });
}

/**
 * Switch the active rulebook tab.
 * @param {string} tabBtnId - The id of the tab button to activate
 */
function switchTab(tabBtnId) {
  const tabBtns = document.querySelectorAll('.rulebook-tabs .tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    const isActive = btn.id === tabBtnId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  tabPanels.forEach(panel => {
    const controlledBy = document.querySelector(`[aria-controls="${panel.id}"]`);
    const isActive = controlledBy && controlledBy.id === tabBtnId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}


/**
 * Render the Role Matrix tab content.
 * @param {object} roleMatrix - The role matrix config object
 */
export function renderRolesTab(roleMatrix) {
  const panel = document.getElementById('tab-roles');
  if (!panel) return;

  if (!roleMatrix || !roleMatrix.roles) {
    panel.innerHTML = '<p class="placeholder">No role matrix loaded.</p>';
    return;
  }

  let html = '';
  for (const [roleName, roleDef] of Object.entries(roleMatrix.roles)) {
    html += `<div class="rulebook-role">`;
    html += `<div class="rulebook-role-name">${esc(roleName)}</div>`;
    html += '<ul class="rulebook-perm-list">';
    for (const perm of roleDef.permissions) {
      const actions = perm.actions.join(', ');
      const envs = perm.environments.join(', ');
      const extras = [];
      if (perm.maxClassification) extras.push(`max: ${perm.maxClassification}`);
      if (perm.teamScoped) extras.push('team-scoped');
      if (perm.requiresBreakGlass) extras.push('break-glass');
      const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
      html += `<li><span class="perm-actions">${esc(actions)}</span>`;
      html += ` on <span class="perm-resource">${esc(perm.resourceType)}</span>`;
      html += ` [${esc(envs)}]${esc(suffix)}</li>`;
    }
    html += '</ul></div>';
  }

  panel.innerHTML = html;
}

/**
 * Render the ABAC rules tab content.
 * @param {object|null} abacConfig - The ABAC overlay config, or null if not unlocked
 */
export function renderABACTab(abacConfig) {
  const panel = document.getElementById('tab-abac');
  if (!panel) return;

  if (!abacConfig || !abacConfig.active) {
    panel.innerHTML = '<p class="placeholder">ABAC rules not yet active. Unlocked in Act 2 (Day 4+).</p>';
    return;
  }

  let html = '<ul class="rulebook-rule-list">';
  for (const rule of abacConfig.rules) {
    html += `<li>`;
    html += `<span class="rule-dimension">[${esc(rule.dimension)}]</span> `;
    html += `${esc(rule.description)}`;
    html += `</li>`;
  }
  html += '</ul>';

  panel.innerHTML = html;
}

/**
 * Render the Guardrails tab content.
 * @param {object[]} guardrails - Array of guardrail config entries, or empty if not unlocked
 */
export function renderGuardrailsTab(guardrails) {
  const panel = document.getElementById('tab-guardrails');
  if (!panel) return;

  if (!guardrails || guardrails.length === 0) {
    panel.innerHTML = '<p class="placeholder">Guardrails not yet active. Unlocked in Act 3 (Day 8+).</p>';
    return;
  }

  let html = '<ul class="rulebook-rule-list">';
  for (const gr of guardrails) {
    html += `<li>`;
    html += `<span class="rule-type">[${esc(gr.type.toUpperCase())}]</span> `;
    html += `${esc(gr.description)}`;
    html += `</li>`;
  }
  html += '</ul>';

  panel.innerHTML = html;
}

/**
 * Render all rulebook tabs based on current game state.
 * @param {object} roleMatrix
 * @param {object|null} abacConfig
 * @param {object[]} guardrails
 */
export function renderRulebookPanel(roleMatrix, abacConfig, guardrails) {
  renderRolesTab(roleMatrix);
  renderABACTab(abacConfig);
  renderGuardrailsTab(guardrails);
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
