import { soundManager } from '../core/SoundManager.js';

export class Header {
  constructor() {
    this.bindEvents();
    this.startPingMonitor();
  }

  bindEvents() {
    const btnSettings = document.getElementById('btnSettings');
    const settingsModal = document.getElementById('settingsModal');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const toggleSoundInput = document.getElementById('toggleSoundInput');
    const soundStatusText = document.getElementById('soundStatusText');
    const soundIconBox = document.getElementById('soundIconBox');
    const btnExitMatch = document.getElementById('btnExitMatch');

    if (btnSettings && settingsModal) {
      btnSettings.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        soundManager.playClick();
        settingsModal.classList.add('active');
      });
    }

    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        soundManager.playClick();
        settingsModal.classList.remove('active');
      });
    }

    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          soundManager.playClick();
          settingsModal.classList.remove('active');
        }
      });
    }

    if (toggleSoundInput) {
      toggleSoundInput.addEventListener('change', () => {
        const enabled = soundManager.toggle();
        soundManager.playClick();
        if (soundStatusText) {
          soundStatusText.textContent = enabled ? 'Sound is Enabled' : 'Sound is Muted';
          soundStatusText.style.color = enabled ? '#00E676' : 'rgba(255,255,255,0.4)';
        }
        if (soundIconBox) {
          soundIconBox.innerHTML = enabled
            ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="#00E676"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`
            : `<svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
        }
      });
    }

    if (btnExitMatch) {
      const handleExit = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        soundManager.playClick();

        const payload = JSON.stringify({
          source: 'ingames-game',
          version: 1,
          type: 'EXIT_MATCH'
        });

        // 1. Flutter Mobile App WebView Native Channel
        if (window.InGamesNativeBridge && typeof window.InGamesNativeBridge.postMessage === 'function') {
          try {
            window.InGamesNativeBridge.postMessage(payload);
            return;
          } catch (_) {}
        }

        // 2. Web Iframe Parent Window
        if (window.parent && window.parent !== window) {
          try {
            window.parent.postMessage(payload, '*');
            return;
          } catch (_) {}
        }

        // 3. Fallback browser back
        try {
          window.history.back();
        } catch (_) {}
      };

      btnExitMatch.addEventListener('click', handleExit);
    }
  }

  startPingMonitor() {
    const pingPill = document.getElementById('headerPingPill');
    const pingText = document.getElementById('pingValText');

    const updatePing = async () => {
      const startTime = performance.now();
      try {
        await fetch('/health', { cache: 'no-store' });
        const latency = Math.round(performance.now() - startTime);
        if (pingText) pingText.textContent = `${latency}ms`;
        if (pingPill) {
          if (latency < 120) {
            pingPill.style.color = '#00E676';
            pingPill.style.borderColor = '#00E676';
          } else if (latency < 280) {
            pingPill.style.color = '#FFB74D';
            pingPill.style.borderColor = '#FFB74D';
          } else {
            pingPill.style.color = '#EF4444';
            pingPill.style.borderColor = '#EF4444';
          }
        }
      } catch (_) {
        if (pingText) pingText.textContent = '999ms';
        if (pingPill) {
          pingPill.style.color = '#EF4444';
          pingPill.style.borderColor = '#EF4444';
        }
      }
    };

    updatePing();
    setInterval(updatePing, 3000);
  }
}
