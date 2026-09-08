const { crushEngine } = require('./crush.engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const logger = require('../../utils/logger');

const GAME_ID = 'crush';
const BETTING_WINDOW_MS = 10000;
const TICK_MS = 200;
const INTER_ROUND_PAUSE_MS = 4000;
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
    await crushEngine.recoverFromDb();
  } catch (err) {
    logger.error('Crush recovery failed after leader acquisition', { error: err.message });
  }
}

async function runGameCycle(io) {
  const round = await crushEngine.createRound();
  await crushEngine.openBetting();

  if (io) {
    io.emit('GAME_ROUND_OPEN', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), bettingClosesAt: round.bettingClosesAt, timeRemainingMs: BETTING_WINDOW_MS, payload: { ...round, serverSeed: undefined } });
    io.emit('crush:round_open', { ...round, serverSeed: undefined });
  }

  await sleep(BETTING_WINDOW_MS);
  if (!isRunning) return;

  if (io) io.emit('GAME_BETTING_CLOSED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString() });
  await crushEngine.startFlying();

  while (isRunning && !crushEngine.isCrashed()) {
    const mult = crushEngine.getCurrentMultiplier();
    round.currentMultiplier = mult;
    try {
      const cashed = await crushEngine.processAutoCashouts();
      if (io && cashed?.length) io.emit('crush:auto_cashout', { roundId: round.roundId, cashouts: cashed });
    } catch (err) {
      logger.error('Crush auto-cashout tick failed', { roundId: round.roundId, error: err.message });
    }
    if (io) io.emit('crush:tick', { roundId: round.roundId, multiplier: mult });
    if (crushEngine.isCrashed()) break;
    await sleep(TICK_MS);
  }

  if (!isRunning) return;
  const crashedRound = await crushEngine.crashRound();
  if (io) {
    io.emit('GAME_RESULT', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { crashPoint: crashedRound.crashPoint, serverSeed: crashedRound.serverSeed, serverSeedHash: crashedRound.serverSeedHash } });
    io.emit('crush:crashed', { roundId: round.roundId, crashPoint: crashedRound.crashPoint });
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

      // A new leader can inherit an orphaned round after the old process dies.
      // Recover it before creating a fresh round so accepted bets/reserves are not stranded.
      if (!wasLeader) {
        await recoverRounds();
        wasLeader = true;
      }

      await runGameCycle(io);
    } catch (err) {
      wasLeader = false;
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
    try { await loopPromise; } catch (_) { /* loop logs its own errors */ }
    loopPromise = null;
  }
  logger.info('Stopped Crush game loop');
}

module.exports = { startScheduler, stopScheduler, isWorkerRunning: () => isRunning };
