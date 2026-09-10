import { gameState } from './GameState.js';
import { apiClient } from '../network/ApiClient.js';
import { soundManager } from '../core/SoundManager.js';
import { GAME_ID } from '../config/constants.js';

class BetManager {
  placeMainBet(type) {
    if (gameState.isRolling) return;
    if (gameState.userBalance < gameState.selectedChip) {
      alert('Insufficient Balance!');
      return;
    }

    soundManager.playClick();
    const chipVal = gameState.selectedChip;
    gameState.addBet(type, chipVal);
  }

  placeSpecificBet(num, odds) {
    if (gameState.isRolling) return;
    if (gameState.userBalance < gameState.selectedChip) {
      alert('Insufficient Balance!');
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
      alert('Insufficient balance to double!');
    }
  }

  repeatLastBet() {
    if (gameState.isRolling || gameState.lastRoundBet === 0) return;
    if (gameState.userBalance < gameState.lastRoundBet) {
      alert('Insufficient balance to repeat last bet!');
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
