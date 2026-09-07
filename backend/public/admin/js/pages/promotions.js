/** pages/promotions.js */
'use strict';

const PagePromotions = (() => {
  const _edit = { id: null };

  async function load() {
    const tbody = document.getElementById('promo-tbody');
    tbody.innerHTML = Skel.tableRows(6, 3);

    const res = await API.getPromos();
    if (!res?.data) return;

    const promos = res.data;
    document.getElementById('promo-meta').textContent = `${promos.length} total`;

    if (!promos.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-title">No promotions yet</div><div class="empty-sub">Create your first promotion</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = promos.map(p => `
      <tr>
        <td class="font-semi">${Fmt.esc(p.title)}</td>
        <td>${Badge.status(p.type)}</td>
        <td class="amount-pos">₹${Fmt.paise(p.bonus_amount)}</td>
        <td class="text-xs text-dim">₹${Fmt.paise(p.min_deposit)} min</td>
        <td>${Badge.status(p.status)}</td>
        <td class="text-xs text-dim">${p.valid_until ? Fmt.dateOnly(p.valid_until) : 'No expiry'}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="PagePromotions.openEdit('${p.id}','${Fmt.esc(p.title)}','${p.type}',${p.bonus_amount},${p.min_deposit})">Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="PagePromotions.toggle('${p.id}')">${p.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-danger btn-sm"  onclick="PagePromotions.remove('${p.id}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function openCreate() {
    _edit.id = null;
    document.getElementById('promo-modal-title').textContent = 'Create Promotion';
    document.getElementById('promo-title-inp').value = '';
    document.getElementById('promo-type').value      = 'WELCOME';
    document.getElementById('promo-bonus').value     = '';
    document.getElementById('promo-min').value       = '';
    document.getElementById('promo-from').value      = '';
    document.getElementById('promo-until').value     = '';
    UI.openModal('modal-promo');
  }

  function openEdit(id, title, type, bonus, minDep) {
    _edit.id = id;
    document.getElementById('promo-modal-title').textContent = 'Edit Promotion';
    document.getElementById('promo-title-inp').value = title;
    document.getElementById('promo-type').value      = type;
    document.getElementById('promo-bonus').value     = (parseInt(bonus,10)/100).toFixed(0);
    document.getElementById('promo-min').value       = (parseInt(minDep,10)/100).toFixed(0);
    UI.openModal('modal-promo');
  }

  async function submit() {
    const body = {
      title:       document.getElementById('promo-title-inp').value.trim(),
      type:        document.getElementById('promo-type').value,
      bonusAmount: parseFloat(document.getElementById('promo-bonus').value) || 0,
      minDeposit:  parseFloat(document.getElementById('promo-min').value) || 0,
      validFrom:   document.getElementById('promo-from').value  || null,
      validUntil:  document.getElementById('promo-until').value || null,
    };

    if (!body.title) { UI.toast('Title is required', 'error'); return; }

    const btn = document.getElementById('promo-submit');
    UI.btnLoading(btn, true, 'Save');
    const res = _edit.id ? await API.editPromo(_edit.id, body) : await API.createPromo(body);
    UI.btnLoading(btn, false, 'Save');

    if (res) {
      UI.toast(_edit.id ? 'Promotion updated.' : 'Promotion created.', 'success');
      UI.closeModal('modal-promo');
      load();
    }
  }

  async function toggle(id) {
    const res = await API.togglePromo(id);
    if (res) {
      UI.toast(`Promotion ${res.data.status === 'ACTIVE' ? 'enabled' : 'disabled'}.`, 'success');
      load();
    }
  }

  async function remove(id) {
    if (!confirm('Delete this promotion? This cannot be undone.')) return;
    const res = await API.deletePromo(id);
    if (res) { UI.toast('Promotion deleted.', 'success'); load(); }
  }

  return { load, openCreate, openEdit, submit, toggle, remove };
})();
