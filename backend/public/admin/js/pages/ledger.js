/** pages/ledger.js */
'use strict';

const PageLedger = (() => {
  let _debounce = null;
  let _userId   = '';

  function load() {
    // Page loads in idle state — user must enter a user ID
    const tbody = document.getElementById('ledger-tbody');
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">Enter a User ID to view transactions</div></div></td></tr>`;
  }

  function onSearch(val) {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      _userId = val.trim();
      _loadTxns();
    }, 500);
  }

  async function _loadTxns() {
    if (!_userId) { load(); return; }

    const tbody = document.getElementById('ledger-tbody');
    tbody.innerHTML = Skel.tableRows(6, 5);

    const typeFilter = document.getElementById('ledger-type').value;
    const res = await API.getUser(_userId);
    if (!res?.data) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">User not found</div></div></td></tr>`;
      return;
    }

    const { user, wallet, recentTransactions } = res.data;
    document.getElementById('ledger-user-info').innerHTML = `
      <span class="font-semi">${Fmt.esc(user.username)}</span>
      <span class="text-dim text-sm">&nbsp;·&nbsp;${Fmt.esc(user.phone)}</span>
      <span class="badge badge-blue" style="margin-left:8px">Avail: ₹${Fmt.money(wallet.availableBalance)}</span>
      <span class="badge badge-gray" style="margin-left:4px">Reserved: ₹${Fmt.money(wallet.reservedBalance)}</span>
    `;

    let txns = recentTransactions;
    if (typeFilter) txns = txns.filter(t => t.type === typeFilter);

    if (!txns.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">No transactions match filter</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = txns.map(t => `
      <tr>
        <td class="mono text-xs text-dim">${Fmt.esc(t.id || '—')}</td>
        <td class="mono text-xs">${Fmt.esc(t.type)}</td>
        <td>${Badge.status(t.direction)}</td>
        <td class="${t.direction === 'CREDIT' ? 'amount-pos' : 'amount-neg'}">
          ${t.direction === 'CREDIT' ? '+' : '-'}₹${Fmt.money(t.amount)}
        </td>
        <td class="mono text-xs text-dim">${Fmt.esc(t.referenceId || '—')}</td>
        <td class="text-xs text-dim">${Fmt.date(t.createdAt)}</td>
      </tr>`).join('');
  }

  return { load, onSearch };
})();
