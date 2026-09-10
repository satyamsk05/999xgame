import { soundManager } from '../core/SoundManager.js';
import { eventBus } from '../core/EventBus.js';

class DiceManager {
  rollDiceAnimation(result, callback) {
    soundManager.playDiceRoll();
    eventBus.emit('DICE_ROLL_START');

    setTimeout(() => {
      const diceResult = {
        d1: result?.dice1 || 1,
        d2: result?.dice2 || 1,
        total: result?.sum || ((result?.dice1 || 1) + (result?.dice2 || 1))
      };
      eventBus.emit('DICE_ROLL_END', diceResult);
      if (callback) callback(diceResult);
    }, 1500);
  }
}

export const diceManager = new DiceManager();
