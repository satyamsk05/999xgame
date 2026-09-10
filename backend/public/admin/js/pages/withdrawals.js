/** pages/withdrawals.js */
'use strict';

const PageWithdrawals = (() => {
  const _state = { action: null, withdrawalId: null };

  async function load() {
    const tbody = document.getElementById('wdr-tbody');
    tbody.innerHTML = Skel.tableRows(6, 4);

    const res = await API.getPendingWithdrawals(200);
    if (!res) return;

    const wdrs = res.data || [];
    App.setBadge('badge-withdrawals', wdrs.length);
    document.getElementById('wdr-meta').textContent = `${wdrs.length} pending`;

    if (!wdrs.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">No pending withdrawals</div><div class="empty-sub">All caught up</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = wdrs.map(w => {
      const amt    = parseInt(w.amount || w.amountPaise || (w.amountRupees ? w.amountRupees * 100 : 0), 10);
      const upi    = w.payout_address_or_upi || w.upi_id || w.metadata?.upiId || '—';
      const uid    = w.user_id || w.userId || '—';
      const status = w.status || 'PENDING';
      const ts     = w.requested_at || w.created_at || w.createdAt;
      return `
        <tr>
          <td>
            <div class="font-semi text-sm">${Fmt.esc(uid)}</div>
            <div class="mono text-xs text-dim">${Fmt.esc(w.id)}</div>
          </td>
          <td><span class="amount-neg">₹${Fmt.paise(amt)}</span></td>
          <td><span class="mono text-xs">${Fmt.esc(upi)}</span></td>
          <td>${Badge.status(status)}</td>
          <td class="text-xs text-dim">${Fmt.date(ts)}</td>
          <td>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${status === 'PENDING' ? `<button class="btn btn-ghost btn-sm" onclick="PageWithdrawals.prep('${w.id}','process',${amt})">Process</button>` : ''}
              <button class="btn btn-success btn-sm" onclick="PageWithdrawals.prep('${w.id}','confirm',${amt})">Complete</button>
              <button class="btn btn-danger btn-sm"  onclick="PageWithdrawals.prep('${w.id}','reject',${amt})">Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function prep(withdrawalId, action, amt) {
    _state.withdrawalId = withdrawalId;
    _state.action       = action;

    const titles = { process: 'Mark as Processing', confirm: 'Complete Withdrawal', reject: 'Reject Withdrawal' };
    const questions = {
      process: 'Mark as PROCESSING? Funds remain reserved until completed.',
      confirm: 'Confirm payout complete? Reserved funds will be finalized.',
      reject:  'Reject this withdrawal? Reserved funds will be returned to user.',
    };
    const btnClass = { process: 'btn-ghost', confirm: 'btn-success', reject: 'btn-danger' };

    document.getElementById('wdr-modal-title').textContent = titles[action];
    document.getElementById('wdr-modal-q').textContent     = questions[action];
    document.getElementById('wdr-modal-amt').textContent   = `₹${Fmt.paise(amt)}`;
    document.getElementById('wdr-modal-id').textContent    = withdrawalId;
    document.getElementById('wdr-note').value              = '';

    const btn = document.getElementById('wdr-submit');
    btn.textContent = action.charAt(0).toUpperCase() + action.slice(1);
    btn.className   = `btn ${btnClass[action]}`;
    UI.openModal('modal-withdrawal');
  }

  async function submit() {
    const note = document.getElementById('wdr-note').value;
    const btn  = document.getElementById('wdr-submit');
    const lbl  = btn.textContent;

    UI.btnLoading(btn, true, lbl);
    const fns  = { process: API.processWithdrawal, confirm: API.confirmWithdrawal, reject: API.rejectWithdrawal };
    const res  = await fns[_state.action](_state.withdrawalId, note);
    UI.btnLoading(btn, false, lbl);

    if (res) {
      const msgs = { process: 'Marked as processing.', confirm: 'Withdrawal completed.', reject: 'Withdrawal rejected, funds released.' };
      UI.toast(msgs[_state.action], 'success');
      UI.closeModal('modal-withdrawal');
      load();
    }
  }

  return { load, prep, submit };
})();
