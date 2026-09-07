/** pages/security.js */
'use strict';

const PageSecurity = (() => {
  const S = { offset: 0, limit: 50, total: 0, action: '' };

  async function load() {
    S.offset = 0;
    await _loadLogs();
  }

  async function _loadLogs() {
    const tbody = document.getElementById('audit-tbody');
    tbody.innerHTML = Skel.tableRows(5, 5);

    const res = await API.getAuditLogs(S.limit, S.offset, S.action);
    if (!res?.data) return;

    S.total = res.meta?.total || 0;
    document.getElementById('audit-meta').textContent =
      `${Fmt.num(S.total)} log entries`;
    _updatePagination();

    if (!res.data.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-title">No audit logs found</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(log => `
      <tr>
        <td class="mono text-xs text-dim">${Fmt.esc(log.id)}</td>
        <td class="mono text-xs">${Fmt.esc(log.action)}</td>
        <td class="text-sm text-dim">${Fmt.esc(log.user_id || '—')}</td>
        <td class="mono text-xs text-dim" style="max-width:200px">
          <div class="truncate">${log.details ? Fmt.esc(JSON.stringify(log.details)) : '—'}</div>
        </td>
        <td class="text-xs text-dim">${Fmt.date(log.created_at)}</td>
      </tr>`).join('');
  }

  function filterAction(val) {
    S.action = val.trim();
    S.offset = 0;
    _loadLogs();
  }

  function page(dir) {
    S.offset = Math.max(0, S.offset + dir * S.limit);
    _loadLogs();
  }

  function _updatePagination() {
    const cur   = Math.floor(S.offset / S.limit) + 1;
    const total = Math.ceil(S.total / S.limit) || 1;
    document.getElementById('audit-page-info').textContent = `Page ${cur} / ${total}`;
    document.getElementById('audit-prev').disabled = S.offset === 0;
    document.getElementById('audit-next').disabled = S.offset + S.limit >= S.total;
  }

  return { load, filterAction, page };
})();
