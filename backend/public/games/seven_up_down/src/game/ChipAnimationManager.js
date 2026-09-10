import { eventBus } from '../core/EventBus.js';
import { gameState } from '../game/GameState.js';
import { soundManager } from '../core/SoundManager.js';
import { CHIP_SVGS } from '../config/constants.js';

function getChipSvg(val) {
  if (CHIP_SVGS && CHIP_SVGS[val]) return CHIP_SVGS[val];
  const label = val >= 1000 ? (val / 1000) + 'K' : val;
  return `./assets/chips/${label}.svg`;
}

export class ChipAnimationManager {
  constructor() {
    this.overlay = null;
    this.aiBetInterval = null;
    this.tableChips = {
      seven: [],
      down: [],
      up: []
    };
    this.init();
  }

  init() {
    let overlay = document.getElementById('chipAnimationOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'chipAnimationOverlay';
      overlay.className = 'chip-animation-overlay';
      document.body.appendChild(overlay);
    }
    this.overlay = overlay;

    // Listen to game events
    eventBus.on('ROUND_CREATED', () => {
      this.clearAllTableChips();
      this.startAiBettingSimulation();
    });

    eventBus.on('BETTING_CLOSED', () => {
      this.stopAiBettingSimulation();
    });

    eventBus.on('DICE_ROLL_END', ({ total }) => {
      this.handleRoundResult(total);
    });
  }

  startAiBettingSimulation() {
    this.stopAiBettingSimulation();

    // Trigger periodic AI bets from top 3 players
    const triggerAiBet = () => {
      if (gameState.isRolling) return;
      const playerIndex = Math.floor(Math.random() * 3) + 1; // 1, 2, 3
      const avatarEl = document.querySelector(`.player-stack-item:nth-child(${playerIndex === 1 ? 1 : playerIndex === 2 ? 3 : 5}) .stack-avatar`) ||
                       document.querySelector(`.player-stack-item .stack-avatar`);
      
      const tables = ['down', 'seven', 'up'];
      const targetTable = tables[Math.floor(Math.random() * tables.length)];
      const chipVals = [10, 50, 100, 500];
      const chipVal = chipVals[Math.floor(Math.random() * chipVals.length)];

      if (avatarEl) {
        this.flyChipFromElementToTable(avatarEl, targetTable, chipVal);
      }
    };

    // Initial rapid bets
    setTimeout(triggerAiBet, 400);
    setTimeout(triggerAiBet, 1100);

    this.aiBetInterval = setInterval(() => {
      if (Math.random() > 0.3) {
        triggerAiBet();
      }
    }, 1200);
  }

  stopAiBettingSimulation() {
    if (this.aiBetInterval) {
      clearInterval(this.aiBetInterval);
      this.aiBetInterval = null;
    }
  }

  flyUserChip(clickEvent, targetTable) {
    const chipVal = gameState.selectedChip || 10;
    const chipBtn = document.getElementById('mainChipBtn') || document.querySelector('.chip-center-anchor');
    let startRect = null;

    if (chipBtn) {
      startRect = chipBtn.getBoundingClientRect();
    } else {
      startRect = {
        left: window.innerWidth / 2 - 25,
        top: window.innerHeight - 70,
        width: 50,
        height: 50
      };
    }

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;

    // Determine target location on the clicked table
    let endX, endY;
    if (clickEvent && clickEvent.clientX && clickEvent.clientY) {
      endX = clickEvent.clientX;
      endY = clickEvent.clientY;
    } else {
      const tableEl = this.getTableElement(targetTable);
      if (tableEl) {
        const rect = tableEl.getBoundingClientRect();
        endX = rect.left + rect.width / 2 + (Math.random() * 60 - 30);
        endY = rect.top + rect.height / 2 + (Math.random() * 40 - 20);
      } else {
        endX = window.innerWidth / 2;
        endY = window.innerHeight / 2;
      }
    }

    this.animateFlyingChip(startX, startY, endX, endY, chipVal, targetTable, true);
  }

  flyChipFromElementToTable(fromEl, targetTable, chipVal) {
    const rect = fromEl.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    const tableEl = this.getTableElement(targetTable);
    if (!tableEl) return;

    const tableRect = tableEl.getBoundingClientRect();
    // Random position inside the table boundaries
    const paddingX = Math.min(tableRect.width * 0.25, 40);
    const paddingY = Math.min(tableRect.height * 0.25, 25);
    const endX = tableRect.left + paddingX + Math.random() * (tableRect.width - paddingX * 2);
    const endY = tableRect.top + paddingY + Math.random() * (tableRect.height - paddingY * 2);

    this.animateFlyingChip(startX, startY, endX, endY, chipVal, targetTable, false);
  }

