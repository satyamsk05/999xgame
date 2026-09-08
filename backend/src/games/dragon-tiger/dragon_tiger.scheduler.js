const { dragonTigerEngine } = require('./dragon_tiger.engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const logger = require('../../utils/logger');

const GAME_ID = 'dragon_tiger';
const BETTING_WINDOW_MS = 15000;
const REVEAL_BUFFER_MS = 3000;
const INTER_ROUND_PAUSE_MS = 3000;
const LEADER_POLL_MS = 2000;

let isRunning = false;
let loopPromise = null;
const leaderLock = new GameLeaderLock(GAME_ID);

function sleep(ms) {
  return new Promise((resolve) => {
    const step = 200;
    let waited = 0;
    const timer = setInterval(() => {
      waited += step;
      if (!isRunning || waited >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, step);
  });
}

async function recoverRounds() {
  try {
    await dragonTigerEngine.recoverFromDb();
  } catch (err) {
    logger.error('Dragon Tiger recovery failed after leader acquisition', { error: err.message });
  }
}

async function runGameCycle(io) {
  const round = await dragonTigerEngine.createRound();
  await dragonTigerEngine.openBetting();

  if (io) {
    io.emit('GAME_ROUND_OPEN', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      bettingClosesAt: round.bettingClosesAt,
      timeRemainingMs: BETTING_WINDOW_MS,
      payload: { ...round, serverSeed: undefined },
    });
    io.emit('dt:round_open', { ...round, serverSeed: undefined });
  }

  await sleep(BETTING_WINDOW_MS);
  if (!isRunning) return;

  if (io) {
    io.emit('GAME_BETTING_CLOSED', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
    });
  }

  const resultRound = await dragonTigerEngine.drawCardsAndReveal();

  if (io) {
    io.emit('GAME_RESULT', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      payload: {
        dragonCard: resultRound.dragonCard,
        tigerCard: resultRound.tigerCard,
        winningBetType: resultRound.winningBetType,
        serverSeed: resultRound.serverSeed,
        serverSeedHash: resultRound.serverSeedHash,
      },
    });
    io.emit('dt:cards_dealt', resultRound);
  }

  await sleep(REVEAL_BUFFER_MS);
  if (!isRunning) return;

  const settlement = await dragonTigerEngine.settleRound();

  if (io) {
    io.emit('GAME_ROUND_SETTLED', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      payload: settlement,
    });
    io.emit('dt:round_settled', settlement);
  }

  await sleep(INTER_ROUND_PAUSE_MS);
}

async function schedulerLoop(io) {
  let wasLeader = false;

  while (isRunning) {
    try {
      const isLeader = await leaderLock.acquire();
      if (!isLeader || !isDatabaseReady()) {
        wasLeader = false;
        await sleep(LEADER_POLL_MS);
        continue;
      }

      // Recover any round left by a failed previous leader before creating a new one.
      if (!wasLeader) {
        await recoverRounds();
        wasLeader = true;
      }

      await runGameCycle(io);
    } catch (err) {
      wasLeader = false;
      logger.error('Error in Dragon Tiger game loop cycle', { error: err.message });
      await sleep(5000);
    }
  }
}

function startScheduler(io = null) {
  if (isRunning) return;
  isRunning = true;
  logger.info('Starting Dragon Tiger game worker loop');
  loopPromise = schedulerLoop(io);
}

async function stopScheduler() {
  isRunning = false;
  await leaderLock.release();
  if (loopPromise) {
    try { await loopPromise; } catch (_) { /* loop logs its own errors */ }
    loopPromise = null;
  }
  logger.info('Stopped Dragon Tiger game worker loop');
}

module.exports = {
  startScheduler,
  stopScheduler,
  isWorkerRunning: () => isRunning,
};
