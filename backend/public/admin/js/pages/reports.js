/** pages/reports.js */
'use strict';

const PageReports = (() => {
  async function load() {
    _setSkeleton();

    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    document.getElementById('rep-from').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('rep-to').value   = today.toISOString().split('T')[0];

    await _fetch();
  }

  async function fetch() {
    _setSkeleton();
    await _fetch();
  }

  async function _fetch() {
    const from = document.getElementById('rep-from').value;
    const to   = document.getElementById('rep-to').value;

    const [summary, daily] = await Promise.all([
      API.getReportSummary(from, to),
      API.getReportDaily(30),
    ]);

    if (!summary?.data) return;

    const d = summary.data;

    document.getElementById('rep-period').textContent =
      `${Fmt.dateOnly(d.period.from)} — ${Fmt.dateOnly(d.period.to)}`;

    document.getElementById('rep-summary').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Deposits</div>
        <div class="stat-value">₹${Fmt.money(d.deposits.total)}</div>
        <div class="stat-sub">${Fmt.num(d.deposits.count)} transactions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Withdrawals</div>
        <div class="stat-value">₹${Fmt.money(d.withdrawals.total)}</div>
        <div class="stat-sub">${Fmt.num(d.withdrawals.count)} transactions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Bets</div>
        <div class="stat-value">${Fmt.num(d.bets.count)}</div>
        <div class="stat-sub">₹${Fmt.money(d.bets.staked)} staked</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Wins / Losses</div>
        <div class="stat-value">${Fmt.num(d.bets.wins)} / ${Fmt.num(d.bets.losses)}</div>
        <div class="stat-sub">Settled bets</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paid Out</div>
        <div class="stat-value">₹${Fmt.money(d.bets.paidOut)}</div>
        <div class="stat-sub">Total winnings paid</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">House Revenue</div>
        <div class="stat-value" style="color:${d.bets.houseRevenue >= 0 ? 'var(--green)' : 'var(--red)'}">
          ₹${Fmt.money(d.bets.houseRevenue)}
        </div>
        <div class="stat-sub">Staked − Paid Out</div>
      </div>
    `;

    // Daily table
    if (daily?.data) {
      const { deposits: depDays, bets: betDays } = daily.data;
      const tbody = document.getElementById('rep-daily-tbody');
      tbody.innerHTML = betDays.map(r => {
        const dep = depDays.find(d => d.day === r.day);
        return `
          <tr>
            <td>${Fmt.dateOnly(r.day)}</td>
            <td class="amount-pos">${dep ? '₹' + Fmt.money(dep.total) : '—'}</td>
            <td class="amount">${Fmt.num(r.count)}</td>
            <td class="amount">₹${Fmt.money(r.staked)}</td>
            <td class="amount">₹${Fmt.money(r.paidOut)}</td>
            <td class="${r.houseRevenue >= 0 ? 'amount-pos' : 'amount-neg'}">
              ${r.houseRevenue >= 0 ? '+' : ''}₹${Fmt.money(r.houseRevenue)}
            </td>
          </tr>`;
      }).join('') || `<tr><td colspan="6"><div class="empty empty-sub">No data for this period</div></td></tr>`;
    }
  }

  function _setSkeleton() {
    document.getElementById('rep-summary').innerHTML =
      Array.from({ length: 6 }, () => `<div class="stat-card">${Skel.card(70)}</div>`).join('');
    document.getElementById('rep-daily-tbody').innerHTML = Skel.tableRows(6, 7);
  }

  return { load, fetch };
})();
