/** pages/settings.js */
'use strict';

const PageSettings = (() => {
  async function load() {
    _renderAccount();
    _loadHealth();
    _refreshMe();
  }

  function _renderAccount() {
    const el = document.getElementById('account-body');
    if (!el) return;
    const admin = AppState.admin || {};
    const username = admin.username ? Fmt.esc(admin.username) : '—';
    const role = admin.role ? Fmt.esc(admin.role) : '—';
    el.innerHTML = `
      <div class="detail-row"><span class="detail-key">Username</span><span class="detail-val">${username}</span></div>
      <div class="detail-row"><span class="detail-key">Role</span><span class="detail-val">${role}</span></div>
      <div class="detail-row"><span class="detail-key">Session</span><span class="detail-val text-green">Authenticated (JWT)</span></div>
    `;
  }

  // Pull the authoritative admin profile so the panel stays accurate after reloads.
  async function _refreshMe() {
    const res = await API.getMe();
    const admin = res && res.data && res.data.admin;
    if (admin) {
      AppState.admin = admin;
      localStorage.setItem('adminUser', JSON.stringify(admin));
      _renderAccount();
    }
  }

  function logout() {
    App.logout(false);
  }

  async function _loadHealth() {
    const el = document.getElementById('health-body');
    if (!el) return;
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

  return { load, logout };
})();
