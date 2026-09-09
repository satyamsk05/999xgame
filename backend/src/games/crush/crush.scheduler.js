const { crushEngine } = require('./crush.engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const { emit: emitRealtime } = require('../../services/realtime.service');
const logger = require('../../utils/logger');

const GAME_ID = 'crush';
const BETTING_WINDOW_MS = 10000;
const TICK_MS = 200;
const LEADERSHIP_CHECK_MS = 1000;
const INTER_ROUND_PAUSE_MS = 4000;
const LEADER_POLL_MS = 2000;

let isRunning = false;
let loopPromise = null;
const leaderLock = new GameLeaderLock(GAME_ID);

async function wait(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function leaderSleep(ms) {
  const deadline = Date.now() + ms;
  while (isRunning && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await wait(Math.min(1000, remaining));
    if (isRunning && !(await leaderLock.assertLeadership())) return false;
  }
  return isRunning && leaderLock.isLeader;
}

function publicBettingRound(round) {
  return {
    roundId: round.roundId,
    gameId: GAME_ID,
    status: round.status,
    serverSeedHash: round.serverSeedHash,
    currentMultiplier: round.currentMultiplier,
    createdAt: round.createdAt,
    bettingClosesAt: round.bettingClosesAt,
    endedAt: null,
  };
}

async function recoverRounds() {
  await crushEngine.recoverFromDb();
}

async function runGameCycle(io) {
  if (!(await leaderLock.assertLeadership())) return false;
  const round = await crushEngine.createRound();
  await crushEngine.openBetting();
  if (io) {
    const safeRound = publicBettingRound(round);
    emitRealtime('GAME_ROUND_OPEN', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), bettingClosesAt: round.bettingClosesAt, timeRemainingMs: BETTING_WINDOW_MS, payload: safeRound });
    emitRealtime('crush:round_open', safeRound);
  }
  if (!(await leaderSleep(BETTING_WINDOW_MS))) return false;
  if (io) emitRealtime('GAME_BETTING_CLOSED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString() });
  await crushEngine.startFlying();

  let lastLeadershipCheck = Date.now();
  while (isRunning && !crushEngine.isCrashed()) {
    if (Date.now() - lastLeadershipCheck >= LEADERSHIP_CHECK_MS) {
      if (!(await leaderLock.assertLeadership())) return false;
      lastLeadershipCheck = Date.now();
    }
    const mult = crushEngine.getCurrentMultiplier();
    round.currentMultiplier = mult;
    try {
      const cashed = await crushEngine.processAutoCashouts();
      if (io && cashed?.length) emitRealtime('crush:auto_cashout', { roundId: round.roundId, cashouts: cashed });
    } catch (err) { logger.error('Crush auto-cashout tick failed', { roundId: round.roundId, error: err.message }); }
    if (io) emitRealtime('crush:tick', { roundId: round.roundId, multiplier: mult });
    if (crushEngine.isCrashed()) break;
    await wait(TICK_MS);
  }
  if (!isRunning || !leaderLock.isLeader) return false;
  const crashedRound = await crushEngine.crashRound();
  if (io) {
    emitRealtime('GAME_RESULT', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { crashPoint: crashedRound.crashPoint, serverSeed: crashedRound.serverSeed, serverSeedHash: crashedRound.serverSeedHash } });
    emitRealtime('crush:crashed', { roundId: round.roundId, crashPoint: crashedRound.crashPoint, serverSeed: crashedRound.serverSeed, serverSeedHash: crashedRound.serverSeedHash });
  }
  return leaderSleep(INTER_ROUND_PAUSE_MS);
}

async function schedulerLoop(io) {
  let wasLeader = false;
  while (isRunning) {
    try {
      const isLeader = await leaderLock.acquire();
      if (!isLeader || !isDatabaseReady()) { wasLeader = false; await wait(LEADER_POLL_MS); continue; }
      if (!wasLeader) { await recoverRounds(); wasLeader = true; }
      const completed = await runGameCycle(io);
      if (!completed) wasLeader = false;
    } catch (err) {
      wasLeader = false;
      logger.error('Error in Crush game loop cycle', { error: err.message, code: err.code });
      await wait(5000);
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
  if (loopPromise) { try { await loopPromise; } catch (_) {} loopPromise = null; }
  logger.info('Stopped Crush game loop');
}

module.exports = { startScheduler, stopScheduler, isWorkerRunning: () => isRunning };