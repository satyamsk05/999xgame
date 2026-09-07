/** pages/notifications.js */
'use strict';

const PageNotifications = (() => {
  async function load() {
    // Check if Telegram is configured by hitting health or a known endpoint
    // The backend doesn't expose telegram status, so we show config UI only
    const hasTelegram = false; // No TELEGRAM_BOT_TOKEN in .env

    document.getElementById('notif-body').innerHTML = `
      <div class="card card-p mb-4">
        <div class="font-semi mb-4">Telegram Notifications</div>
        <div class="alert alert-warn mb-4">
          Telegram is not configured. Add <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_CHAT_ID</code>
          to your <code>.env</code> file and restart the server to enable notifications.
        </div>
        <div class="grid-2 mb-4">
          <div class="field">
            <label class="field-label">Bot Token</label>
            <input class="input" type="password" placeholder="From @BotFather" id="notif-token" disabled>
          </div>
          <div class="field">
            <label class="field-label">Chat ID</label>
            <input class="input" type="text" placeholder="-100xxxxxxxxxx" id="notif-chat" disabled>
          </div>
        </div>
        <div class="text-sm text-dim">
          Once configured in <code>.env</code>, the backend will send notifications for:
          new deposits, withdrawal requests, large bets, and system alerts.
        </div>
      </div>

      <div class="card card-p">
        <div class="font-semi mb-4">System Notifications</div>
        <div id="sys-notifs">
          <div class="text-sm text-dim">Loading...</div>
        </div>
      </div>
    `;

    _loadSystemNotifs();
  }

  async function _loadSystemNotifs() {
    // Use dashboard data to surface alerts
    const res = await API.getDashboard();
    if (!res?.data) return;

    const d = res.data;
    const alerts = [];

    if (d.deposits.pendingCount > 0) {
      alerts.push({ level: 'warn', msg: `${d.deposits.pendingCount} deposit(s) awaiting approval` });
    }
    if (d.withdrawals.pendingCount > 0) {
      alerts.push({ level: 'warn', msg: `${d.withdrawals.pendingCount} withdrawal(s) awaiting processing` });
    }
    if (d.users.newToday > 0) {
      alerts.push({ level: 'info', msg: `${d.users.newToday} new user(s) registered today` });
    }
    if (alerts.length === 0) {
      alerts.push({ level: 'info', msg: 'No pending alerts. All systems normal.' });
    }

    document.getElementById('sys-notifs').innerHTML = alerts.map(a => `
      <div class="alert ${a.level === 'warn' ? 'alert-warn' : 'alert-info'} mb-4" style="margin-bottom:8px">
        ${Fmt.esc(a.msg)}
      </div>`).join('');
  }

  return { load };
})();
