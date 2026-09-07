/** pages/settings.js */
'use strict';

const PageSettings = (() => {
  async function load() {
    // Set saved secret value
    const el = document.getElementById('setting-secret');
    if (el) el.value = AppState.secret;

    // Load health
    _loadHealth();
  }

  async function saveSecret() {
    const val = document.getElementById('setting-secret').value.trim();
    if (!val) { UI.toast('Enter a secret first', 'error'); return; }

    AppState.secret = val;
    localStorage.setItem('adminSecret', val);

    const result = document.getElementById('secret-result');
    result.textContent = 'Testing connection...';
    result.style.color = 'var(--text-3)';

    const res = await API.getDashboard();
    if (res) {
      result.textContent = 'Connection successful. Secret saved.';
      result.style.color = 'var(--green)';
      UI.toast('Admin secret saved and verified.', 'success');
      setTimeout(() => App.navigate('dashboard'), 600);
    } else {
      result.textContent = 'Connection failed. Check your secret.';
      result.style.color = 'var(--red)';
    }
  }

  function clearSecret() {
    AppState.secret = '';
    localStorage.removeItem('adminSecret');
    document.getElementById('setting-secret').value = '';
    document.getElementById('secret-result').textContent = 'Secret cleared.';
    document.getElementById('secret-result').style.color = 'var(--text-3)';
    UI.toast('Secret cleared.', 'error');
  }

  async function _loadHealth() {
    const el = document.getElementById('health-body');
    el.innerHTML = Skel.lines(4);

    const h = await API.getHealth();
    if (!h) {
      el.innerHTML = `<div class="text-sm text-dim">Health check failed — backend unreachable.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="detail-row"><span class="detail-key">Status</span>${Badge.status(h.status?.toUpperCase() || 'OK')}</div>
      <div class="detail-row"><span class="detail-key">Service</span><span class="detail-val">${Fmt.esc(h.service || '—')}</span></div>
      <div class="detail-row"><span class="detail-key">Uptime</span><span class="detail-val">${h.uptime ? Math.floor(h.uptime / 60) + 'm ' + Math.floor(h.uptime % 60) + 's' : '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Timestamp</span><span class="detail-val text-sm">${Fmt.date(h.timestamp)}</span></div>
    `;
  }

  return { load, saveSecret, clearSecret };
})();
