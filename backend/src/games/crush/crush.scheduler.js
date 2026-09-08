const { crushEngine } = require('./crush.engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const logger = require('../../utils/logger');

/**
 * Crush game worker (sec 22, 26, 47).
 *
 * - A single async loop (no overlapping setInterval): each cycle owns its full
 *   lifecycle create -> open -> fly -> crash -> settle -> pause.
 * - Distributed leader lock: in a multi-instance deployment only ONE server runs the
 *   Crush loop; the others idle and re-poll. If the DB is not ready we fail closed and
 *   never create rounds.
 * - Auto-cashout is enforced server-side every tick (sec 26) using the engine's
 *   authoritative multiplier — no client participation.
 * - On startup we recover rounds orphaned by a previous process (sec 22/24).
 */

const GAME_ID = 'crush';
const BETTING_WINDOW_MS = 10000;
const TICK_MS = 200;
const INTER_ROUND_PAUSE_MS = 4000;
const LEADER_POLL_MS = 2000;

let isRunning = false;
let loopPromise = null;
const leaderLock = new GameLeaderLock(GAME_ID);

/** Interruptible sleep so graceful shutdown is responsive (never blocks > step). */
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
  const round = await crushEngine.createRound();
  await crushEngine.openBetting();

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
    io.emit('crush:round_open', { ...round, serverSeed: undefined });
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

  await crushEngine.startFlying();

  // Fly using the engine's authoritative clock until the committed crash point.
  while (isRunning && !crushEngine.isCrashed()) {
    const mult = crushEngine.getCurrentMultiplier();
    round.currentMultiplier = mult;

    // sec 26: enforce auto-cashout every tick. Failures are logged but do not stop
    // the flight; the crash settlement acts as a safety net for any missed target.
    try {
      const cashed = await crushEngine.processAutoCashouts();
      if (io && cashed && cashed.length) {
        io.emit('crush:auto_cashout', { roundId: round.roundId, cashouts: cashed });
      }
    } catch (err) {
      logger.error('Crush auto-cashout tick failed', { roundId: round.roundId, error: err.message });
    }

    if (io) {
      io.emit('crush:tick', { roundId: round.roundId, multiplier: mult });
    }

    if (crushEngine.isCrashed()) break;
    await sleep(TICK_MS);
  }

  if (!isRunning) return;

  // sec 24: crashRound() settles and RETHROWS on failure. If it throws, the outer
  // loop handler logs it and the round stays CRASHED — recovery settles it next boot.
  const crashedRound = await crushEngine.crashRound();

  if (io) {
    io.emit('GAME_RESULT', {
      version: 1,
      gameId: GAME_ID,
      roundId: round.roundId,
      serverTime: new Date().toISOString(),
      payload: { crashPoint: crashedRound.crashPoint, serverSeed: crashedRound.serverSeed, serverSeedHash: crashedRound.serverSeedHash },
    });
    io.emit('crush:crashed', { roundId: round.roundId, crashPoint: crashedRound.crashPoint });
  }

  await sleep(INTER_ROUND_PAUSE_MS);
}

async function schedulerLoop(io) {
  // Recover orphaned rounds from a previous process before scheduling new ones.
  try {
    await crushEngine.recoverFromDb();
  } catch (err) {
    logger.error('Crush startup recovery failed', { error: err.message });
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
      logger.error('Error in Crush game loop cycle', { error: err.message });
      await sleep(5000);
    }
  }
}

function startScheduler(io = null) {
  if (isRunning) return;
  isRunning = true;
  logger.info('Starting Crush game worker loop');
  loopPromise = schedulerLoop(io);
}

async function stopScheduler() {
  isRunning = false;
  await leaderLock.release();
  if (loopPromise) {
    try { await loopPromise; } catch (_) { /* loop already logs its own errors */ }
    loopPromise = null;
  }
  logger.info('Stopped Crush game worker loop');
}

module.exports = {
  startScheduler,
  stopScheduler,
  isWorkerRunning: () => isRunning,
};
