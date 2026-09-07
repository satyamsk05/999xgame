/**
 * app.js — Application state, navigation, sidebar, init
 */
'use strict';

/* ── Global state ───────────────────────────────────── */
const AppState = {
  secret:      '',
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
};

/* ── Sidebar toggle ─────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

/* ── Init ───────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // Load saved secret
  AppState.secret = localStorage.getItem('adminSecret') || '';

  // Set secret input if on page
  const si = document.getElementById('setting-secret');
  if (si) si.value = AppState.secret;

  // Responsive: show/hide menu toggle
  const checkViewport = () => {
    const mobile = window.innerWidth <= 960;
    document.getElementById('menu-toggle').style.display = mobile ? 'flex' : 'none';
  };
  checkViewport();
  window.addEventListener('resize', checkViewport);

  // Sidebar overlay click closes sidebar
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  });

  // Navigate to dashboard on load
  if (!AppState.secret) {
    App.navigate('settings');
  } else {
    App.navigate('dashboard');
  }
});
