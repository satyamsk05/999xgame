/** pages/withdrawals.js */
'use strict';

const PageWithdrawals = (() => {
  const _state = { action: null, withdrawalId: null, itemsById: {} };

  async function load() {
    const tbody = document.getElementById('wdr-tbody');
    tbody.innerHTML = Skel.tableRows(6, 4);

    const res = await API.getPendingWithdrawals(200);
    if (!res) return;

    const wdrs = res.data || [];
    _state.itemsById = {};
    wdrs.forEach(w => { _state.itemsById[w.id] = w; });

    App.setBadge('badge-withdrawals', wdrs.length);
    document.getElementById('wdr-meta').textContent = `${wdrs.length} pending`;

    if (!wdrs.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">No pending withdrawals</div><div class="empty-sub">All caught up</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = wdrs.map(w => {
      const amt    = parseInt(w.amount || w.amountPaise || (w.amountRupees ? w.amountRupees * 100 : 0), 10);
      const uid    = w.user_id || w.userId || '—';
      const uPhone = w.userPhone || w.user_phone || '';
      const uName  = w.userUsername || w.user_username || '';
      const status = w.status || 'PENDING';
      const ts     = w.requested_at || w.created_at || w.createdAt;
      const isBank = (w.payoutMethod === 'BANK' || w.paymentMode === 'BANK' || !!w.bankAccountNumber);

      let payoutHtml = '';
      if (isBank) {
        const acc = w.bankAccountNumber || '—';
        const ifsc = w.bankIfsc || '—';
        const holder = w.bankAccountHolder || '—';
        const bName = w.bankName || 'Bank Account';
        payoutHtml = `
          <div style="display:flex;flex-direction:column;gap:3px">
            <div><span class="badge" style="background:rgba(33,150,243,0.18);color:#2196f3;font-weight:700;font-size:10px">BANK TRANSFER</span></div>
            <div class="font-semi text-xs" style="color:var(--text-1)">${Fmt.esc(holder)}</div>
            <div class="text-xs text-dim">${Fmt.esc(bName)}</div>
            <div class="mono text-xs flex items-center gap-1">
              <span>A/C: ${Fmt.esc(acc)}</span>
              ${acc !== '—' ? `<button class="btn btn-ghost btn-xs" style="padding:0px 5px;font-size:10px;height:18px" onclick="navigator.clipboard.writeText('${acc}');UI.toast('Account number copied!','success')">Copy</button>` : ''}
            </div>
            <div class="mono text-xs flex items-center gap-1">
              <span>IFSC: ${Fmt.esc(ifsc)}</span>
              ${ifsc !== '—' ? `<button class="btn btn-ghost btn-xs" style="padding:0px 5px;font-size:10px;height:18px" onclick="navigator.clipboard.writeText('${ifsc}');UI.toast('IFSC code copied!','success')">Copy</button>` : ''}
            </div>
          </div>
        `;
      } else {
        const upi = w.upiId || w.payout_address_or_upi || '—';
        const upiName = w.upiName || '';
        payoutHtml = `
          <div style="display:flex;flex-direction:column;gap:3px">
            <div><span class="badge" style="background:rgba(0,230,118,0.18);color:#00e676;font-weight:700;font-size:10px">UPI</span></div>
            <div class="mono text-xs flex items-center gap-1 font-semi" style="color:var(--text-1)">
              <span>${Fmt.esc(upi)}</span>
              ${upi !== '—' ? `<button class="btn btn-ghost btn-xs" style="padding:0px 5px;font-size:10px;height:18px" onclick="navigator.clipboard.writeText('${upi}');UI.toast('UPI ID copied!','success')">Copy</button>` : ''}
            </div>
            ${upiName ? `<div class="text-xs text-dim">${Fmt.esc(upiName)}</div>` : ''}
          </div>
        `;
      }

      return `
        <tr>
          <td>
            <div class="font-semi text-sm">${Fmt.esc(uName || uid)}</div>
            <div class="text-xs text-dim">${Fmt.esc(uPhone)}</div>
            <div class="mono text-xs text-dim">${Fmt.esc(w.withdrawalId || w.id)}</div>
          </td>
          <td><span class="amount-neg" style="font-size:15px;font-weight:700">₹${Fmt.paise(amt)}</span></td>
          <td>${payoutHtml}</td>
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

    const titles = { process: 'Mark as Processing', confirm: 'Complete Withdrawal Payout', reject: 'Reject Withdrawal' };
    const questions = {
      process: 'Mark as PROCESSING? Payout is being prepared. Funds remain reserved.',
      confirm: 'Confirm payout settlement complete? Reserved funds will be finalized.',
      reject:  'Reject this withdrawal? Reserved funds will be returned to user wallet.',
    };
    const btnClass = { process: 'btn-ghost', confirm: 'btn-success', reject: 'btn-danger' };

    document.getElementById('wdr-modal-title').textContent = titles[action];
    document.getElementById('wdr-modal-q').textContent     = questions[action];
    document.getElementById('wdr-modal-amt').textContent   = `₹${Fmt.paise(amt)}`;
    document.getElementById('wdr-modal-id').textContent    = withdrawalId;
    document.getElementById('wdr-note').value              = '';

    // Render payout info inside modal for easy settlement
    const w = _state.itemsById[withdrawalId];
    const infoEl = document.getElementById('wdr-modal-payout-info');
    if (infoEl && w) {
      const isBank = (w.payoutMethod === 'BANK' || w.paymentMode === 'BANK' || !!w.bankAccountNumber);
      if (isBank) {
        infoEl.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:#2196f3;margin-bottom:6px">BANK SETTLEMENT DETAILS</div>
          <div class="detail-row"><span class="detail-key">Bank Name</span><span class="detail-val">${Fmt.esc(w.bankName || '—')}</span></div>
          <div class="detail-row"><span class="detail-key">Account Holder</span><span class="detail-val font-semi">${Fmt.esc(w.bankAccountHolder || '—')}</span></div>
          <div class="detail-row"><span class="detail-key">Account Number</span><span class="detail-val mono font-semi" style="color:var(--text-1)">${Fmt.esc(w.bankAccountNumber || '—')} <button class="btn btn-ghost btn-xs" style="padding:1px 5px;font-size:10px" onclick="navigator.clipboard.writeText('${w.bankAccountNumber}');UI.toast('Account number copied!','success')">Copy</button></span></div>
          <div class="detail-row"><span class="detail-key">IFSC Code</span><span class="detail-val mono font-semi" style="color:var(--text-1)">${Fmt.esc(w.bankIfsc || '—')} <button class="btn btn-ghost btn-xs" style="padding:1px 5px;font-size:10px" onclick="navigator.clipboard.writeText('${w.bankIfsc}');UI.toast('IFSC code copied!','success')">Copy</button></span></div>
        `;
      } else {
        const upi = w.upiId || w.payout_address_or_upi || '—';
        infoEl.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:#00e676;margin-bottom:6px">UPI SETTLEMENT DETAILS</div>
          <div class="detail-row"><span class="detail-key">UPI ID</span><span class="detail-val mono font-semi" style="color:var(--text-1)">${Fmt.esc(upi)} <button class="btn btn-ghost btn-xs" style="padding:1px 5px;font-size:10px" onclick="navigator.clipboard.writeText('${upi}');UI.toast('UPI ID copied!','success')">Copy</button></span></div>
          ${w.upiName ? `<div class="detail-row"><span class="detail-key">UPI Name</span><span class="detail-val">${Fmt.esc(w.upiName)}</span></div>` : ''}
        `;
      }
    }

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
      const msgs = { process: 'Marked as processing.', confirm: 'Withdrawal completed & settled.', reject: 'Withdrawal rejected, funds released.' };
      UI.toast(msgs[_state.action], 'success');
      UI.closeModal('modal-withdrawal');
      load();
    }
  }

  return { load, prep, submit };
})();
