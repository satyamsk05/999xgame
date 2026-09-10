const { sevenUpDownEngine, RoundStatus } = require('./engine');
const { GameLeaderLock } = require('../scheduler.lock');
const { isDatabaseReady } = require('../../database/db');
const { emit: emitRealtime, emitToUser } = require('../../services/realtime.service');
const walletRepo = require('../../wallet/wallet.repository');
const logger = require('../../utils/logger');

const GAME_ID = 'seven_up_down';
const BETTING_WINDOW_MS = 15000;
const REVEAL_BUFFER_MS = 2000;
const INTER_ROUND_PAUSE_MS = 3000;
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

async function recoverRounds() {
  await sevenUpDownEngine.recoverFromDb();
}

async function runGameCycle(io = null) {
  if (!(await leaderLock.assertLeadership())) return false;
  let round = await sevenUpDownEngine.getOrStartCurrentRound();
  if (io) {
    emitRealtime('GAME_ROUND_OPEN', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { roundId: round.roundId, serverSeedHash: round.serverSeedHash, status: RoundStatus.BETTING_OPEN } });
    emitRealtime('7ud:round_open', { roundId: round.roundId, serverSeedHash: round.serverSeedHash, bettingDurationSeconds: BETTING_WINDOW_MS / 1000, status: RoundStatus.BETTING_OPEN });
  }
  if (!(await leaderSleep(BETTING_WINDOW_MS))) return false;
  round = await sevenUpDownEngine.closeBettingAndRoll();
  if (io) {
    emitRealtime('GAME_BETTING_CLOSED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString() });
    emitRealtime('GAME_RESULT', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: { dice1: round.dice1, dice2: round.dice2, diceSum: round.diceSum, winningBetType: round.winningBetType, serverSeed: round.serverSeed, serverSeedHash: round.serverSeedHash } });
    emitRealtime('7ud:dice_rolled', { roundId: round.roundId, dice1: round.dice1, dice2: round.dice2, diceSum: round.diceSum, winningBetType: round.winningBetType, serverSeed: round.serverSeed });
  }
  if (!(await leaderSleep(REVEAL_BUFFER_MS))) return false;
  const result = await sevenUpDownEngine.settleRound();
  const publicSettlement = { roundId: round.roundId, winningBetType: round.winningBetType, settledAt: result.round.endedAt };
  if (io) {
    emitRealtime('GAME_ROUND_SETTLED', { version: 1, gameId: GAME_ID, roundId: round.roundId, serverTime: new Date().toISOString(), payload: publicSettlement });
    emitRealtime('7ud:round_settled', publicSettlement);

    if (result.settlements && result.settlements.length > 0) {
      for (const settlement of result.settlements) {
        try {
          const wallet = await walletRepo.getWalletByUserId(settlement.userId);
          const totalBal = wallet ? (wallet.totalBalance !== undefined ? wallet.totalBalance : (wallet.available_balance || 0) / 100) : 0;
          const userPayload = {
            roundId: round.roundId,
            betId: settlement.betId,
            betType: settlement.betType,
            isWinner: settlement.isWinner,
            winAmount: settlement.winAmountPaise / 100,
            winAmountPaise: settlement.winAmountPaise,
            wallet: wallet,
            totalBalance: totalBal
          };
          emitToUser(settlement.userId, 'BET_SETTLED', userPayload);
          emitToUser(settlement.userId, 'GAME_ROUND_SETTLED', userPayload);
          emitToUser(settlement.userId, 'WALLET_UPDATED', {
            userId: settlement.userId,
            balance: totalBal,
            totalBalance: totalBal,
            wallet: wallet
          });
        } catch (err) {
          logger.error('Failed to emit settlement to user', { userId: settlement.userId, error: err.message });
        }
      }
    }
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
      logger.error('Error in 7 Up Down game loop cycle', { error: err.message, code: err.code });
      await wait(5000);
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