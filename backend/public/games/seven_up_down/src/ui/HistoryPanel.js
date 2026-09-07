import { eventBus } from '../core/EventBus.js';

export class HistoryPanel {
  constructor(ribbonEl) {
    this.ribbonEl = ribbonEl;
    this.init();
  }

  init() {
    eventBus.on('HISTORY_UPDATED', (historyList) => {
      this.render(historyList);
    });
  }

  render(historyList) {
    if (!this.ribbonEl || !Array.isArray(historyList)) return;
    this.ribbonEl.innerHTML = '';
    historyList.forEach(item => {
      const total = typeof item === 'number'
        ? item
        : (item?.sum ?? item?.total ?? parseInt(item, 10));

      if (!total || isNaN(total) || total < 2 || total > 12) return;

      const badge = document.createElement('div');
      badge.className = 'badge-num ';
      if (total >= 2 && total <= 6) badge.className += 'badge-red';
      else if (total === 7) badge.className += 'badge-blue';
      else badge.className += 'badge-green';
      badge.innerText = total;

      this.ribbonEl.appendChild(badge);
    });
  }
}
