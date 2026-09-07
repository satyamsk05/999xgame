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

    if (serverWinAmount !== null && serverWinAmount > 0) {
      soundManager.playWin();
      eventBus.emit('WIN_OCCURRED', { winAmount: serverWinAmount });
    }

    // Refresh authoritative user profile balance from backend server
    setTimeout(() => {
      apiClient.getUserProfile().then(res => {
        if (res && res.data) {
          const profile = res.data.profile || res.data;
          const balance = profile.balance !== undefined ? profile.balance : (profile.totalBalance !== undefined ? profile.totalBalance : 0);
          if (typeof balance === 'number') {
            gameState.setBalance(balance);
          }
        }
      }).catch(() => {});
    }, 1000);
  }
}

export const resultManager = new ResultManager();
