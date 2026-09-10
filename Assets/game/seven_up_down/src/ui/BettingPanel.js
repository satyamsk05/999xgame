import { betManager } from '../game/BetManager.js';
import { eventBus } from '../core/EventBus.js';
import { gameState } from '../game/GameState.js';

export class BettingPanel {
  constructor(mainBetsGridEl, numBetsWrapEl) {
    this.mainBetsGridEl = mainBetsGridEl;
    this.numBetsWrapEl = numBetsWrapEl;
    this.tableTotalBet = 0;
    this.tableInterval = null;
    this.bindEvents();
    this.listenState();
  }

  startTableBetSimulation() {
    if (this.tableInterval) clearInterval(this.tableInterval);
    this.tableTotalBet = Math.floor(Math.random() * 2500) + 1500;
    this.updateTotalTableBetDisplay();

    this.tableInterval = setInterval(() => {
      if (this.tableTotalBet < 125000) {
        const increment = Math.floor(Math.random() * 4500) + 1500;
        this.tableTotalBet += increment;
        this.updateTotalTableBetDisplay();
      } else {
        clearInterval(this.tableInterval);
      }
    }, 600);
  }

  stopTableBetSimulation() {
    if (this.tableInterval) {
      clearInterval(this.tableInterval);
      this.tableInterval = null;
    }
  }

  updateTotalTableBetDisplay() {
    const totalTableBetVal = document.getElementById('totalTableBetVal');
    if (totalTableBetVal) {
      const combined = this.tableTotalBet + (gameState.totalBet || 0);
      totalTableBetVal.innerText = `₹${combined.toLocaleString('en-IN')}.00`;
    }
  }

  bindEvents() {
    if (this.mainBetsGridEl) {
      const btnDown = this.mainBetsGridEl.querySelector('#btnBetDown');
      const btnSeven = this.mainBetsGridEl.querySelector('#btnBetSeven');
      const btnUp = this.mainBetsGridEl.querySelector('#btnBetUp');

      if (btnDown) btnDown.addEventListener('click', () => betManager.placeMainBet('down'));
      if (btnSeven) btnSeven.addEventListener('click', () => betManager.placeMainBet('seven'));
      if (btnUp) btnUp.addEventListener('click', () => betManager.placeMainBet('up'));
    }

    if (this.numBetsWrapEl) {
      const numCards = this.numBetsWrapEl.querySelectorAll('.num-card');
      numCards.forEach(card => {
        card.addEventListener('click', () => {
          const num = parseInt(card.getAttribute('data-num'), 10);
          const odds = parseInt(card.getAttribute('data-odds'), 10);
          if (num) {
            betManager.placeSpecificBet(num, odds);
          }
        });
      });
    }

    // Action buttons in bottom bar
    const btnClear = document.getElementById('btnClear');
    const btnDouble = document.getElementById('btnDouble');
    const btnUndo = document.getElementById('btnUndo');
    const btnAgain = document.getElementById('btnAgain');

    if (btnClear) btnClear.addEventListener('click', () => betManager.clearBets());
    if (btnDouble) btnDouble.addEventListener('click', () => betManager.doubleBets());
    if (btnUndo) btnUndo.addEventListener('click', () => betManager.undoLastBet());
    if (btnAgain) btnAgain.addEventListener('click', () => betManager.repeatLastBet());
  }

  listenState() {
    eventBus.on('ROUND_CREATED', () => {
      this.startTableBetSimulation();
    });

    eventBus.on('BETTING_CLOSED', () => {
      this.stopTableBetSimulation();
    });

    eventBus.on('BETS_UPDATED', ({ bets, totalBet }) => {
      const badgeDown = document.getElementById('badgeDown');
      const badgeSeven = document.getElementById('badgeSeven');
      const badgeUp = document.getElementById('badgeUp');
      const yourBetText = document.getElementById('yourBetText');

      if (yourBetText) yourBetText.innerText = `₹${totalBet}`;
      this.updateTotalTableBetDisplay();

      if (badgeDown) {
        if (bets.down > 0) {
          badgeDown.innerText = `₹${bets.down}`;
          badgeDown.style.display = 'block';
        } else {
          badgeDown.style.display = 'none';
        }
      }

      if (badgeSeven) {
        if (bets.seven > 0) {
          badgeSeven.innerText = `₹${bets.seven}`;
          badgeSeven.style.display = 'block';
        } else {
          badgeSeven.style.display = 'none';
        }
      }

      if (badgeUp) {
        if (bets.up > 0) {
          badgeUp.innerText = `₹${bets.up}`;
          badgeUp.style.display = 'block';
        } else {
          badgeUp.style.display = 'none';
        }
      }

      // Update specific number badges
      const specificNums = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
      specificNums.forEach(num => {
        const badgeEl = document.getElementById(`badgeNum${num}`);
        if (badgeEl) {
          const val = bets.specific && bets.specific[num] ? bets.specific[num] : 0;
          if (val > 0) {
            badgeEl.innerText = `₹${val}`;
            badgeEl.style.display = 'block';
          } else {
            badgeEl.style.display = 'none';
          }
        }
      });
    });

    eventBus.on('DICE_ROLL_END', ({ total }) => {
      let winCardId = null;
      if (total >= 2 && total <= 6) {
        winCardId = 'btnBetDown';
      } else if (total === 7) {
        winCardId = 'btnBetSeven';
      } else if (total >= 8 && total <= 12) {
        winCardId = 'btnBetUp';
      }

      if (winCardId) {
        const cardEl = document.getElementById(winCardId);
        if (cardEl) {
          cardEl.classList.add('win-golden-blink');
          setTimeout(() => {
            cardEl.classList.remove('win-golden-blink');
          }, 2500);
        }
      }

      // Highlight specific number card if applicable
      const numCardEl = document.querySelector(`.num-card[data-num="${total}"]`);
      if (numCardEl) {
        numCardEl.classList.add('win-golden-blink');
        setTimeout(() => {
          numCardEl.classList.remove('win-golden-blink');
        }, 2500);
      }
    });
  }
}
