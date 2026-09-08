const { sevenUpDownEngine, RoundStatus } = require('./engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const logger = require('../../utils/logger');

/**
 * 7 Up Down game worker (sec 22, 47).
 *
 * A single async loop owns each full cycle (open -> bet -> roll -> settle -> pause);
 * there is NO overlapping setInterval. A PostgreSQL advisory leader lock guarantees
 * only ONE instance runs this game in a multi-instance deployment, and the loop fails
 * closed (idles) whenever the database is not ready. Orphaned rounds from a previous
 * process are recovered deterministically on startup.
 */

const GAME_ID = 'seven_up_down';
const BETTING_WINDOW_MS = 15000;
const REVEAL_BUFFER_MS = 2000;
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

async function runGameCycle(io = null) {
  let round = await sevenUpDownEngine.getOrStartCurrentRound();

  if (io) {
    io.emit('GAME_ROUND_OPEN', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      payload: { roundId: round.roundId, serverSeedHash: round.serverSeedHash, status: RoundStatus.BETTING_OPEN },
    });
    io.emit('7ud:round_open', {
      roundId: round.roundId,
      serverSeedHash: round.serverSeedHash,
      bettingDurationSeconds: BETTING_WINDOW_MS / 1000,
      status: RoundStatus.BETTING_OPEN,
    });
  }

  await sleep(BETTING_WINDOW_MS);
  if (!isRunning) return;

  // Close betting & roll the dice from the committed seed (deterministic, provably fair).
  round = await sevenUpDownEngine.closeBettingAndRoll();

  if (io) {
    io.emit('GAME_BETTING_CLOSED', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
    });
    io.emit('GAME_RESULT', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      payload: {
        dice1: round.dice1,
        dice2: round.dice2,
        diceSum: round.diceSum,
        winningBetType: round.winningBetType,
        serverSeed: round.serverSeed,
        serverSeedHash: round.serverSeedHash,
      },
    });
    io.emit('7ud:dice_rolled', {
      roundId: round.roundId,
      dice1: round.dice1,
      dice2: round.dice2,
      diceSum: round.diceSum,
      winningBetType: round.winningBetType,
      serverSeed: round.serverSeed,
    });
  }

  await sleep(REVEAL_BUFFER_MS);
  if (!isRunning) return;

  // Settle atomically. A failure throws -> logged by the loop handler; the round stays
  // unresolved and startup recovery settles it deterministically on the next boot.
  const result = await sevenUpDownEngine.settleRound();

  if (io) {
    io.emit('GAME_ROUND_SETTLED', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      payload: result,
    });
    io.emit('7ud:round_settled', {
      roundId: round.roundId,
      winningBetType: round.winningBetType,
      settlements: result.settlements,
    });
  }

  await sleep(INTER_ROUND_PAUSE_MS);
}

async function schedulerLoop(io) {
  // Recover orphaned rounds from a previous process before scheduling new ones.
  try {
    await sevenUpDownEngine.recoverFromDb();
  } catch (err) {
    logger.error('7 Up Down startup recovery failed', { error: err.message });
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
      logger.error('Error in 7 Up Down game loop cycle', { error: err.message });
      await sleep(5000);
    }
  }
}

function startScheduler(io = null) {
  if (isRunning) return;
  isRunning = true;
  logger.info('Starting 7 Up Down game worker loop');
  loopPromise = schedulerLoop(io);
}

async function stopScheduler() {
  isRunning = false;
  await leaderLock.release();
  if (loopPromise) {
    try { await loopPromise; } catch (_) { /* loop logs its own errors */ }
    loopPromise = null;
  }
  logger.info('Stopped 7 Up Down game worker loop');
}

module.exports = {
  startScheduler,
  stopScheduler,
  runGameCycle,
  isWorkerRunning: () => isRunning,
};
