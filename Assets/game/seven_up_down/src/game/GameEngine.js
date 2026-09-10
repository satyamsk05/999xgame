import { gameState } from './GameState.js';
import { diceManager } from './DiceManager.js';
import { timerManager } from './TimerManager.js';
import { resultManager } from './ResultManager.js';
import { apiClient } from '../network/ApiClient.js';
import { eventBus } from '../core/EventBus.js';

class GameEngine {
  constructor() {
    this.currentRoundId = null;
  }

  init() {
    this.fetchUserProfile();
    this.syncCurrentRound();

    eventBus.on('ROUND_CREATED', (round) => {
      this.handleRoundCreated(round);
    });

    eventBus.on('BETTING_CLOSED', () => {
      this.handleBettingClosed();
    });

    eventBus.on('ROUND_RESULT', (result) => {
      this.handleRoundResult(result);
    });

    eventBus.on('PLACE_BET', ({ betType, stakeAmount }) => {
      this.handlePlaceBet(betType, stakeAmount);
    });
  }

  handlePlaceBet(betType, stakeAmount) {
    if (!this.currentRoundId) return;
    apiClient.placeBet({
      roundId: this.currentRoundId,
      betType: betType,
      stakeAmount: stakeAmount
    }).then(res => {
      if (res && res.data && res.data.wallet) {
        const totalBal = res.data.wallet.totalBalance !== undefined ? res.data.wallet.totalBalance : res.data.wallet.balance;
        if (totalBal !== undefined) {
          gameState.serverBalance = totalBal;
        }
      }
    }).catch(err => {
      console.warn('Place bet error:', err);
    });
  }

  fetchUserProfile() {
    apiClient.getUserProfile()
      .then(res => {
        if (res && res.data) {
          const profile = res.data.profile || res.data;
          const balance = profile.balance !== undefined ? profile.balance : (profile.totalBalance !== undefined ? profile.totalBalance : 0);
          gameState.setBalance(balance);
          
          const name = profile.username || profile.phoneNumber || 'Player';
          const userNameEl = document.getElementById('userNameText');
          if (userNameEl) {
            userNameEl.innerText = name;
          }

          const avatarUrl = profile.avatarUrl || profile.avatar_path || '/avatars/avatar_1.png';
          const avatarEls = document.querySelectorAll('.user-avatar-circle');
          avatarEls.forEach(el => {
            el.src = avatarUrl.startsWith('/') ? avatarUrl : '/avatars/' + avatarUrl.split('/').pop();
          });
        }
      })
      .catch(() => {});
  }

  syncCurrentRound() {
    apiClient.getCurrentRound()
      .then(res => {
        if (res && res.data) {
          this.handleRoundCreated(res.data);
        }
      })
      .catch(() => {});
  }

  handleRoundCreated(round) {
    if (!round || !round.roundId) return;
    this.currentRoundId = round.roundId;

    if (round.recentHistory && Array.isArray(round.recentHistory) && round.recentHistory.length > 0) {
      gameState.setHistory(round.recentHistory);
    }

    if (round.status === 'BETTING_CLOSED' || round.status === 'RESULT_GENERATED' || (round.timeRemainingSeconds !== undefined && round.timeRemainingSeconds <= 0)) {
      gameState.isRolling = true;
      timerManager.stopTimer();
      eventBus.emit('DICE_ROLL_START');
      return;
    }

    gameState.isRolling = false;
    gameState.resetRoundBets();

    const timeRemaining = round.timeRemainingSeconds !== undefined ? round.timeRemainingSeconds : 15;
    timerManager.startTimer(timeRemaining);
  }

  handleBettingClosed() {
    gameState.isRolling = true;
    timerManager.stopTimer();
  }

  handleRoundResult(result) {
    gameState.isRolling = true;
    timerManager.stopTimer();
    diceManager.rollDiceAnimation(result, (diceResult) => {
      resultManager.processResult(result);
    });
  }
}

export const gameEngine = new GameEngine();
