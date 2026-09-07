import { gameConfig } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { apiClient } from '../network/ApiClient.js';

class GameState {
  constructor() {
    this.userBalance = 0;
    this.serverBalance = 0;
    this.selectedChip = 10;
    this.selectedChipColor = '#00e676';
    this.bets = {
      down: 0,
      seven: 0,
      up: 0,
      specific: {}
    };
    this.totalBet = 0;
    this.lastRoundBet = 0;
    this.isRolling = false;
    this.roundTimeLeft = 12;
    this.history = [];
  }


  setBalance(newBalance) {
    const rawBalance = Math.max(0, Number(newBalance) || 0);
    this.serverBalance = rawBalance;
    // Always deduct active unsubmitted bets on table from raw server balance
    this.userBalance = Math.max(0, this.serverBalance - (this.totalBet || 0));
    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
  }

  setSelectedChip(value, color = '#00e676') {
    this.selectedChip = value;
    this.selectedChipColor = color;
    eventBus.emit('CHIP_CHANGED', { value, color });
  }

  addBet(type, amount) {
    if (type === 'specific') return;
    if (this.isRolling || this.userBalance < amount) return;

    this.bets[type] += amount;
    this.totalBet += amount;
    this.userBalance = Math.max(0, this.userBalance - amount);

    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });

    // Send bet immediately to server while round is open
    eventBus.emit('PLACE_BET', { betType: type.toUpperCase(), stakeAmount: amount });
  }

  addSpecificBet(number, amount) {
    if (this.isRolling || this.userBalance < amount) return;

    this.bets.specific[number] = (this.bets.specific[number] || 0) + amount;
    this.totalBet += amount;
    this.userBalance = Math.max(0, this.userBalance - amount);

    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });

    // Send bet immediately to server while round is open
    eventBus.emit('PLACE_BET', { betType: String(number), stakeAmount: amount });
  }

  clearBets() {
    this.bets = { down: 0, seven: 0, up: 0, specific: {} };
    this.totalBet = 0;
    if (this.serverBalance !== undefined) {
      this.userBalance = this.serverBalance;
    }
    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
  }

  doubleBets() {
    if (this.totalBet === 0 || this.userBalance < this.totalBet) return false;
    
    this.bets.down *= 2;
    this.bets.seven *= 2;
    this.bets.up *= 2;
    for (const key in this.bets.specific) {
      this.bets.specific[key] *= 2;
    }
    this.totalBet *= 2;
    this.userBalance = Math.max(0, (this.serverBalance !== undefined ? this.serverBalance : this.userBalance) - this.totalBet);

    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
    return true;
  }

  resetRoundBets() {
    this.lastRoundBet = this.totalBet;
    this.bets = { down: 0, seven: 0, up: 0, specific: {} };
    this.totalBet = 0;
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
  }

  setHistory(historyArray) {
    if (Array.isArray(historyArray) && historyArray.length > 0) {
      this.history = historyArray;
      eventBus.emit('HISTORY_UPDATED', this.history);
    }
  }

  addHistoryResult(total) {
    this.history.unshift(total);
    if (this.history.length > 100) this.history.pop();
    eventBus.emit('HISTORY_UPDATED', this.history);
  }
}

export const gameState = new GameState();
