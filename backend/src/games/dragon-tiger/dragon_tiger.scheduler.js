const { dragonTigerEngine } = require('./dragon_tiger.engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const { emit: emitRealtime } = require('../../services/realtime.service');
const logger = require('../../utils/logger');

const GAME_ID = 'dragon_tiger';
const BETTING_WINDOW_MS = 15000;
const REVEAL_BUFFER_MS = 3000;
const INTER_ROUND_PAUSE_MS = 3000;
const LEADER_POLL_MS = 2000;

let isRunning = false;
let loopPromise = null;
const leaderLock = new GameLeaderLock(GAME_ID);

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function leaderSleep(ms) {
  const deadline = Date.now() + ms;
  while (isRunning && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await wait(Math.min(1000, remaining));
    if (isRunning && !(await leaderLock.assertLeadership())) return false;
  }
  return isRunning && leaderLock.isLeader;
}

async function recoverRounds() {
  try { await dragonTigerEngine.recoverFromDb(); }
  catch (err) { logger.error('Dragon Tiger recovery failed after leader acquisition', { error: err.message }); }
}

async function runGameCycle(io) {
  if (!(await leaderLock.assertLeadership())) return false;
  const round = await dragonTigerEngine.createRound();
  await dragonTigerEngine.openBetting();
  if (io) {
    emitRealtime('GAME_ROUND_OPEN', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), bettingClosesAt: round.bettingClosesAt, timeRemainingMs: BETTING_WINDOW_MS, payload: { ...round, serverSeed: undefined } });
    emitRealtime('dt:round_open', { ...round, serverSeed: undefined });
  }
  if (!(await leaderSleep(BETTING_WINDOW_MS))) return false;
  if (io) emitRealtime('GAME_BETTING_CLOSED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString() });
  const resultRound = await dragonTigerEngine.drawCardsAndReveal();
  if (io) {
    emitRealtime('GAME_RESULT', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { dragonCard: resultRound.dragonCard, tigerCard: resultRound.tigerCard, winningBetType: resultRound.winningBetType, serverSeed: resultRound.serverSeed, serverSeedHash: resultRound.serverSeedHash } });
    emitRealtime('dt:cards_dealt', resultRound);
  }
  if (!(await leaderSleep(REVEAL_BUFFER_MS))) return false;
  const settlement = await dragonTigerEngine.settleRound();
  if (io) {
    emitRealtime('GAME_ROUND_SETTLED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: settlement });
    emitRealtime('dt:round_settled', settlement);
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
      logger.error('Error in Dragon Tiger game loop cycle', { error: err.message });
      await wait(5000);
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
  if (loopPromise) { try { await loopPromise; } catch (_) {} loopPromise = null; }
  logger.info('Stopped Dragon Tiger game worker loop');
}

module.exports = { startScheduler, stopScheduler, isWorkerRunning: () => isRunning };