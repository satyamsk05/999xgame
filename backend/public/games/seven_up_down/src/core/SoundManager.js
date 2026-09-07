import { getStoredSoundPreference, setStoredSoundPreference } from '../utils/storage.js';

class SoundManager {
  constructor() {
    this.enabled = getStoredSoundPreference();
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && this.enabled) {
      try {
        this.ctx.resume();
      } catch (_) {}
    }
  }

  unlockAudio() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        this.ctx.resume();
      } catch (_) {}
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    setStoredSoundPreference(this.enabled);
    if (!this.enabled) {
      this.stopAll();
    } else {
      this.resume();
    }
    return this.enabled;
  }

  stopAll() {
    if (this.ctx && typeof this.ctx.suspend === 'function') {
      try {
        if (this.ctx.state !== 'suspended') {
          this.ctx.suspend();
        }
      } catch (_) {}
    }
  }

  resume() {
    if (this.ctx && this.enabled && typeof this.ctx.resume === 'function') {
      try {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      } catch (_) {}
    }
  }

  playClick() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {}
  }

  playDiceRoll() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // 1. Generate multi-burst dice clacks simulating plastic dice shaking in dome
      const numClacks = 12;
      for (let i = 0; i < numClacks; i++) {
        const clackTime = now + (i * 0.11) + (Math.random() * 0.03);
        
        // Fast noise click (dice impact texture)
        const bufferSize = this.ctx.sampleRate * 0.02;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let j = 0; j < bufferSize; j++) {
          data[j] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800 + Math.random() * 1200;
        filter.Q.value = 3.0;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.35, clackTime);
        gain.gain.exponentialRampToValueAtTime(0.001, clackTime + 0.02);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(clackTime);

        // Resonant wood/plastic pop underneath noise
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        const startFreq = 450 + Math.random() * 250;
        osc.frequency.setValueAtTime(startFreq, clackTime);
        osc.frequency.exponentialRampToValueAtTime(120, clackTime + 0.025);

        oscGain.gain.setValueAtTime(0.25, clackTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, clackTime + 0.025);

        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);

        osc.start(clackTime);
        osc.stop(clackTime + 0.025);
      }

      // 2. Final landing thud sound when dice land (at ~1.4s)
      const landTime = now + 1.35;
      const thud = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(160, landTime);
      thud.frequency.exponentialRampToValueAtTime(40, landTime + 0.12);

      thudGain.gain.setValueAtTime(0.5, landTime);
      thudGain.gain.exponentialRampToValueAtTime(0.001, landTime + 0.12);

      thud.connect(thudGain);
      thudGain.connect(this.ctx.destination);
      thud.start(landTime);
      thud.stop(landTime + 0.12);

    } catch (e) {}
  }

  playWin() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

          gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.25);
        }, idx * 120);
      });
    } catch (e) {}
  }
}

export const soundManager = new SoundManager();
if (typeof window !== 'undefined') {
  window.soundManager = soundManager;
}
