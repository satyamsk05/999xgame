/**
 * api.js — Centralized fetch wrapper and all API endpoint functions
 */
'use strict';

const API = (() => {
  /* ── Core fetch ─────────────────────────────────────── */
  async function req(path, opts = {}) {
    const token = AppState.token;
    const isPublic = path.startsWith('/health') || path.startsWith('/ready');
    if (!token && !isPublic) {
      App.showLogin();
      return null;
    }

    const options = {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    };

    try {
      const r = await fetch(path, options);
      const json = await r.json().catch(() => ({}));

      if (!r.ok) {
        if (r.status === 401) {
          App.logout(true);
          UI.toast(json.message || 'Session expired. Please sign in again.', 'error');
          return null;
        }
        UI.toast(json.message || `Server error (${r.status})`, 'error');
        UI.setConnected(false);
        return null;
      }

      UI.setConnected(true);
      return json;
    } catch {
      UI.setConnected(false);
      UI.toast('Cannot reach backend — check server.', 'error');
      return null;
    }
  }

  const get  = (path)        => req(path, { method: 'GET' });
  const post = (path, body)  => req(path, { method: 'POST',   body: JSON.stringify(body) });
  const patch= (path, body)  => req(path, { method: 'PATCH',  body: JSON.stringify(body) });
  const del  = (path)        => req(path, { method: 'DELETE' });

  /* ── Endpoints ──────────────────────────────────────── */

  // Stats
  const getDashboard  = () => get('/api/admin/stats/dashboard');
  const getAuditLogs  = (limit, offset, action) => {
    let url = `/api/admin/stats/audit-logs?limit=${limit}&offset=${offset}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    return get(url);
  };

  // Users
  const getUsers      = (limit, offset, search) => {
    let url = `/api/admin/users?limit=${limit}&offset=${offset}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return get(url);
  };
  const getUser       = (id)          => get(`/api/admin/users/${id}`);
  const adjustBalance = (id, body)    => post(`/api/admin/users/${id}/adjust-balance`, body);
  const blockUser     = (id, reason)  => post(`/api/admin/users/${id}/block`,   { reason });
  const unblockUser   = (id)          => post(`/api/admin/users/${id}/unblock`, {});
  const updateKyc     = (id, status)  => patch(`/api/admin/users/${id}/kyc`, { kycStatus: status });

  // Deposits
  const getPendingDeposits  = (limit) => get(`/api/admin/deposits/pending?limit=${limit}`);
  const confirmDeposit      = (id, note) => post(`/api/admin/deposits/${id}/confirm`, { adminNote: note });
  const rejectDeposit       = (id, note) => post(`/api/admin/deposits/${id}/reject`,  { adminNote: note });

  // Withdrawals
  const getPendingWithdrawals = (limit) => get(`/api/admin/withdrawals/pending?limit=${limit}`);
  const processWithdrawal   = (id, note) => post(`/api/admin/withdrawals/${id}/process`, { adminNote: note });
  const confirmWithdrawal   = (id, note) => post(`/api/admin/withdrawals/${id}/confirm`, { adminNote: note });
  const rejectWithdrawal    = (id, note) => post(`/api/admin/withdrawals/${id}/reject`,  { adminNote: note });

  // Games
  const getGames      = ()            => get('/api/admin/games');
  const toggleGame    = (id)          => post(`/api/admin/games/${id}/toggle`, {});
  const configGame    = (id, body)    => patch(`/api/admin/games/${id}/config`, body);
  const getRounds     = (gameId, lim) => get(`/api/admin/games/${gameId}/rounds?limit=${lim}`);
  const getGameBets   = (gameId, roundId, lim) => {
    let url = `/api/admin/games/${gameId}/bets?limit=${lim}`;
    if (roundId) url += `&roundId=${encodeURIComponent(roundId)}`;
    return get(url);
  };

  // Promotions
  const getPromos     = ()       => get('/api/admin/promotions');
  const createPromo   = (body)   => post('/api/admin/promotions', body);
  const editPromo     = (id, b)  => patch(`/api/admin/promotions/${id}`, b);
  const togglePromo   = (id)     => post(`/api/admin/promotions/${id}/toggle`, {});
  const deletePromo   = (id)     => del(`/api/admin/promotions/${id}`);

  // Reports
  const getReportSummary = (from, to) => {
    let url = '/api/admin/reports/summary';
    if (from || to) url += `?from=${from||''}&to=${to||''}`;
    return get(url);
  };
  const getReportDaily = (days) => get(`/api/admin/reports/daily?days=${days}`);

  // System
  const getHealth = () => fetch('/health').then(r => r.json()).catch(() => null);
  const getReady  = () => fetch('/ready').then(r => r.json()).catch(() => null);

  // Auth — login is public (no Bearer token yet)
  const login = async (username, password) => {
    try {
      const r = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, json };
    } catch {
      return { ok: false, status: 0, json: {} };
    }
  };
  const getMe     = () => get('/api/admin/auth/me');
  const logoutApi = () => post('/api/admin/auth/logout', {});

  return {
    login, getMe, logoutApi,
    getDashboard, getAuditLogs,
    getUsers, getUser, adjustBalance, blockUser, unblockUser, updateKyc,
    getPendingDeposits, confirmDeposit, rejectDeposit,
    getPendingWithdrawals, processWithdrawal, confirmWithdrawal, rejectWithdrawal,
    getGames, toggleGame, configGame, getRounds, getGameBets,
    getPromos, createPromo, editPromo, togglePromo, deletePromo,
    getReportSummary, getReportDaily,
    getHealth, getReady,
  };
})();
