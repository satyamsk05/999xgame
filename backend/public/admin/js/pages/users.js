/** pages/users.js */
'use strict';

const PageUsers = (() => {
  const S = { offset: 0, limit: 50, total: 0, search: '', searchTimer: null, activeUserId: null };

  async function load() {
    S.offset = 0;
    _loadList();
  }

  async function _loadList() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = Skel.tableRows(6, 5);

    const res = await API.getUsers(S.limit, S.offset, S.search);
    if (!res?.data) return;

    S.total = res.meta?.total || 0;
    document.getElementById('users-meta').textContent =
      `${Fmt.num(S.total)} users`;

    _updatePagination();

    if (!res.data.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">No users found</div></td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:30px;height:30px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-2);flex-shrink:0">
              ${Fmt.initials(u.username)}
            </div>
            <div>
              <div class="font-semi text-sm">${Fmt.esc(u.username)}</div>
              <div class="text-xs text-dim mono">${Fmt.esc(u.id)}</div>
            </div>
          </div>
        </td>
        <td class="mono text-sm">${Fmt.esc(u.phone)}</td>
        <td><span class="amount-pos">₹${Fmt.money(u.wallet.availableBalance)}</span></td>
        <td><span class="amount" style="color:var(--orange)">₹${Fmt.money(u.wallet.reservedBalance)}</span></td>
        <td>${Badge.status(u.isBlocked ? 'BLOCKED' : 'ACTIVE')}</td>
        <td class="text-xs text-dim">${Fmt.date(u.createdAt)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="PageUsers.openDetail('${u.id}')">View</button>
            <button class="btn btn-ghost btn-sm" onclick="PageUsers.openAdjust('${u.id}','${Fmt.esc(u.username)}')">Adjust</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function onSearch(val) {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => {
      S.search = val.trim();
      S.offset = 0;
      _loadList();
    }, 400);
  }

  function page(dir) {
    S.offset = Math.max(0, S.offset + dir * S.limit);
    _loadList();
  }

  function _updatePagination() {
    const cur   = Math.floor(S.offset / S.limit) + 1;
    const total = Math.ceil(S.total / S.limit) || 1;
    document.getElementById('users-page-info').textContent = `Page ${cur} / ${total}`;
    document.getElementById('users-prev').disabled = S.offset === 0;
    document.getElementById('users-next').disabled = S.offset + S.limit >= S.total;
  }

  /* ── User detail modal ─────────────────────────────── */
  async function openDetail(userId) {
    S.activeUserId = userId;
    UI.openModal('modal-user');
    document.getElementById('user-modal-body').innerHTML = Skel.lines(4);

    const res = await API.getUser(userId);
    if (!res?.data) { UI.closeModal('modal-user'); return; }

    const { user, wallet, recentTransactions, recentBets } = res.data;

    document.getElementById('user-modal-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:var(--text-2)">
          ${Fmt.initials(user.username)}
        </div>
        <div style="flex:1">
          <div class="font-semi text-lg">${Fmt.esc(user.username)}</div>
          <div class="text-sm text-dim">${Fmt.esc(user.phone)} &middot; ${Badge.status(user.isBlocked ? 'BLOCKED' : 'ACTIVE')}</div>
        </div>
      </div>

      <div class="grid-3 mb-6">
        <div class="stat-card" style="padding:14px">
          <div class="stat-label">Available</div>
          <div style="font-size:18px;font-weight:700;color:var(--green)">₹${Fmt.money(wallet.availableBalance)}</div>
        </div>
        <div class="stat-card" style="padding:14px">
          <div class="stat-label">Reserved</div>
          <div style="font-size:18px;font-weight:700;color:var(--orange)">₹${Fmt.money(wallet.reservedBalance)}</div>
        </div>
        <div class="stat-card" style="padding:14px">
          <div class="stat-label">Total</div>
          <div style="font-size:18px;font-weight:700">₹${Fmt.money(wallet.totalBalance)}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="flex items-center justify-between mb-4" style="margin-top:14px">
        <div class="font-semi">User Details</div>
        <div style="display:flex;gap:6px">
          <select class="select" style="width:auto;padding:5px 8px;font-size:12px" onchange="PageUsers.updateKyc('${user.id}',this.value)">
            ${['NOT_SUBMITTED','PENDING','VERIFIED','REJECTED'].map(s =>
              `<option value="${s}" ${user.kycStatus === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          ${user.isBlocked
            ? `<button class="btn btn-success btn-sm" onclick="PageUsers.unblock('${user.id}')">Unblock</button>`
            : `<button class="btn btn-danger btn-sm" onclick="PageUsers.openBlock('${user.id}')">Block</button>`}
        </div>
      </div>

      <div class="card card-p2 mb-4">
        <div class="detail-row"><span class="detail-key">User ID</span><span class="detail-val mono text-xs">${Fmt.esc(user.id)}</span></div>
        <div class="detail-row"><span class="detail-key">KYC Status</span>${Badge.status(user.kycStatus || 'NOT_SUBMITTED')}</div>
        <div class="detail-row"><span class="detail-key">Joined</span><span class="detail-val">${Fmt.date(user.createdAt)}</span></div>
        ${user.isBlocked ? `<div class="detail-row"><span class="detail-key">Blocked reason</span><span class="detail-val text-dim">${Fmt.esc(user.blockedReason)}</span></div>` : ''}
      </div>

      <div class="font-semi mb-4">Recent Transactions</div>
      <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius)">
        <table>
          <thead><tr><th>Type</th><th>Dir</th><th>Amount</th><th>When</th></tr></thead>
          <tbody>
            ${recentTransactions.slice(0, 15).map(t => `
              <tr>
                <td class="mono text-xs">${Fmt.esc(t.type)}</td>
                <td>${Badge.status(t.direction)}</td>
                <td class="${t.direction === 'CREDIT' ? 'amount-pos' : 'amount-neg'}">
                  ${t.direction === 'CREDIT' ? '+' : '-'}₹${Fmt.money(t.amount)}
                </td>
                <td class="text-xs text-dim">${Fmt.timeAgo(t.createdAt)}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="empty text-sm">No transactions</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="UI.closeModal('modal-user')">Close</button>
        <button class="btn btn-primary" onclick="UI.closeModal('modal-user');PageUsers.openAdjust('${user.id}','${Fmt.esc(user.username)}')">Adjust Balance</button>
      </div>
    `;
  }

  /* ── Balance adjustment ─────────────────────────────── */
  const _adj = { userId: null, username: null };

  function openAdjust(userId, username) {
    _adj.userId   = userId;
    _adj.username = username;
    document.getElementById('adj-user').textContent = username;
    document.getElementById('adj-amount').value    = '';
    document.getElementById('adj-direction').value = 'CREDIT';
    document.getElementById('adj-reason').value    = '';
    UI.openModal('modal-adjust');
  }

  async function submitAdjust() {
    const amount    = parseFloat(document.getElementById('adj-amount').value);
    const direction = document.getElementById('adj-direction').value;
    const reason    = document.getElementById('adj-reason').value.trim();
    const btn       = document.getElementById('adj-submit');

    if (!amount || amount <= 0) { UI.toast('Enter a valid amount', 'error'); return; }
    if (reason.length < 5)      { UI.toast('Reason must be at least 5 characters', 'error'); return; }

    UI.btnLoading(btn, true, 'Apply');
    const res = await API.adjustBalance(_adj.userId, { amount, direction, reason });
    UI.btnLoading(btn, false, 'Apply');

    if (res) {
      UI.toast(`₹${amount} ${direction === 'CREDIT' ? 'credited' : 'debited'}. New balance: ₹${Fmt.money(res.data.newBalance.availableBalance)}`, 'success');
      UI.closeModal('modal-adjust');
      _loadList();
    }
  }

  /* ── Block ─────────────────────────────────────────── */
  const _block = { userId: null };

  function openBlock(userId) {
    _block.userId = userId;
    document.getElementById('block-reason').value = '';
    UI.closeModal('modal-user');
    UI.openModal('modal-block');
  }

  async function submitBlock() {
    const reason = document.getElementById('block-reason').value.trim();
    const btn    = document.getElementById('block-submit');
    if (reason.length < 5) { UI.toast('Reason required (min 5 chars)', 'error'); return; }

    UI.btnLoading(btn, true, 'Block');
    const res = await API.blockUser(_block.userId, reason);
    UI.btnLoading(btn, false, 'Block');

    if (res) {
      UI.toast('User blocked.', 'success');
      UI.closeModal('modal-block');
      _loadList();
    }
  }

  async function unblock(userId) {
    const res = await API.unblockUser(userId);
    if (res) {
      UI.toast('User unblocked.', 'success');
      UI.closeModal('modal-user');
      _loadList();
    }
  }

  async function updateKyc(userId, status) {
    const res = await API.updateKyc(userId, status);
    if (res) UI.toast(`KYC status updated to ${status}`, 'success');
  }

  return { load, onSearch, page, openDetail, openAdjust, submitAdjust, openBlock, submitBlock, unblock, updateKyc };
})();
