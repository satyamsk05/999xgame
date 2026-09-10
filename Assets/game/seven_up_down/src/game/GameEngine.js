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
    if (!this.currentRoundId) {
      console.warn('Cannot place bet: no active roundId');
      return;
    }
    apiClient.placeBet({
      roundId: this.currentRoundId,
      betType: betType,
      stakeAmount: stakeAmount
    }).then(res => {
      if (res && res.data && res.data.wallet) {
        const wallet = res.data.wallet;
        const totalBal = wallet.totalBalance !== undefined 
          ? Number(wallet.totalBalance) 
          : (wallet.available_balance !== undefined ? Number(wallet.available_balance) / 100 : Number(wallet.balance || 0));
        
        if (typeof totalBal === 'number' && !isNaN(totalBal)) {
          gameState.serverBalance = totalBal;
          gameState.userBalance = Math.max(0, totalBal);
          eventBus.emit('BALANCE_UPDATED', gameState.userBalance);
          apiClient.notifyParentWallet(gameState.userBalance);
        }
      } else if (res && res.status === 'error') {
        console.warn('Bet rejected by backend:', res.message);
        alert(res.message || 'Bet failed to place');
        this.fetchUserProfile();
      }
    }).catch(err => {
      console.warn('Place bet error:', err);
      this.fetchUserProfile();
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
