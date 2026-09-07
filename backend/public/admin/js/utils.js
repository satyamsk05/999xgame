/**
 * utils.js — Shared utilities: formatting, toast, modal, skeleton
 */
'use strict';

/* ── Formatting ─────────────────────────────────────── */
const Fmt = {
  money: (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  num:   (n) => Number(n || 0).toLocaleString('en-IN'),
  date:  (s) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  },
  dateOnly: (s) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  },
  timeAgo: (s) => {
    if (!s) return '—';
    const diff = Date.now() - new Date(s).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  },
  initials: (name) => (name || '?').slice(0, 2).toUpperCase(),
  esc: (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  paise: (p) => Fmt.money(parseInt(p || 0, 10) / 100),
};

/* ── Status badges (text only, no emojis) ───────────── */
const Badge = {
  status: (s) => {
    const map = {
      CONFIRMED: 'badge-green', COMPLETED: 'badge-green', SUCCESS: 'badge-green',
      LIVE: 'badge-green', ACTIVE: 'badge-green', VERIFIED: 'badge-green',
      WON: 'badge-green',

      PENDING: 'badge-yellow', PENDING_UTR: 'badge-yellow', UTR_SUBMITTED: 'badge-yellow',
      PROCESSING: 'badge-yellow', NOT_SUBMITTED: 'badge-gray',

      REJECTED: 'badge-red', DISABLED: 'badge-red', BLOCKED: 'badge-red',
      LOST: 'badge-red',

      COMING_SOON: 'badge-purple', INACTIVE: 'badge-gray',

      BETTING_OPEN: 'badge-green', BETTING_CLOSED: 'badge-yellow',
      SETTLED: 'badge-blue', CREATED: 'badge-gray',

      ACCEPTED: 'badge-blue', CREDIT: 'badge-green', DEBIT: 'badge-red',
    };
    const cls = map[s] || 'badge-gray';
    return `<span class="badge ${cls}">${Fmt.esc(s)}</span>`;
  },

  dot: (online) => online
    ? '<span class="dot dot-green"></span>'
    : '<span class="dot dot-red"></span>',
};

/* ── Skeleton helpers ───────────────────────────────── */
const Skel = {
  lines: (n = 3, widths = []) => Array.from({ length: n }, (_, i) => {
    const w = widths[i] || (60 + Math.floor(Math.random() * 30));
    return `<div class="skel-line skeleton mb-2" style="width:${w}%"></div>`;
  }).join(''),

  tableRows: (cols, rows = 4) => Array.from({ length: rows }, () =>
    `<tr>${Array.from({ length: cols }, () =>
      `<td><div class="skel-line skeleton" style="width:${50 + Math.floor(Math.random() * 40)}%"></div></td>`
    ).join('')}</tr>`
  ).join(''),

  card: (h = 80) => `<div class="skel-block skeleton" style="height:${h}px"></div>`,
};

/* ── UI helpers ─────────────────────────────────────── */
const UI = {
  /* Toast */
  toast(msg, type = 'success') {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
           style="color:${type === 'success' ? 'var(--green)' : 'var(--red)'}">
        ${type === 'success'
          ? '<polyline points="2 8 6 12 14 4"/>'
          : '<line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>'}
      </svg>
      <span>${Fmt.esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  },

  /* Modals */
  openModal(id)  { document.getElementById(id).classList.add('open'); },
  closeModal(id) { document.getElementById(id).classList.remove('open'); },
  closeAllModals() { document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open')); },

  /* Connection status */
  setConnected(ok) {
    const dot   = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (!dot) return;
    dot.className   = `status-dot ${ok ? 'online' : 'offline'}`;
    label.textContent = ok ? 'Online' : 'Offline';
  },

  /* Disable/enable button during async op */
  btnLoading(btn, loading, label) {
    btn.disabled    = loading;
    btn.textContent = loading ? 'Loading...' : label;
  },
};

/* ── Global keyboard handler ────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') UI.closeAllModals();
});
