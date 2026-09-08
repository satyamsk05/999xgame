const { dragonTigerEngine, RoundStatus } = require('./dragon_tiger.engine');
const logger = require('../../utils/logger');

let schedulerTimeout = null;
let isRunning = false;

async function runLoop(io = null) {
  if (!isRunning) return;

  try {
    const round = await dragonTigerEngine.createRound();
    await dragonTigerEngine.openBetting();

    if (io) {
      io.emit('GAME_ROUND_OPEN', {
        version: 1,
        gameId: 'dragon_tiger',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
        bettingClosesAt: round.bettingClosesAt,
        timeRemainingMs: 15000,
        payload: round,
      });
      io.emit('dt:round_open', round);
    }

    // 15 seconds betting window
    await new Promise((resolve) => setTimeout(resolve, 15000));
    if (!isRunning) return;

    if (io) {
      io.emit('GAME_BETTING_CLOSED', {
        version: 1,
        gameId: 'dragon_tiger',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
      });
    }

    // Draw cards & reveal result
    const resultRound = await dragonTigerEngine.drawCardsAndReveal();

    if (io) {
      io.emit('GAME_RESULT', {
        version: 1,
        gameId: 'dragon_tiger',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
        payload: {
          dragonCard: resultRound.dragonCard,
          tigerCard: resultRound.tigerCard,
          winningBetType: resultRound.winningBetType,
        },
      });
      io.emit('dt:cards_dealt', resultRound);
    }

    // 3 seconds animation buffer
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (!isRunning) return;

    // Settle bets
    const settlement = await dragonTigerEngine.settleRound();

    if (io) {
      io.emit('GAME_ROUND_SETTLED', {
        version: 1,
        gameId: 'dragon_tiger',
        roundId: round.roundId,
        serverTime: new Date().toISOString(),
        payload: settlement,
      });
      io.emit('dt:round_settled', settlement);
    }

    // 3 seconds pause before next round
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (err) {
    logger.error('Error in Dragon Tiger game loop cycle', { error: err.message });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (isRunning) {
    schedulerTimeout = setTimeout(() => runLoop(io), 100);
  }
}

function startScheduler(io = null) {
  if (isRunning) return;
  isRunning = true;
  logger.info('Starting Dragon Tiger game worker loop');
  runLoop(io);
}

function stopScheduler() {
  isRunning = false;
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  logger.info('Stopped Dragon Tiger game worker loop');
}

module.exports = {
  startScheduler,
  stopScheduler,
  isWorkerRunning: () => isRunning,
};
