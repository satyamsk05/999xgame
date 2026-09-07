const { sevenUpDownEngine, RoundStatus } = require('./engine');
const logger = require('../../utils/logger');

let schedulerInterval = null;
let isLoopRunning = false;

/**
 * Continuous 25-Second Game Loop for 7 Up Down:
 * 1. Create Round & Open Betting (15s betting window)
 * 2. Close Betting & Roll Dice (2s calculation/reveal)
 * 3. Settle Round & Credit Winners (3s payout)
 * 4. Next Round
 */
async function runGameCycle(io = null) {
  if (isLoopRunning) return;
  isLoopRunning = true;

  try {
    // 1. Check/Recover or Create active round
    let round = await sevenUpDownEngine.getOrStartCurrentRound();
    
    if (io) {
      io.emit('7ud:round_open', {
        roundId: round.roundId,
        serverSeedHash: round.serverSeedHash,
        bettingDurationSeconds: 15,
        status: RoundStatus.BETTING_OPEN,
      });
    }

    // 15 seconds betting window
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // 2. Close betting and roll dice
    round = await sevenUpDownEngine.closeBettingAndRoll();

    if (io) {
      io.emit('7ud:dice_rolled', {
        roundId: round.roundId,
        dice1: round.dice1,
        dice2: round.dice2,
        diceSum: round.diceSum,
        winningBetType: round.winningBetType,
        serverSeed: round.serverSeed,
      });
    }

    // 2 seconds animation buffer
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Settle round and credit winners
    const result = await sevenUpDownEngine.settleRound();

    if (io) {
      io.emit('7ud:round_settled', {
        roundId: round.roundId,
        winningBetType: round.winningBetType,
        settlements: result.settlements,
      });
    }

    // 3 seconds pause before next round
    await new Promise((resolve) => setTimeout(resolve, 3000));

  } catch (err) {
    logger.error('Error in 7 Up Down game loop cycle', { error: err.message });
  } finally {
    isLoopRunning = false;
  }
}

function startScheduler(io = null) {
  if (schedulerInterval) return;
  logger.info('Starting 7 Up Down Server Continuous Game Loop Scheduler (25s cycle)');

  // Try DB recovery first
  sevenUpDownEngine.recoverActiveRoundFromDb().catch((err) => {
    logger.error('Failed to recover active round from DB', { error: err.message });
  });

  // Run first cycle immediately
  runGameCycle(io);

  // Repeat cycle continuously
  schedulerInterval = setInterval(() => {
    runGameCycle(io);
  }, 22000);
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Stopped 7 Up Down Game Loop Scheduler');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runGameCycle,
};
