/** pages/dashboard.js */
'use strict';

const PageDashboard = (() => {
  async function load() {
    _renderSkeleton();
    const res = await API.getDashboard();
    if (!res?.data) return;
    _render(res.data);

    // Auto-refresh every 30s
    AppState.refreshTimer = setInterval(load, 30000);
  }

  function _renderSkeleton() {
    document.getElementById('dash-stats').innerHTML =
      Array.from({ length: 8 }, () =>
        `<div class="stat-card">${Skel.card(76)}</div>`
      ).join('');
    document.getElementById('dash-round').innerHTML = Skel.card(60);
    document.getElementById('dash-updated').textContent = 'Loading...';
  }

  function _render(d) {
    document.getElementById('dash-updated').textContent =
      `Last updated ${Fmt.timeAgo(d.generatedAt)}`;

    // Update sidebar badges
    App.setBadge('badge-deposits',    d.deposits.pendingCount);
    App.setBadge('badge-withdrawals', d.withdrawals.pendingCount);

    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Users</div>
        <div class="stat-value">${Fmt.num(d.users.total)}</div>
        <div class="stat-sub">+${Fmt.num(d.users.newToday)} today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Deposits Today</div>
        <div class="stat-value">₹${Fmt.money(d.deposits.todayTotal)}</div>
        <div class="stat-sub">${Fmt.num(d.deposits.todayCount)} confirmed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Deposits</div>
        <div class="stat-value" style="color:${d.deposits.pendingCount > 0 ? 'var(--yellow)' : 'inherit'}">${d.deposits.pendingCount}</div>
        <div class="stat-sub"><a href="#" onclick="App.navigate('deposits');return false;" style="color:var(--blue);font-size:12px">Review</a></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Withdrawals Today</div>
        <div class="stat-value">₹${Fmt.money(d.withdrawals.todayTotal)}</div>
        <div class="stat-sub">${Fmt.num(d.withdrawals.todayCount)} completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Withdrawals</div>
        <div class="stat-value" style="color:${d.withdrawals.pendingCount > 0 ? 'var(--yellow)' : 'inherit'}">${d.withdrawals.pendingCount}</div>
        <div class="stat-sub"><a href="#" onclick="App.navigate('withdrawals');return false;" style="color:var(--blue);font-size:12px">Review</a></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Bets Today</div>
        <div class="stat-value">${Fmt.num(d.bets.todayCount)}</div>
        <div class="stat-sub">₹${Fmt.money(d.bets.todayStaked)} staked</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">House Revenue Today</div>
        <div class="stat-value" style="color:var(--green)">₹${Fmt.money(d.revenue.todayHouseRevenue)}</div>
        <div class="stat-sub">Net house edge</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Platform Status</div>
        <div class="stat-value text-sm font-semi" style="color:var(--green);font-size:15px;margin-top:4px">Operational</div>
        <div class="stat-sub">All systems running</div>
      </div>
    `;

    // Current round
    const r = d.currentRound;
    document.getElementById('dash-round').innerHTML = r
      ? `<div style="display:flex;align-items:center;gap:12px">
           <span class="dot ${r.status === 'BETTING_OPEN' ? 'dot-green' : r.status === 'SETTLED' ? 'dot-gray' : 'dot-yellow'}"></span>
           <div>
             <div class="font-semi">Round #${r.round_number} &mdash; ${r.status}</div>
             <div class="text-sm text-muted mt-2">ID: <span class="mono text-xs">${r.id}</span> &middot; ${Fmt.timeAgo(r.created_at)}</div>
           </div>
           ${Badge.status(r.status)}
         </div>`
      : `<div class="text-muted text-sm">No active round</div>`;
  }

  return { load };
})();
