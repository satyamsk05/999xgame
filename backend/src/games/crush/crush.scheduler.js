const { crushEngine, RoundStatus } = require('./crush.engine');
const logger = require('../../utils/logger');

let schedulerTimeout = null;
let isRunning = false;

async function runLoop(io = null) {
  if (!isRunning) return;

  try {
    const round = await crushEngine.createRound();
    await crushEngine.openBetting();

    if (io) {
      io.emit('GAME_ROUND_OPEN', {
        version: 1,
        gameId: 'crush',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
        bettingClosesAt: round.bettingClosesAt,
        timeRemainingMs: 10000,
        payload: round,
      });
      io.emit('crush:round_open', round);
    }

    // 10 seconds betting window
    await new Promise((resolve) => setTimeout(resolve, 10000));
    if (!isRunning) return;

    if (io) {
      io.emit('GAME_BETTING_CLOSED', {
        version: 1,
        gameId: 'crush',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
      });
    }

    await crushEngine.startFlying();

    // Ascend multiplier up to crashPoint
    const targetCrashPoint = round.crashPoint;
    let currentMult = 1.00;
    const startTime = Date.now();

    while (isRunning && currentMult < targetCrashPoint) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      // Exponential curve: mult = e^(0.06 * elapsedSec)
      currentMult = parseFloat(Math.min(targetCrashPoint, Math.exp(0.06 * elapsedSec)).toFixed(2));
      round.currentMultiplier = currentMult;

      if (io) {
        io.emit('crush:tick', {
          roundId: round.roundId,
          multiplier: currentMult,
        });
      }

      if (currentMult >= targetCrashPoint) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!isRunning) return;

    // Crash rocket
    const crashedRound = await crushEngine.crashRound();

    if (io) {
      io.emit('GAME_RESULT', {
        version: 1,
        gameId: 'crush',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
        payload: {
          crashPoint: crashedRound.crashPoint,
        },
      });
      io.emit('crush:crashed', {
        roundId: round.roundId,
        crashPoint: crashedRound.crashPoint,
      });
    }

    // 4 seconds pause before next round
    await new Promise((resolve) => setTimeout(resolve, 4000));
  } catch (err) {
    logger.error('Error in Crush game loop cycle', { error: err.message });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (isRunning) {
    schedulerTimeout = setTimeout(() => runLoop(io), 100);
  }
}

function startScheduler(io = null) {
  if (isRunning) return;
  isRunning = true;
  logger.info('Starting Crush game worker loop');
  runLoop(io);
}

function stopScheduler() {
  isRunning = false;
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  logger.info('Stopped Crush game worker loop');
}

module.exports = {
  startScheduler,
  stopScheduler,
  isWorkerRunning: () => isRunning,
};
