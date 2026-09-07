const crypto = require('crypto');
const logger = require('../../utils/logger');
const gameRepo = require('./game.repository');

const RoundStatus = {
  CREATED: 'CREATED',
  BETTING_OPEN: 'BETTING_OPEN',
  BETTING_CLOSED: 'BETTING_CLOSED',
  ROLLING: 'ROLLING',
  RESULT: 'RESULT',
  SETTLING: 'SETTLING',
  SETTLED: 'SETTLED',
};

const BetTypes = {
  DOWN: 'DOWN',   // Sum 2..6
  SEVEN: 'SEVEN', // Sum 7
  UP: 'UP',       // Sum 8..12
};

const PayoutMultipliers = {
  [BetTypes.DOWN]: 2.0,
  [BetTypes.SEVEN]: 5.0,
  [BetTypes.UP]: 2.0,
};

class SevenUpDownEngine {
  constructor() {
    this.currentRound = null;
    this.roundCounter = 1;
  }

  // Create New Round & Persist in PostgreSQL
  async createRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roundId = `7ud_r_${Date.now()}_${this.roundCounter++}`;

    this.currentRound = {
      roundId,
      gameId: 'seven_up_down',
      status: RoundStatus.CREATED,
      serverSeedHash,
      serverSeed, // Secret until result reveal
      dice1: null,
      dice2: null,
      diceSum: null,
      winningBetType: null,
      createdAt: new Date().toISOString(),
      bettingClosedAt: null,
      endedAt: null,
    };

    // Try DB persistence (graceful fallback for testing without live DB)
    try {
      await gameRepo.createRoundInDb(roundId, this.roundCounter, serverSeed, serverSeedHash);
    } catch (err) {
      logger.error('Failed to persist new round in PostgreSQL DB', { roundId, error: err.message });
      throw err;
    }

    logger.info('New 7 Up Down round created', { roundId, status: this.currentRound.status });
    return this.currentRound;
  }

  // Open Betting Window
  async openBetting() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.CREATED) {
      throw new Error('Cannot open betting: invalid round state');
    }
    this.currentRound.status = RoundStatus.BETTING_OPEN;

    try {
      await gameRepo.updateRoundInDb(this.currentRound.roundId, RoundStatus.BETTING_OPEN);
    } catch (err) {
      logger.error('Failed to update round state to BETTING_OPEN in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }

    logger.info('7 Up Down betting window opened', { roundId: this.currentRound.roundId });
    return this.currentRound;
  }

  // Place Bet with Atomic PostgreSQL Wallet Debit + DB Idempotency
  async placeBet({ userId, betType, stakePaise, idempotencyKey }) {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) {
      throw new Error('Betting is closed for current round');
    }

    if (!Object.values(BetTypes).includes(betType)) {
      throw new Error(`Invalid bet type: ${betType}. Must be DOWN, SEVEN, or UP`);
    }

    if (!stakePaise || stakePaise < 1000) {
      throw new Error('Minimum bet stake is ₹10 (1000 paise)');
    }

    return await gameRepo.placeBetInDb({
      userId,
      roundId: this.currentRound.roundId,
      betType,
      stakePaise,
      idempotencyKey,
    });
  }

  // Close Betting Window & Roll Dice
  async closeBettingAndRoll() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.BETTING_OPEN) {
      throw new Error('Cannot roll: round is not in BETTING_OPEN state');
    }

    this.currentRound.status = RoundStatus.BETTING_CLOSED;
    this.currentRound.bettingClosedAt = new Date().toISOString();

    // Secure Random Dice Roll (1 to 6)
    const dice1 = crypto.randomInt(1, 7);
    const dice2 = crypto.randomInt(1, 7);
    const diceSum = dice1 + dice2;

    let winningBetType = BetTypes.SEVEN;
    if (diceSum < 7) {
      winningBetType = BetTypes.DOWN;
    } else if (diceSum > 7) {
      winningBetType = BetTypes.UP;
    }

    this.currentRound.status = RoundStatus.RESULT;
    this.currentRound.dice1 = dice1;
    this.currentRound.dice2 = dice2;
    this.currentRound.diceSum = diceSum;
    this.currentRound.winningBetType = winningBetType;

    try {
      await gameRepo.updateRoundInDb(
        this.currentRound.roundId,
        RoundStatus.RESULT,
        dice1,
        dice2,
        diceSum,
        winningBetType
      );
    } catch (err) {
      logger.error('Failed to update round result in PostgreSQL DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }

    logger.info('7 Up Down dice roll complete', {
      roundId: this.currentRound.roundId,
      dice1,
      dice2,
      diceSum,
      winningBetType,
    });

    return this.currentRound;
  }

  // Settle Round Bets with PostgreSQL Wallet Credit
  async settleRound() {
    if (!this.currentRound || this.currentRound.status !== RoundStatus.RESULT) {
      throw new Error('Cannot settle: result not generated');
    }

    this.currentRound.status = RoundStatus.SETTLING;
    let settlements = [];

    try {
      settlements = await gameRepo.settleRoundInDb(this.currentRound.roundId, this.currentRound.winningBetType);
      this.currentRound.status = RoundStatus.SETTLED;
      this.currentRound.endedAt = new Date().toISOString();
    } catch (err) {
      this.currentRound.status = 'SETTLEMENT_FAILED';
      logger.error('Round settlement failed in DB', { roundId: this.currentRound.roundId, error: err.message });
      throw err;
    }

    logger.info('7 Up Down round settled', {
      roundId: this.currentRound.roundId,
      winningType: this.currentRound.winningBetType,
    });

    return {
      round: this.currentRound,
      settlements,
    };
  }
}

module.exports = {
  SevenUpDownEngine,
  RoundStatus,
  BetTypes,
  PayoutMultipliers,
};