  animateFlyingChip(startX, startY, endX, endY, chipVal, targetTable, isUser = false) {
    if (!this.overlay) return;

    const flyingChip = document.createElement('div');
    flyingChip.className = 'flying-chip-particle';
    flyingChip.innerHTML = `<img src="${getChipSvg(chipVal)}" alt="${chipVal}" />`;
    flyingChip.style.left = '0px';
    flyingChip.style.top = '0px';
    flyingChip.style.transform = `translate3d(${startX - 18}px, ${startY - 18}px, 0)`;
    flyingChip.style.willChange = 'transform';
    this.overlay.appendChild(flyingChip);

    try {
      soundManager.playClick();
    } catch (_) {}

    const duration = 350; // ms
    const startTime = performance.now();
    const arcHeight = Math.min(Math.abs(startX - endX) * 0.3 + 40, 80);

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 2);

      const currentX = startX + (endX - startX) * progress;
      const arc = 4 * arcHeight * progress * (1 - progress);
      const currentY = startY + (endY - startY) * ease - arc;

      const scale = 1 + 0.25 * Math.sin(progress * Math.PI);
      const rotation = progress * 360;

      flyingChip.style.transform = `translate3d(${currentX - 18}px, ${currentY - 18}px, 0) scale(${scale}) rotate(${rotation}deg)`;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        flyingChip.remove();
        this.addChipToTable(targetTable, endX, endY, chipVal, isUser);
      }
    };

    requestAnimationFrame(step);
  }

  addChipToTable(targetTable, pageX, pageY, chipVal, isUser) {
    const tableEl = this.getTableElement(targetTable);
    if (!tableEl) return;

    let chipsLayer = tableEl.querySelector('.table-chips-layer');
    if (!chipsLayer) {
      chipsLayer = document.createElement('div');
      chipsLayer.className = 'table-chips-layer';
      tableEl.appendChild(chipsLayer);
    }

    const tableRect = tableEl.getBoundingClientRect();
    const relX = Math.max(10, Math.min(pageX - tableRect.left - 14, tableRect.width - 36));
    const relY = Math.max(10, Math.min(pageY - tableRect.top - 14, tableRect.height - 36));

    // Cap max 10 chips per table for high performance
    if (this.tableChips[targetTable].length >= 10) {
      const oldest = this.tableChips[targetTable].shift();
      if (oldest && oldest.el && oldest.el.parentNode) {
        oldest.el.remove();
      }
    }

    const chipToken = document.createElement('div');
    chipToken.className = `table-chip-token ${isUser ? 'user-chip-token' : 'ai-chip-token'}`;
    chipToken.innerHTML = `<img src="${getChipSvg(chipVal)}" alt="${chipVal}" />`;
    chipToken.style.left = `${relX}px`;
    chipToken.style.top = `${relY}px`;
    chipToken.style.willChange = 'transform, opacity';

    chipsLayer.appendChild(chipToken);
    this.tableChips[targetTable].push({ el: chipToken, isUser, chipVal });

    chipToken.classList.add('chip-land-pop');
  }

  handleRoundResult(total) {
    let winningTable = null;
    if (total >= 2 && total <= 6) winningTable = 'down';
    else if (total === 7) winningTable = 'seven';
    else if (total >= 8 && total <= 12) winningTable = 'up';

    // 1. Gather & clear losing chips to center
    const domeEl = document.querySelector('.dome-pedestal') || document.querySelector('.glass-dome-wrap');
    let domeCenter = { x: window.innerWidth / 2, y: 220 };
    if (domeEl) {
      const r = domeEl.getBoundingClientRect();
      domeCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    ['down', 'seven', 'up'].forEach(t => {
      if (t !== winningTable) {
        this.tableChips[t].forEach(({ el }) => {
          if (el && el.parentNode) {
            el.classList.add('chip-sweep-fade');
            setTimeout(() => el.remove(), 600);
          }
        });
        this.tableChips[t] = [];
      }
    });

    // 2. Win Payout animations
    if (winningTable) {
      const winningChips = this.tableChips[winningTable];
      
      // Calculate user win if user placed bet on winning table
      const userBetOnWin = gameState.bets[winningTable] || 0;
      let multiplier = winningTable === 'seven' ? 5 : 2;
      let winAmount = userBetOnWin * multiplier;

      if (winAmount > 0) {
        // Fly winning chips to user profile
        setTimeout(() => {
          this.flyWinningChipsToUser(winningTable, winAmount);
        }, 600);
      }

      // Fly winning chips to AI avatars
      setTimeout(() => {
        this.flyWinningChipsToAiPlayers(winningTable);
      }, 700);
    }
  }

  flyWinningChipsToUser(winningTable, winAmount) {
    const userBox = document.querySelector('.player-info-box') || document.querySelector('.bottom-player-bar');
    if (!userBox) return;

    const destRect = userBox.getBoundingClientRect();
    const destX = destRect.left + destRect.width / 2;
    const destY = destRect.top + destRect.height / 2;

    const tableEl = this.getTableElement(winningTable);
    if (!tableEl) return;
    const tableRect = tableEl.getBoundingClientRect();

    // Spawn 3 golden payout chips flying to balance
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const startX = tableRect.left + tableRect.width / 2 + (Math.random() * 40 - 20);
        const startY = tableRect.top + tableRect.height / 2 + (Math.random() * 30 - 15);
        this.animateFlyingPayout(startX, startY, destX, destY);
      }, i * 150);
    }

    // Trigger floating +₹Win text over user balance
    setTimeout(() => {
      this.showFloatingWinText(userBox, winAmount);
    }, 450);
  }

  flyWinningChipsToAiPlayers(winningTable) {
    const tableEl = this.getTableElement(winningTable);
    if (!tableEl) return;
    const tableRect = tableEl.getBoundingClientRect();

    for (let i = 1; i <= 3; i++) {
      if (Math.random() > 0.4) {
        const avatarEl = document.querySelector(`.player-stack-item:nth-child(${i === 1 ? 1 : i === 2 ? 3 : 5}) .stack-avatar`);
        if (avatarEl) {
          const destRect = avatarEl.getBoundingClientRect();
          const destX = destRect.left + destRect.width / 2;
          const destY = destRect.top + destRect.height / 2;
          const startX = tableRect.left + tableRect.width / 2;
          const startY = tableRect.top + tableRect.height / 2;

          this.animateFlyingPayout(startX, startY, destX, destY);
          const aiWin = Math.floor(Math.random() * 800) + 200;
          setTimeout(() => {
            this.showFloatingWinText(avatarEl.parentElement, aiWin);
          }, 350);
        }
      }
    }
  }

  animateFlyingPayout(startX, startY, endX, endY) {
    if (!this.overlay) return;
    const chip = document.createElement('div');
    chip.className = 'flying-chip-particle payout-particle';
    chip.innerHTML = `<img src="./assets/chips/10.svg" alt="win" />`;
    chip.style.left = `${startX - 18}px`;
    chip.style.top = `${startY - 18}px`;
    this.overlay.appendChild(chip);

    const duration = 450;
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = Math.pow(progress, 2);

      const currentX = startX + (endX - startX) * progress;
      const currentY = startY + (endY - startY) * ease;

      chip.style.left = `${currentX - 18}px`;
      chip.style.top = `${currentY - 18}px`;
      chip.style.transform = `scale(${1 - progress * 0.3}) rotate(${progress * 180}deg)`;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        chip.remove();
      }
    };

    requestAnimationFrame(step);
  }

  showFloatingWinText(targetEl, amount) {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const floatText = document.createElement('div');
    floatText.className = 'floating-win-amount';
    floatText.innerText = `+₹${amount.toLocaleString('en-IN')}`;
    floatText.style.left = `${rect.left + rect.width / 2}px`;
    floatText.style.top = `${rect.top}px`;

    document.body.appendChild(floatText);

    setTimeout(() => {
      floatText.remove();
    }, 1400);
  }

  clearAllTableChips() {
    ['down', 'seven', 'up'].forEach(t => {
      this.tableChips[t].forEach(({ el }) => {
        if (el && el.parentNode) el.remove();
      });
      this.tableChips[t] = [];
    });
  }

  getTableElement(targetTable) {
    if (targetTable === 'seven') return document.getElementById('btnBetSeven');
    if (targetTable === 'down') return document.getElementById('btnBetDown');
    if (targetTable === 'up') return document.getElementById('btnBetUp');
    return null;
  }
}

export const chipAnimationManager = new ChipAnimationManager();
