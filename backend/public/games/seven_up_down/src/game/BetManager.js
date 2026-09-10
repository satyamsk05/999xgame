import { gameState } from './GameState.js';
import { apiClient } from '../network/ApiClient.js';
import { soundManager } from '../core/SoundManager.js';
import { eventBus } from '../core/EventBus.js';
import { GAME_ID } from '../config/constants.js';

class BetManager {
  placeMainBet(type) {
    if (gameState.isRolling) return;
    if (gameState.userBalance < gameState.selectedChip) {
      eventBus.emit('SHOW_TOAST', { message: '⚠️ Low Balance: Please Add Cash', isError: true });
      return;
    }

    soundManager.playClick();
    const chipVal = gameState.selectedChip;
    gameState.addBet(type, chipVal);
  }

  placeSpecificBet(num, odds) {
    if (gameState.isRolling) return;
    if (gameState.userBalance < gameState.selectedChip) {
      eventBus.emit('SHOW_TOAST', { message: '⚠️ Low Balance: Please Add Cash', isError: true });
      return;
    }

    soundManager.playClick();
    const chipVal = gameState.selectedChip;
    gameState.addSpecificBet(num, chipVal);
  }

  clearBets() {
    if (gameState.isRolling) return;
    soundManager.playClick();
    gameState.clearBets();
  }

  doubleBets() {
    if (gameState.isRolling || gameState.totalBet === 0) return;
    soundManager.playClick();
    const success = gameState.doubleBets();
    if (!success) {
      eventBus.emit('SHOW_TOAST', { message: '⚠️ Low Balance to double bet', isError: true });
    }
  }

  repeatLastBet() {
    if (gameState.isRolling || gameState.lastRoundBet === 0) return;
    if (gameState.userBalance < gameState.lastRoundBet) {
      eventBus.emit('SHOW_TOAST', { message: '⚠️ Low Balance to repeat bet', isError: true });
      return;
    }
    soundManager.playClick();
    this.placeMainBet('seven');
  }

  undoLastBet() {
    if (gameState.isRolling || gameState.totalBet === 0) return;
    soundManager.playClick();
    gameState.clearBets();
  }
}

export const betManager = new BetManager();
