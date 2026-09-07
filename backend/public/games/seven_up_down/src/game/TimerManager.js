import { gameState } from './GameState.js';
import { eventBus } from '../core/EventBus.js';

class TimerManager {
  constructor() {
    this.intervalId = null;
  }

  startTimer(durationSeconds = 15, onTimerExpire) {
    this.stopTimer();
    const maxDuration = durationSeconds;
    gameState.roundTimeLeft = durationSeconds;
    eventBus.emit('TIMER_TICK', { timeLeft: gameState.roundTimeLeft, max: maxDuration });

    this.intervalId = setInterval(() => {
      if (!gameState.isRolling) {
        gameState.roundTimeLeft--;
        eventBus.emit('TIMER_TICK', { timeLeft: Math.max(0, gameState.roundTimeLeft), max: maxDuration });

        if (gameState.roundTimeLeft <= 0) {
          this.stopTimer();
          if (onTimerExpire) onTimerExpire();
        }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const timerManager = new TimerManager();
