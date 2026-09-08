const { dragonTigerEngine } = require('./dragon_tiger.engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const logger = require('../../utils/logger');

/**
 * Dragon Tiger game worker (sec 22, 23, 47).
 *
 * Single async loop (no overlapping timers) owning each full cycle. A PostgreSQL
 * advisory leader lock ensures only ONE instance runs this game across a fleet, and
 * the loop fails closed (idles) when the DB is not ready. Orphaned rounds from a
 * previous process are recovered deterministically on startup.
 */

const GAME_ID = 'dragon_tiger';
const BETTING_WINDOW_MS = 15000;
const REVEAL_BUFFER_MS = 3000;
const INTER_ROUND_PAUSE_MS = 3000;
const LEADER_POLL_MS = 2000;

let isRunning = false;
let loopPromise = null;
const leaderLock = new GameLeaderLock(GAME_ID);

/** Interruptible sleep so graceful shutdown is responsive. */
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

  // Draw cards & reveal the committed result (deterministic from the server seed).
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

  // Settle atomically (sec 23). A failure throws -> logged; recovery settles next boot.
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
  // Recover orphaned rounds from a previous process before scheduling new ones.
  try {
    await dragonTigerEngine.recoverFromDb();
  } catch (err) {
    logger.error('Dragon Tiger startup recovery failed', { error: err.message });
  }

  while (isRunning) {
    try {
      const isLeader = await leaderLock.acquire();
      if (!isLeader || !isDatabaseReady()) {
        // Not leader, or DB not ready: idle and re-poll. NEVER create rounds here.
        await sleep(LEADER_POLL_MS);
        continue;
      }
      await runGameCycle(io);
    } catch (err) {
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
