const { sevenUpDownEngine, RoundStatus } = require('./engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const { emit: emitRealtime } = require('../../services/realtime.service');
const logger = require('../../utils/logger');

const GAME_ID = 'seven_up_down';
const BETTING_WINDOW_MS = 15000;
const REVEAL_BUFFER_MS = 2000;
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
      if (!isRunning || waited >= ms) { clearInterval(timer); resolve(); }
    }, step);
  });
}

async function recoverRounds() {
  try { await sevenUpDownEngine.recoverFromDb(); }
  catch (err) { logger.error('7 Up Down recovery failed after leader acquisition', { error: err.message }); }
}

async function runGameCycle(io = null) {
  let round = await sevenUpDownEngine.getOrStartCurrentRound();
  if (io) {
    emitRealtime('GAME_ROUND_OPEN', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { roundId: round.roundId, serverSeedHash: round.serverSeedHash, status: RoundStatus.BETTING_OPEN } });
    emitRealtime('7ud:round_open', { roundId: round.roundId, serverSeedHash: round.serverSeedHash, bettingDurationSeconds: BETTING_WINDOW_MS / 1000, status: RoundStatus.BETTING_OPEN });
  }
  await sleep(BETTING_WINDOW_MS);
  if (!isRunning) return;
  round = await sevenUpDownEngine.closeBettingAndRoll();
  if (io) {
    emitRealtime('GAME_BETTING_CLOSED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString() });
    emitRealtime('GAME_RESULT', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { dice1: round.dice1, dice2: round.dice2, diceSum: round.diceSum, winningBetType: round.winningBetType, serverSeed: round.serverSeed, serverSeedHash: round.serverSeedHash } });
    emitRealtime('7ud:dice_rolled', { roundId: round.roundId, dice1: round.dice1, dice2: round.dice2, diceSum: round.diceSum, winningBetType: round.winningBetType, serverSeed: round.serverSeed });
  }
  await sleep(REVEAL_BUFFER_MS);
  if (!isRunning) return;
  const result = await sevenUpDownEngine.settleRound();
  const publicSettlement = { roundId: round.roundId, winningBetType: round.winningBetType, settledAt: result.round.endedAt };
  if (io) {
    emitRealtime('GAME_ROUND_SETTLED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: publicSettlement });
    emitRealtime('7ud:round_settled', publicSettlement);
  }
  await sleep(INTER_ROUND_PAUSE_MS);
}

async function schedulerLoop(io) {
  let wasLeader = false;
  while (isRunning) {
    try {
      const isLeader = await leaderLock.acquire();
      if (!isLeader || !isDatabaseReady()) { wasLeader = false; await sleep(LEADER_POLL_MS); continue; }
      if (!wasLeader) { await recoverRounds(); wasLeader = true; }
      await runGameCycle(io);
    } catch (err) {
      wasLeader = false;
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
  if (loopPromise) { try { await loopPromise; } catch (_) {} loopPromise = null; }
  logger.info('Stopped 7 Up Down game worker loop');
}

module.exports = { startScheduler, stopScheduler, runGameCycle, isWorkerRunning: () => isRunning };