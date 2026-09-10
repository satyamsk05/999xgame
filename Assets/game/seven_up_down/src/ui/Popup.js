import { eventBus } from '../core/EventBus.js';
import { gameState } from '../game/GameState.js';
import { soundManager } from '../core/SoundManager.js';
import { CHIP_GRADIENTS, CHIP_SVGS } from '../config/constants.js';
import { formatCurrency } from '../utils/formatter.js';

const ALL_CHIPS = [10, 50, 100, 500, 1000, 5000];

function getChipSvgPath(val) {
  if (CHIP_SVGS && CHIP_SVGS[val]) return CHIP_SVGS[val];
  const label = val >= 1000 ? (val / 1000) + 'K' : val;
  return `./assets/chips/${label}.svg`;
}

export class Popup {
  constructor(winToastEl, chipPopupEl, mainChipFaceEl, mainChipBtnEl) {
    this.winToastEl = winToastEl;
    this.chipPopupEl = chipPopupEl;
    this.mainChipFaceEl = mainChipFaceEl;
    this.mainChipBtnEl = mainChipBtnEl;
    this.selectedChip = 10;
    this.init();
  }

  init() {
    // Explicitly set default chip 10 on load
    gameState.setSelectedChip(10, CHIP_GRADIENTS[10] || '#00e676');

    eventBus.on('WIN_OCCURRED', ({ winAmount }) => {
      this.showWinToast(winAmount);
    });

    if (this.mainChipBtnEl) {
      this.mainChipBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playClick();
        if (this.chipPopupEl) {
          this.renderPopupChips();
          this.chipPopupEl.classList.toggle('active');
        }
      });
    }

    this.setupPopupChips();
    this.renderPopupChips();

    // Close chip popup on outside click
    document.addEventListener('click', (e) => {
      if (this.chipPopupEl && !this.chipPopupEl.contains(e.target) && this.mainChipBtnEl && !this.mainChipBtnEl.contains(e.target)) {
        this.chipPopupEl.classList.remove('active');
      }
    });

    eventBus.on('CHIP_CHANGED', ({ value, color }) => {
      this.selectedChip = value;
      if (this.mainChipFaceEl) {
        const svgPath = getChipSvgPath(value);
        this.mainChipFaceEl.innerHTML = `<img src="${svgPath}" id="mainChipImg" alt="${value}" style="width:100%;height:100%;object-fit:contain;" />`;
        this.mainChipFaceEl.style.background = 'none';
        this.mainChipFaceEl.style.border = 'none';
      }
      this.renderPopupChips();
    });
  }

  setupPopupChips() {
    if (!this.chipPopupEl) return;
    const popChips = this.chipPopupEl.querySelectorAll('.pop-chip');
    popChips.forEach(chipEl => {
      chipEl.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playClick();
        const chipVal = parseInt(chipEl.getAttribute('data-val'), 10);
        if (chipVal) {
          const color = CHIP_GRADIENTS[chipVal] || '#00e676';
          gameState.setSelectedChip(chipVal, color);
          this.chipPopupEl.classList.remove('active');
        }
      });
    });
  }

  renderPopupChips() {
    if (!this.chipPopupEl) return;
    const otherChips = ALL_CHIPS.filter(c => c !== this.selectedChip);
    const popChips = this.chipPopupEl.querySelectorAll('.pop-chip');

    otherChips.forEach((val, idx) => {
      if (popChips[idx]) {
        const chipEl = popChips[idx];
        const label = val >= 1000 ? (val / 1000) + 'K' : val;
        chipEl.setAttribute('data-val', val.toString());
        const imgEl = chipEl.querySelector('img');
        const newSrc = getChipSvgPath(val);
        if (imgEl) {
          if (imgEl.getAttribute('src') !== newSrc) {
            imgEl.setAttribute('src', newSrc);
          }
          imgEl.setAttribute('alt', `${label} Chip`);
        } else {
          chipEl.innerHTML = `<img src="${newSrc}" alt="${label} Chip" />`;
        }
      }
    });
  }

  showWinToast(winAmount) {
    if (!this.winToastEl) return;
    this.winToastEl.innerText = `🎉 YOU WON ${formatCurrency(winAmount)}!`;
    this.winToastEl.classList.add('show');
    setTimeout(() => {
      this.winToastEl.classList.remove('show');
    }, 2500);
  }
}

