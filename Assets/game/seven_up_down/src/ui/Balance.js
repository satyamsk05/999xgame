import { eventBus } from '../core/EventBus.js';
import { formatCurrency } from '../utils/formatter.js';

export class Balance {
  constructor(el) {
    this.el = el;
    this.init();
  }

  init() {
    eventBus.on('BALANCE_UPDATED', (balance) => {
      this.update(balance);
    });
  }

  update(balance) {
    if (this.el) {
      this.el.innerText = formatCurrency(balance);
    }
  }
}
