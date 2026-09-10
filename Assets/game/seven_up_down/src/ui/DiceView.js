import { eventBus } from '../core/EventBus.js';

export class DiceView {
  constructor(dice1El, dice2El) {
    this.dice1El = dice1El;
    this.dice2El = dice2El;
    this.init();
  }

  init() {
    eventBus.on('ROUND_CREATED', () => {
      if (this.dice1El) {
        this.dice1El.classList.remove('rolling');
        this.dice1El.innerText = '?';
      }
      if (this.dice2El) {
        this.dice2El.classList.remove('rolling');
        this.dice2El.innerText = '?';
      }
    });

    eventBus.on('DICE_ROLL_START', () => {
      if (this.dice1El) this.dice1El.classList.add('rolling');
      if (this.dice2El) this.dice2El.classList.add('rolling');
    });

    eventBus.on('DICE_ROLL_END', ({ d1, d2 }) => {
      if (this.dice1El) {
        this.dice1El.classList.remove('rolling');
        this.dice1El.innerText = d1;
      }
      if (this.dice2El) {
        this.dice2El.classList.remove('rolling');
        this.dice2El.innerText = d2;
      }
    });
  }
}
