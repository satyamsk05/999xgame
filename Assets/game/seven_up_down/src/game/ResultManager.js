import { gameState } from './GameState.js';
import { soundManager } from '../core/SoundManager.js';
import { apiClient } from '../network/ApiClient.js';
import { eventBus } from '../core/EventBus.js';

class ResultManager {
  processResult(result, serverWinAmount = null) {
    if (!result) return;
    const total = typeof result === 'number'
      ? result
      : (result.sum ?? result.total ?? ((result.dice1 || 0) + (result.dice2 || 0)));

    if (!total || isNaN(total)) return;

    gameState.addHistoryResult(total);

    // Check if client had placed winning bets and calculate client-side win
    let calculatedWin = 0;
    if (total >= 2 && total <= 6) {
      if (gameState.bets.down > 0) calculatedWin += gameState.bets.down * 2;
    } else if (total === 7) {
      if (gameState.bets.seven > 0) calculatedWin += gameState.bets.seven * 5;
    } else if (total >= 8 && total <= 12) {
      if (gameState.bets.up > 0) calculatedWin += gameState.bets.up * 2;
    }

    const effectiveWin = (serverWinAmount !== null && serverWinAmount > 0) ? serverWinAmount : calculatedWin;
    if (effectiveWin > 0) {
      soundManager.playWin();
      eventBus.emit('WIN_OCCURRED', { winAmount: effectiveWin });
      // Instantly credit winnings to userBalance on screen
      gameState.userBalance += effectiveWin;
      eventBus.emit('BALANCE_UPDATED', gameState.userBalance);
      apiClient.notifyParentWallet(gameState.userBalance);
    }

    // Refresh authoritative user profile balance from backend server in intervals
    const refreshProfileBalance = () => {
      apiClient.getUserProfile().then(res => {
        if (res && res.data) {
          const profile = res.data.profile || res.data;
          const balance = profile.balance !== undefined ? profile.balance : (profile.totalBalance !== undefined ? profile.totalBalance : 0);
          if (typeof balance === 'number') {
            gameState.setBalance(balance);
          }
        }
      }).catch(() => {});
    };

    setTimeout(refreshProfileBalance, 400);
    setTimeout(refreshProfileBalance, 1200);
  }
}

export const resultManager = new ResultManager();
