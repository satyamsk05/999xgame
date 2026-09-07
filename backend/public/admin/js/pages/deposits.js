/** pages/deposits.js */
'use strict';

const PageDeposits = (() => {
  const _state = { action: null, depositId: null };

  async function load() {
    const tbody = document.getElementById('dep-tbody');
    tbody.innerHTML = Skel.tableRows(5, 4);

    const res = await API.getPendingDeposits(200);
    if (!res) return;

    const deps = res.data || [];
    App.setBadge('badge-deposits', deps.length);
    document.getElementById('dep-meta').textContent = `${deps.length} pending`;

    if (!deps.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-title">No pending deposits</div><div class="empty-sub">All caught up</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = deps.map(d => {
      const amt   = parseInt(d.amount || 0, 10);
      const utr   = d.utr || d.reference_id || '—';
      const uid   = d.user_id || d.userId || '—';
      const ts    = d.submitted_at || d.created_at || d.createdAt;
      const status = d.status || 'PENDING';
      return `
        <tr>
          <td>
            <div class="font-semi text-sm">${Fmt.esc(uid)}</div>
            <div class="mono text-xs text-dim">${Fmt.esc(d.id)}</div>
          </td>
          <td><span class="amount-pos">₹${Fmt.paise(amt)}</span></td>
          <td><span class="mono text-xs">${Fmt.esc(utr)}</span></td>
          <td>${Badge.status(status)}</td>
          <td class="text-xs text-dim">${Fmt.date(ts)}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-success btn-sm" onclick="PageDeposits.prep('${d.id}','confirm',${amt})">Approve</button>
              <button class="btn btn-danger btn-sm"  onclick="PageDeposits.prep('${d.id}','reject',${amt})">Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function prep(depositId, action, amt) {
    _state.depositId = depositId;
    _state.action    = action;
    const isApprove  = action === 'confirm';

    document.getElementById('dep-modal-title').textContent  = isApprove ? 'Approve Deposit' : 'Reject Deposit';
    document.getElementById('dep-modal-q').textContent      = isApprove
      ? `Approve this deposit and credit the user's wallet?`
      : `Reject this deposit? No funds will be credited.`;
    document.getElementById('dep-modal-amt').textContent    = `₹${Fmt.paise(amt)}`;
    document.getElementById('dep-modal-id').textContent     = depositId;
    document.getElementById('dep-note').value               = '';

    const btn = document.getElementById('dep-submit');
    btn.textContent  = isApprove ? 'Approve' : 'Reject';
    btn.className    = `btn ${isApprove ? 'btn-success' : 'btn-danger'}`;
    UI.openModal('modal-deposit');
  }

  async function submit() {
    const note = document.getElementById('dep-note').value;
    const btn  = document.getElementById('dep-submit');
    const lbl  = btn.textContent;

    UI.btnLoading(btn, true, lbl);
    const fn  = _state.action === 'confirm' ? API.confirmDeposit : API.rejectDeposit;
    const res = await fn(_state.depositId, note);
    UI.btnLoading(btn, false, lbl);

    if (res) {
      UI.toast(_state.action === 'confirm' ? 'Deposit approved and wallet credited.' : 'Deposit rejected.', 'success');
      UI.closeModal('modal-deposit');
      load();
    }
  }

  return { load, prep, submit };
})();
