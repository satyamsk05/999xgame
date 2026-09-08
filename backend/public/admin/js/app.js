/**
 * app.js — Application state, navigation, sidebar, init
 */
'use strict';

/* ── Global state ───────────────────────────────────── */
const AppState = {
  token:       '',
  admin:       null,
  currentPage: 'dashboard',
  refreshTimer: null,
};

/* ── Page registry ──────────────────────────────────── */
const Pages = {
  dashboard:   { title: 'Dashboard',    load: () => PageDashboard.load() },
  users:       { title: 'Users',        load: () => PageUsers.load() },
  deposits:    { title: 'Deposits',     load: () => PageDeposits.load() },
  withdrawals: { title: 'Withdrawals',  load: () => PageWithdrawals.load() },
  games:       { title: 'Games',        load: () => PageGames.load() },
  promotions:  { title: 'Promotions',   load: () => PagePromotions.load() },
  ledger:      { title: 'Ledger',       load: () => PageLedger.load() },
  reports:     { title: 'Reports',      load: () => PageReports.load() },
  notifications:{ title: 'Notifications', load: () => PageNotifications.load() },
  security:    { title: 'Security',     load: () => PageSecurity.load() },
  settings:    { title: 'Settings',     load: () => PageSettings.load() },
};

/* ── App controller ─────────────────────────────────── */
const App = {
  navigate(page) {
    if (!Pages[page]) return;

    // Stop auto-refresh from previous page
    clearInterval(AppState.refreshTimer);
    AppState.refreshTimer = null;

    // Switch active page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');

    document.getElementById('page-title').textContent = Pages[page].title;
    AppState.currentPage = page;

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');

    // Load page
    Pages[page].load();
  },

  refresh() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('loading');
    setTimeout(() => btn.classList.remove('loading'), 800);
    Pages[AppState.currentPage]?.load();
  },

  setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : count;
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
    }
  },

  /* ── Auth gate ────────────────────────────────────── */
  showLogin() {
    clearInterval(AppState.refreshTimer);
    AppState.refreshTimer = null;
    const shell = document.getElementById('shell');
    if (shell) shell.style.display = 'none';
    const ls = document.getElementById('login-screen');
    if (ls) ls.classList.add('open');
    const u = document.getElementById('login-username');
    if (u) setTimeout(() => u.focus(), 50);
  },

  showApp() {
    const ls = document.getElementById('login-screen');
    if (ls) ls.classList.remove('open');
    const shell = document.getElementById('shell');
    if (shell) shell.style.display = '';
    App.navigate('dashboard');
  },

  async submitLogin() {
    const uEl = document.getElementById('login-username');
    const pEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit');
    const username = (uEl?.value || '').trim();
    const password = pEl?.value || '';
    if (!username || !password) {
      if (errEl) errEl.textContent = 'Username and password are required.';
      return;
    }
    if (errEl) errEl.textContent = '';
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    const res = await API.login(username, password);

    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }

    const token = res.ok ? (res.json.token || res.json.data?.token) : null;
    if (token) {
      AppState.token = token;
      AppState.admin = res.json.data?.admin || null;
      localStorage.setItem('adminToken', token);
      if (AppState.admin) localStorage.setItem('adminUser', JSON.stringify(AppState.admin));
      if (pEl) pEl.value = '';
      UI.setConnected(true);
      App.showApp();
    } else {
      let msg = (res.json && res.json.message) || '';
      if (!msg) {
        msg = res.status === 503
          ? 'Backend unavailable. Please try again later.'
          : (res.status === 0 ? 'Cannot reach backend.' : 'Invalid credentials.');
      }
      if (errEl) errEl.textContent = msg;
    }
  },

  logout(silent) {
    AppState.token = '';
    AppState.admin = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    if (!silent) { try { API.logoutApi(); } catch (_) {} }
    App.showLogin();
  },
};

/* ── Sidebar toggle ─────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

/* ── Init ───────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // Restore session
  AppState.token = localStorage.getItem('adminToken') || '';
  try { AppState.admin = JSON.parse(localStorage.getItem('adminUser') || 'null'); } catch (_) { AppState.admin = null; }

  // Responsive: show/hide menu toggle
  const checkViewport = () => {
    const mobile = window.innerWidth <= 960;
    const mt = document.getElementById('menu-toggle');
    if (mt) mt.style.display = mobile ? 'flex' : 'none';
  };
  checkViewport();
  window.addEventListener('resize', checkViewport);

  // Sidebar overlay click closes sidebar
  const ov = document.getElementById('sidebar-overlay');
  if (ov) ov.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    ov.classList.remove('open');
  });

  // Enter key submits the login form
  document.addEventListener('keydown', (e) => {
    const ls = document.getElementById('login-screen');
    if (ls && ls.classList.contains('open') && e.key === 'Enter') {
      const a = document.activeElement;
      if (a && (a.id === 'login-username' || a.id === 'login-password')) {
        e.preventDefault();
        App.submitLogin();
      }
    }
  });

  // Auth gate
  if (!AppState.token) {
    App.showLogin();
  } else {
    App.showApp();
  }
});
